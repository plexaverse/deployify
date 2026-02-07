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
            case 'payment.captured': {
                const payment = event.payload.payment.entity;
                const orderId = payment.order_id;
                // const amount = payment.amount;
                // const email = payment.email;

                // Get userId and tierId from notes
                const notes = payment.notes;
                const userId = notes?.userId;
                const tierId = notes?.tierId;

                if (userId && tierId) {
                    console.log(`Processing upgrade for user ${userId} to tier ${tierId}`);

                    // Update user subscription
                    // We need to import updateUser/getUserById but we can't easily import in this file structure if it causes circular deps or other issues.
                    // Assuming standard imports work.

                    // Dynamic import to avoid potential issues if any, or just standard import at top (I'll add imports at top in next step if needed, but for now assuming global scope/imports)
                    // Actually, let's just use the db functions directly.

                    const { updateUser } = await import('@/lib/db');

                    await updateUser(userId, {
                        subscription: {
                            tier: tierId,
                            status: 'active',
                            currentPeriodStart: new Date(),
                            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                            razorpaySubscriptionId: orderId, // Using orderId as subId for one-time payments for now
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
