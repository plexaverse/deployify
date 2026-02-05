import { config } from '@/lib/config';
import { updateDeployment, updateProject } from '@/lib/db';
import { getBuildStatus, mapBuildStatusToDeploymentStatus, getCloudRunServiceUrl } from '@/lib/gcp/cloudbuild';
import { getService } from '@/lib/gcp/cloudrun';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import { sendWebhookNotification } from '@/lib/webhooks';
import { trackDeployment } from '@/lib/billing/tracker';
import { sendEmail } from '@/lib/email/client';

// Poll Cloud Build status and update deployment
export async function pollBuildStatus(
    deploymentId: string,
    projectId: string,
    projectSlug: string,
    buildId: string,
    projectRegion?: string | null,
    webhookUrl?: string | null,
    projectName?: string,
    userEmail?: string | null,
    emailNotifications?: boolean
) {
    const maxPolls = 60; // 30 minutes max (30s intervals)
    let pollCount = 0;

    // Determine effective region for URL construction
    const region = projectRegion || config.gcp.region;

    const poll = async () => {
        pollCount++;
        if (pollCount > maxPolls) {
            const errorMessage = 'Build timed out';
            await updateDeployment(deploymentId, {
                status: 'error',
                errorMessage: errorMessage,
            });

            if (webhookUrl && projectName) {
                const message = `🚨 **Build Timed Out** for project **${projectName}**`;
                await sendWebhookNotification(webhookUrl, {
                    content: message,
                    text: message,
                });
            }

            if (emailNotifications && userEmail && projectName) {
                await sendEmail({
                    to: userEmail,
                    subject: `Deployment Failed: ${projectName}`,
                    html: `<p>Your deployment for <strong>${projectName}</strong> timed out.</p>`,
                });
            }
            return;
        }

        try {
            const { status, startTime, finishTime } = await getBuildStatus(buildId, projectRegion);
            const deploymentStatus = mapBuildStatusToDeploymentStatus(status);

            if (status === 'SUCCESS') {
                // Build succeeded - get the service URL
                const serviceName = `dfy-${projectSlug}`.substring(0, 63);
                const serviceUrl = await getCloudRunServiceUrl(serviceName, projectRegion);

                // Fetch latest revision
                let latestRevision: string | undefined;
                try {
                    const accessToken = await getGcpAccessToken();
                    const service = await getService(serviceName, accessToken, projectRegion);
                    if (service) {
                        latestRevision = service.latestRevision;
                    }
                } catch (e) {
                    console.error('Failed to fetch service revision:', e);
                }

                // Calculate build duration
                let buildDurationMs = 0;
                if (startTime && finishTime) {
                    const start = new Date(startTime).getTime();
                    const end = new Date(finishTime).getTime();
                    buildDurationMs = end - start;
                }

                await updateDeployment(deploymentId, {
                    status: 'ready',
                    url: serviceUrl || `https://${serviceName}-853384839522.${region}.run.app`,
                    readyAt: new Date(),
                    cloudRunRevision: latestRevision,
                    buildDurationMs,
                });

                // Track deployment usage
                await trackDeployment(projectId, buildDurationMs);

                if (serviceUrl) {
                    await updateProject(projectId, {
                        productionUrl: serviceUrl,
                    });
                }

                // Send Email Notification
                if (emailNotifications && userEmail && projectName) {
                    await sendEmail({
                        to: userEmail,
                        subject: `Deployment Success: ${projectName}`,
                        html: `
                            <h2>Deployment Successful!</h2>
                            <p>Your project <strong>${projectName}</strong> has been successfully deployed.</p>
                            <p><a href="${serviceUrl}">Visit your app</a></p>
                            <p>Duration: ${Math.round(buildDurationMs / 1000)}s</p>
                        `,
                    });
                }

            } else if (status === 'FAILURE' || status === 'TIMEOUT' || status === 'CANCELLED') {
                const errorMessage = `Build ${status.toLowerCase()}`;
                await updateDeployment(deploymentId, {
                    status: deploymentStatus,
                    errorMessage: errorMessage,
                });

                if (webhookUrl && projectName) {
                    const message = `🚨 **Build ${status}** for project **${projectName}**\n\nStatus: ${status}`;
                    await sendWebhookNotification(webhookUrl, {
                        content: message,
                        text: message,
                    });
                }

                if (emailNotifications && userEmail && projectName) {
                    await sendEmail({
                        to: userEmail,
                        subject: `Deployment Failed: ${projectName}`,
                        html: `
                            <h2>Deployment Failed</h2>
                            <p>Your deployment for <strong>${projectName}</strong> failed with status: ${status}.</p>
                            <p>Error: ${errorMessage}</p>
                        `,
                    });
                }
            } else {
                // Still building - update status and continue polling
                await updateDeployment(deploymentId, {
                    status: deploymentStatus,
                });

                // Poll again in 30 seconds
                setTimeout(poll, 30000);
            }
        } catch (e) {
            console.error('Error polling build status:', e);
            // Continue polling on error
            setTimeout(poll, 30000);
        }
    };

    // Start polling after 10 seconds
    setTimeout(poll, 10000);
}

// Simulate deployment for local development
export async function simulateDeployment(
    deploymentId: string,
    projectId: string,
    projectSlug: string,
    projectName?: string,
    userEmail?: string | null,
    emailNotifications?: boolean
) {
    // Phase 1: Building (after 2 seconds)
    setTimeout(async () => {
        try {
            await updateDeployment(deploymentId, {
                status: 'building',
            });
        } catch (e) {
            console.error('Failed to update to building:', e);
        }
    }, 2000);

    // Phase 2: Deploying (after 5 seconds)
    setTimeout(async () => {
        try {
            await updateDeployment(deploymentId, {
                status: 'deploying',
            });
        } catch (e) {
            console.error('Failed to update to deploying:', e);
        }
    }, 5000);

    // Phase 3: Ready (after 8 seconds)
    setTimeout(async () => {
        try {
            // Use project region or fall back to default
            const mockUrl = `https://dfy-${projectSlug}-853384839522.${config.gcp.region}.run.app`;

            await updateDeployment(deploymentId, {
                status: 'ready',
                url: mockUrl,
                readyAt: new Date(),
                buildDurationMs: 8000,
                cloudRunRevision: `dfy-${projectSlug}-00001-sim`,
            });

            await updateProject(projectId, {
                productionUrl: mockUrl,
            });

            // Track deployment usage (simulation)
            await trackDeployment(projectId, 8000);

            // Simulate Email
            if (emailNotifications && userEmail && projectName) {
                console.log(`[Simulation] Sending success email to ${userEmail} for ${projectName}`);
                await sendEmail({
                    to: userEmail,
                    subject: `Deployment Success: ${projectName}`,
                    html: `<p>Simulation: Deployment succeeded for ${projectName}</p>`
                });
            }

        } catch (e) {
            console.error('Failed to update to ready:', e);
        }
    }, 8000);
}
