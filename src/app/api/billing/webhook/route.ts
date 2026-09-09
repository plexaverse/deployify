import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/billing/payments';
import { config } from '@/lib/config';
import type { TierType } from '@/lib/billing/tiers';

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

                // SECURITY: `payment.notes` are the PAYMENT entity's notes, not the server-created
                // ORDER's notes. Razorpay Checkout lets the browser attach arbitrary `notes` to the
                // payment, so a caller can pay for a `pro` order while sending tierId 'enterprise'.
                // The tier must come from the server-side order intent recorded at checkout, the
                // same authority /api/billing/verify uses.
                const notes = payment.notes;
                const userId = notes?.userId;
                const claimedTierId = notes?.tierId;

                if (userId && claimedTierId) {
                    const { updateUser } = await import('@/lib/db');
                    const {
                        claimOrderPayment, getVerifyTierMode, isPaymentFulfilled, markOrderFulfilled,
                        resolveOrderIntent
                    } = await import('@/lib/billing/order-registry');

                    // Razorpay redelivers payment.captured on retry. Without the shared
                    // ledger every redelivery pushed currentPeriodEnd out another 30 days.
                    // Ledger failures degrade to "grant anyway" - never to a non-200, which
                    // Razorpay would just retry.
                    const mode = getVerifyTierMode();
                    const ledgerOn = mode !== 'off';

                    // Resolve the tier the order was actually created for.
                    let tierId = claimedTierId;
                    let grantUserId = userId;

                    if (ledgerOn) {
                        const intent = await resolveOrderIntent(orderId);

                        if (!intent) {
                            console.error('[Billing Webhook] No server-side intent for order', {
                                orderId, mode, claimedTier: claimedTierId
                            });
                            if (mode === 'enforce') {
                                // Fail closed on the grant, but still 200 so Razorpay stops retrying.
                                break;
                            }
                        } else {
                            if (intent.tierId !== claimedTierId) {
                                console.error('[Billing Webhook] payment notes tier does not match the paid order', {
                                    orderId, claimedTier: claimedTierId, paidTier: intent.tierId, mode
                                });
                            }
                            if (intent.userId !== userId) {
                                console.error('[Billing Webhook] payment notes userId does not match the order', {
                                    orderId, notesUserId: userId, orderUserId: intent.userId, mode
                                });
                            }
                            if (mode === 'enforce') {
                                tierId = intent.tierId;
                                grantUserId = intent.userId;
                            }
                        }
                    }

                    if (ledgerOn) {
                        const claim = await claimOrderPayment(orderId, payment.id, null);

                        if (claim === 'replay' && await isPaymentFulfilled(orderId, payment.id)) {
                            console.log('[Billing Webhook] payment.captured already applied; skipping', {
                                orderId, paymentId: payment.id
                            });
                            break;
                        }
                    }

                    await updateUser(grantUserId, {
                        subscription: {
                            tier: tierId as 'free' | 'pro' | 'team' | 'enterprise',
                            status: 'active',
                            currentPeriodStart: new Date(),
                            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                            razorpaySubscriptionId: orderId,
                        }
                    });

                    if (ledgerOn) {
                        await markOrderFulfilled(orderId, payment.id, grantUserId, tierId as TierType);
                    }

                } else {
                    console.error('Missing userId or tierId in payment notes', { orderId, notes });
                }
                break;
            }
            default:
        }

        return NextResponse.json({ status: 'ok' });

    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
