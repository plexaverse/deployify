import { Resend } from 'resend';
import { config } from '@/lib/config';

// Initialize Resend client lazily
let resend: Resend | null = null;

function getResendClient() {
    if (resend) return resend;

    // Only initialize if key is present
    if (config.email.resendApiKey && config.email.resendApiKey !== 'mock') {
        try {
            resend = new Resend(config.email.resendApiKey);
        } catch (e) {
            console.warn('Failed to initialize Resend client:', e);
        }
    }
    return resend;
}

export interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
    // Skip email sending if simulating locally and no API key (though config enforces it)
    if (!config.email.resendApiKey || config.email.resendApiKey === 'mock') {
        console.log(`[Email Simulation] To: ${to}, Subject: ${subject}`);
        return { success: true, id: 'mock-email-id' };
    }

    const client = getResendClient();
    if (!client) {
        // Fallback for when key is missing but logic reached here
        console.error('Resend API key is missing or invalid. Cannot send email.');
        return { success: false, error: 'Resend API key missing' };
    }

    try {
        const { data, error } = await client.emails.send({
            from: config.email.fromAddress,
            to,
            subject,
            html,
        });

        if (error) {
            console.error('Resend API error:', error);
            return { success: false, error };
        }

        return { success: true, data };
    } catch (error) {
        console.error('Failed to send email:', error);
        return { success: false, error };
    }
}
