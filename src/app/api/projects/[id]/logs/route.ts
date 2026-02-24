import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { listLogEntries, type LogType } from '@/lib/gcp/logging';
import { getProductionServiceName, getPreviewServiceName } from '@/lib/gcp/cloudrun';
import { securityHeaders } from '@/lib/security';
import { getLatestDeployment } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id } = await params;

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status, headers: securityHeaders }
            );
        }

        const { project } = access;

        const searchParams = request.nextUrl.searchParams;
        const stream = searchParams.get('stream') === 'true';
        const environment = searchParams.get('environment') || 'production';
        const prId = searchParams.get('prId');
        const revision = searchParams.get('revision');
        const logType = (searchParams.get('type') as LogType) || 'runtime';

        let serviceName: string;
        let buildId: string | undefined;

        if (logType === 'build') {
            const latestDeployment = await getLatestDeployment(project.id);
            if (latestDeployment?.cloudBuildId) {
                buildId = latestDeployment.cloudBuildId;
            }
        }

        if (environment === 'preview') {
            if (!prId) {
                return NextResponse.json(
                    { error: 'Missing prId for preview environment' },
                    { status: 400, headers: securityHeaders }
                );
            }
            const prNumber = parseInt(prId, 10);
            if (isNaN(prNumber)) {
                return NextResponse.json(
                    { error: 'Invalid prId' },
                    { status: 400, headers: securityHeaders }
                );
            }
            serviceName = getPreviewServiceName(project.slug, prNumber);
        } else {
            serviceName = getProductionServiceName(project.slug);
        }

        if (stream) {
            // Server-Sent Events implementation
            const encoder = new TextEncoder();

            const customReadable = new ReadableStream({
                async start(controller) {
                    let lastTimestamp = new Date(0).toISOString();
                    // Keep track if we've sent anything yet to decide if we need to fetch initial history differently
                    // or just start filtering by time.
                    // Actually, let's fetch the most recent logs first.

                    try {
                        // Polling loop
                        while (true) {
                            if (request.signal.aborted) {
                                break;
                            }

                            try {
                                // Fetch logs
                                const response = await listLogEntries(
                                    serviceName,
                                    {
                                        pageSize: 100,
                                        revisionName: revision || undefined,
                                        logType,
                                        buildId
                                    }
                                );
                                const entries = response.entries;

                                // Filter entries strictly newer than lastTimestamp
                                const newEntries = entries
                                    .filter(e => e.timestamp > lastTimestamp)
                                    // Sort by timestamp ascending (oldest to newest) for streaming
                                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                                if (newEntries.length > 0) {
                                    for (const entry of newEntries) {
                                        const data = JSON.stringify(entry);
                                        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                                    }
                                    // Update lastTimestamp to the timestamp of the newest entry we just sent
                                    lastTimestamp = newEntries[newEntries.length - 1].timestamp;
                                }
                            } catch (err) {
                                console.error('Error fetching logs in stream:', err);
                                // Send error event but keep trying? Or break?
                                // Let's send an error event and continue, maybe transient.
                                const errorData = JSON.stringify({ error: 'Failed to fetch logs' });
                                controller.enqueue(encoder.encode(`event: error\ndata: ${errorData}\n\n`));
                            }

                            // Wait for 3 seconds before next poll
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        }
                    } catch (err) {
                         console.error('Stream error:', err);
                    } finally {
                        controller.close();
                    }
                }
            });

            return new NextResponse(customReadable, {
                headers: {
                    ...securityHeaders,
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache, no-transform',
                    'Connection': 'keep-alive',
                },
            });
        } else {
            // Standard fetch
            const response = await listLogEntries(
                serviceName,
                {
                    pageSize: 100,
                    revisionName: revision || undefined,
                    logType,
                    buildId
                }
            );
            return NextResponse.json(response, { headers: securityHeaders });
        }

    } catch (error) {
        console.error('Error handling log request:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: securityHeaders }
        );
    }
}
