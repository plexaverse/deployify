import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDeploymentById, updateDeployment, removeAliasFromOtherDeployments } from '@/lib/db';
import { checkProjectAccess } from '@/middleware/rbac';
import { securityHeaders } from '@/lib/security';
import { updateTrafficTag, getProductionServiceName } from '@/lib/gcp/cloudrun';
import { getGcpAccessToken, isRunningOnGCP } from '@/lib/gcp/auth';

interface RouteParams {
    params: Promise<{ id: string; deployId: string }>;
}

const ALIAS_REGEX = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id, deployId } = await params;

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: securityHeaders });
        }

        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status, headers: securityHeaders });
        }

        const { project } = access;

        const deployment = await getDeploymentById(deployId);
        if (!deployment || deployment.projectId !== id) {
             return NextResponse.json({ error: 'Deployment not found' }, { status: 404, headers: securityHeaders });
        }

        if (!deployment.cloudRunRevision) {
             return NextResponse.json({ error: 'Deployment does not have a Cloud Run revision' }, { status: 400, headers: securityHeaders });
        }

        const body = await request.json();
        const { alias } = body;

        if (!alias || typeof alias !== 'string') {
            return NextResponse.json({ error: 'Alias is required' }, { status: 400, headers: securityHeaders });
        }

        if (!ALIAS_REGEX.test(alias)) {
            return NextResponse.json({ error: 'Invalid alias format. Must be lowercase alphanumeric with dashes.' }, { status: 400, headers: securityHeaders });
        }

        if (alias.length > 63) {
            return NextResponse.json({ error: 'Alias is too long (max 63 chars)' }, { status: 400, headers: securityHeaders });
        }

        // Apply to Cloud Run
        if (isRunningOnGCP()) {
            try {
                const accessToken = await getGcpAccessToken();
                const serviceName = getProductionServiceName(project.slug);
                await updateTrafficTag(serviceName, alias, deployment.cloudRunRevision, accessToken, project.region);
            } catch (e) {
                console.error('Failed to update traffic tag:', e);
                return NextResponse.json({ error: 'Failed to update Cloud Run traffic tag' }, { status: 500, headers: securityHeaders });
            }
        } else {
            console.log(`[Simulation] Setting traffic tag '${alias}' for revision '${deployment.cloudRunRevision}'`);
        }

        // Remove alias from other deployments to ensure uniqueness in DB
        await removeAliasFromOtherDeployments(project.id, alias, deployId);

        // Update DB
        const currentAliases = deployment.aliases || [];
        if (!currentAliases.includes(alias)) {
            await updateDeployment(deployId, {
                aliases: [...currentAliases, alias]
            });
        }

        return NextResponse.json({ success: true, alias }, { status: 200, headers: securityHeaders });

    } catch (error) {
        console.error('Error adding alias:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: securityHeaders });
    }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id, deployId } = await params;

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: securityHeaders });
        }

        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status, headers: securityHeaders });
        }

        const { project } = access;

        const deployment = await getDeploymentById(deployId);
        if (!deployment || deployment.projectId !== id) {
             return NextResponse.json({ error: 'Deployment not found' }, { status: 404, headers: securityHeaders });
        }

        const { searchParams } = new URL(request.url);
        const alias = searchParams.get('alias');

        if (!alias) {
             return NextResponse.json({ error: 'Alias is required' }, { status: 400, headers: securityHeaders });
        }

        // Apply to Cloud Run (remove tag)
        if (isRunningOnGCP()) {
            try {
                const accessToken = await getGcpAccessToken();
                const serviceName = getProductionServiceName(project.slug);
                // Pass cloudRunRevision as expectedRevision to ensure we only remove the tag if it points to this deployment
                await updateTrafficTag(serviceName, alias, null, accessToken, project.region, deployment.cloudRunRevision);
            } catch (e) {
                console.error('Failed to remove traffic tag:', e);
                return NextResponse.json({ error: 'Failed to remove Cloud Run traffic tag' }, { status: 500, headers: securityHeaders });
            }
        } else {
             console.log(`[Simulation] Removing traffic tag '${alias}'`);
        }

        // Update DB
        const currentAliases = deployment.aliases || [];
        if (currentAliases.includes(alias)) {
            await updateDeployment(deployId, {
                aliases: currentAliases.filter(a => a !== alias)
            });
        }

        return NextResponse.json({ success: true }, { status: 200, headers: securityHeaders });

    } catch (error) {
        console.error('Error removing alias:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: securityHeaders });
    }
}
