import { config } from '@/lib/config';
import { updateDeployment, updateProject } from '@/lib/db';
import { getBuildStatus, mapBuildStatusToDeploymentStatus, getCloudRunServiceUrl } from '@/lib/gcp/cloudbuild';
import { getService } from '@/lib/gcp/cloudrun';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import { sendWebhookNotification } from '@/lib/webhooks';
import { trackDeployment } from '@/lib/billing/tracker';
import { sendEmail } from '@/lib/email/client';
import { runLighthouseAudit } from '@/lib/performance/lighthouse';
import { createPRComment, createDeploymentStatus } from '@/lib/github';
import { parseRepoFullName, formatDuration } from '@/lib/utils';

// Poll Cloud Build status and update deployment
export async function pollBuildStatus(
    deploymentId: string,
    projectId: string,
    projectSlug: string,
    buildId: string,
    commitSha: string,
    projectRegion?: string | null,
    webhookUrl?: string | null,
    projectName?: string,
    userEmail?: string | null,
    emailNotifications?: boolean,
    repoFullName?: string,
    pullRequestNumber?: number,
    accessToken?: string | null
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

            if (webhookUrl) {
                const name = projectName || projectSlug;
                const message = `🚨 **Build Timed Out** for project **${name}**`;
                await sendWebhookNotification(webhookUrl, {
                    content: message,
                    text: message,
                });
            }

            if (emailNotifications && userEmail) {
                const name = projectName || projectSlug;
                await sendEmail({
                    to: userEmail,
                    subject: `Deployment Failed: ${name}`,
                    html: `<p>Your deployment for <strong>${name}</strong> timed out.</p>`,
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
                    const gcpAccessToken = await getGcpAccessToken();
                    const service = await getService(serviceName, gcpAccessToken, projectRegion);
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

                const effectiveUrl = serviceUrl || `https://${serviceName}-${config.gcp.projectNumber}.${region}.run.app`;

                await updateDeployment(deploymentId, {
                    status: 'ready',
                    url: effectiveUrl,
                    readyAt: new Date(),
                    cloudRunRevision: latestRevision,
                    buildDurationMs,
                });

                // Update GitHub deployment status
                if (accessToken && repoFullName && commitSha) {
                    const { owner, repo } = parseRepoFullName(repoFullName);
                    createDeploymentStatus(
                        accessToken,
                        owner,
                        repo,
                        commitSha,
                        'success',
                        effectiveUrl,
                        'Deployment successful'
                    ).catch(console.error);
                }

                // Track deployment usage
                await trackDeployment(projectId, buildDurationMs);

                await updateProject(projectId, {
                    productionUrl: effectiveUrl,
                });

                // Run Lighthouse audit if possible
                if (effectiveUrl) {
                    try {
                        const metrics = await runLighthouseAudit(effectiveUrl);
                        await updateDeployment(deploymentId, {
                            performanceMetrics: metrics
                        });
                    } catch (auditError) {
                        console.error('Lighthouse audit failed:', auditError);
                    }
                }

                // Send Email Notification
                if (emailNotifications && userEmail) {
                    const name = projectName || projectSlug;
                    await sendEmail({
                        to: userEmail,
                        subject: `Deployment Success: ${name}`,
                        html: `
                            <h2>Deployment Successful!</h2>
                            <p>Your project <strong>${name}</strong> has been successfully deployed.</p>
                            <p><a href="${effectiveUrl}">Visit your app</a></p>
                            <p>Duration: ${Math.round(buildDurationMs / 1000)}s</p>
                        `,
                    });
                }

                // Send PR Comment if applicable
                if (pullRequestNumber && repoFullName && accessToken) {
                    const { owner, repo } = parseRepoFullName(repoFullName);
                    const commentBody = `
### 🚀 Deploy Preview Ready!

| Project | Status | Duration |
| :--- | :--- | :--- |
| **${projectName || projectSlug}** | ✅ Ready | ${formatDuration(buildDurationMs)} |

[**Visit Preview**](${effectiveUrl})

> Built with Deployify
                    `.trim();

                    await createPRComment(accessToken, owner, repo, pullRequestNumber, commentBody);
                }

            } else if (status === 'FAILURE' || status === 'TIMEOUT' || status === 'CANCELLED') {
                const errorMessage = `Build ${status.toLowerCase()}`;
                await updateDeployment(deploymentId, {
                    status: deploymentStatus,
                    errorMessage: errorMessage,
                });

                // Update GitHub deployment status
                if (accessToken && repoFullName && commitSha) {
                    const { owner, repo } = parseRepoFullName(repoFullName);
                    createDeploymentStatus(
                        accessToken,
                        owner,
                        repo,
                        commitSha,
                        'failure',
                        undefined,
                        `Deployment failed: ${errorMessage}`
                    ).catch(console.error);
                }

                if (webhookUrl) {
                    const name = projectName || projectSlug;
                    const message = `🚨 **Build ${status}** for project **${name}**\n\nStatus: ${status}`;
                    await sendWebhookNotification(webhookUrl, {
                        content: message,
                        text: message,
                    });
                }

                if (emailNotifications && userEmail) {
                    const name = projectName || projectSlug;
                    await sendEmail({
                        to: userEmail,
                        subject: `Deployment Failed: ${name}`,
                        html: `
                            <h2>Deployment Failed</h2>
                            <p>Your deployment for <strong>${name}</strong> failed with status: ${status}.</p>
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

    // Initial status update to GitHub if possible
    if (accessToken && repoFullName && commitSha) {
        const { owner, repo } = parseRepoFullName(repoFullName);
        createDeploymentStatus(accessToken, owner, repo, commitSha, 'pending', undefined, 'Deployment started').catch(console.error);
    }

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
            const mockUrl = `https://dfy-${projectSlug}-${config.gcp.projectNumber}.${config.gcp.region}.run.app`;

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

            // Simulate Lighthouse audit
            try {
                await updateDeployment(deploymentId, {
                    performanceMetrics: {
                        performanceScore: 0.95,
                        lcp: 1200,
                        cls: 0.05,
                        fid: 10,
                        tbt: 50
                    }
                });
            } catch (e) {
                console.error('Failed to update mock metrics:', e);
            }

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
