import { fetchWithSsrfGuard, ProxyTargetBlockedError } from '@/lib/security/ssrf';

export interface WebhookPayload {
    content?: string;
    text?: string;
    embeds?: Array<Record<string, unknown>>;
    [key: string]: unknown;
}

/**
 * POST a notification to a project's configured webhook URL.
 *
 * SECURITY: `url` is a tenant-supplied project field (`project.webhookUrl`) and this runs
 * server-side inside the platform GCP project, so an unguarded fetch is authenticated blind
 * SSRF — `http://169.254.169.254/...` reaches the metadata server, `http://10.x` reaches the
 * VPC. Routed through fetchWithSsrfGuard, which resolves the host, rejects loopback /
 * link-local / private ranges, and re-checks on every redirect hop.
 */
export async function sendWebhookNotification(url: string, payload: WebhookPayload): Promise<void> {
    if (!url) return;

    try {
        const response = await fetchWithSsrfGuard(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error(`Failed to send webhook notification: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        if (error instanceof ProxyTargetBlockedError) {
            console.error(`[Webhook SSRF] Refused to call ${url}: ${error.message}`);
            return;
        }
        console.error('Error sending webhook notification:', error);
    }
}
