import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/billing/payments';
import { config } from '@/lib/config';

export async function POST(req: Request) {
    try {
        const body = await req.text();
        const signature = req.headers.get('x-razorpay-signature');

        if (!signature) {
            return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
        }

        // Verify webhook signature
        const isValid = verifyWebhookSignature(
            body,
            signature,
            config.billing.razorpay.keySecret
        );

        if (!isValid) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
        }

        const event = JSON.parse(body);

        // Handle Razorpay events
        switch (event.event) {
            case 'payment.captured':
                // Handle payment success
                console.log('Payment captured:', event.payload.payment.entity.id);
                // TODO: Update user subscription in database
                break;
            case 'subscription.charged':
                 // Handle subscription renewal
                 console.log('Subscription charged:', event.payload.subscription.entity.id);
                 break;
            default:
                console.log('Unhandled event:', event.event);
        }

        return NextResponse.json({ status: 'ok' });

    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
