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
        // We pass keySecret which is now string | undefined, verifyWebhookSignature handles undefined
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
            case 'payment.captured': {
                const payment = event.payload.payment.entity;
                const orderId = payment.order_id;

                // Get userId and tierId from notes
                const notes = payment.notes;
                const userId = notes?.userId;
                const tierId = notes?.tierId;

                if (userId && tierId) {
                    console.log(`Processing upgrade for user ${userId} to tier ${tierId}`);
                    const { updateUser } = await import('@/lib/db');

                    await updateUser(userId, {
                        subscription: {
                            tier: tierId as 'free' | 'pro' | 'team' | 'enterprise',
                            status: 'active',
                            currentPeriodStart: new Date(),
                            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                            razorpaySubscriptionId: orderId,
                        }
                    });

                    console.log(`Successfully upgraded user ${userId} to ${tierId}`);
                } else {
                    console.error('Missing userId or tierId in payment notes', { orderId, notes });
                }
                break;
            }
            default:
                console.log('Unhandled event:', event.event);
        }

        return NextResponse.json({ status: 'ok' });

    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
