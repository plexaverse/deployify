export interface WebhookPayload {
    content?: string;
    text?: string;
    embeds?: Array<Record<string, unknown>>;
    [key: string]: unknown;
}

export async function sendWebhookNotification(url: string, payload: WebhookPayload): Promise<void> {
    if (!url) return;

    try {
        const response = await fetch(url, {
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
        console.error('Error sending webhook notification:', error);
    }
}
