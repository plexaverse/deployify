import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUserById, updateUser } from '@/lib/db';
import { verifyPaymentSignature } from '@/lib/billing/payments';
import {
    claimOrderPayment,
    corroboratePayment,
    getPaymentCorroborationMode,
    getVerifyTierMode,
    isPaymentFulfilled,
    markOrderFulfilled,
    resolveOrderIntent,
} from '@/lib/billing/order-registry';
import type { TierType } from '@/lib/billing/tiers';
import { securityHeaders } from '@/lib/security';

export async function POST(req: Request) {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const body = await req.json();
        const { orderId, paymentId, signature, tierId } = body;

        if (!orderId || !paymentId || !signature || !tierId) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400, headers: securityHeaders }
            );
        }

        // verifyPaymentSignature handles missing keySecret internally
        const isValid = verifyPaymentSignature(orderId, paymentId, signature);

        if (!isValid) {
            return NextResponse.json(
                { error: 'Invalid payment signature' },
                { status: 400, headers: securityHeaders }
            );
        }

        // The signature only covers `orderId|paymentId` - it says nothing about the tier.
        // Resolve the tier the order was actually created for, server-side.
        const mode = getVerifyTierMode();
        let grantedTier = tierId as TierType;

        if (mode !== 'off') {
            const intent = await resolveOrderIntent(orderId);

            if (!intent) {
                console.error('[Billing] No server-side intent for order', {
                    orderId, mode, claimedTier: tierId, userId: session.user.id
                });
                if (mode === 'enforce') {
                    return NextResponse.json(
                        { error: 'Payment verification failed' },
                        { status: 400, headers: securityHeaders }
                    );
                }
            } else {
                if (intent.userId !== session.user.id) {
                    console.error('[Billing] Order belongs to a different user', {
                        orderId, orderUserId: intent.userId, sessionUserId: session.user.id, mode
                    });
                    if (mode === 'enforce') {
                        return NextResponse.json(
                            { error: 'Payment verification failed' },
                            { status: 400, headers: securityHeaders }
                        );
                    }
                }

                if (intent.tierId !== tierId) {
                    console.error('[Billing] Client tier does not match the paid order', {
                        orderId, claimedTier: tierId, paidTier: intent.tierId, source: intent.source, mode
                    });
                }

                if (mode === 'enforce') {
                    grantedTier = intent.tierId;
                }
            }

            // The signature proves the (order, payment) pair came out of Razorpay
            // checkout - not that money was actually taken, or how much.
            const paymentMode = getPaymentCorroborationMode();

            if (paymentMode !== 'off') {
                const corroboration = await corroboratePayment(orderId, paymentId, intent);

                if (corroboration === 'mismatch' && paymentMode === 'enforce') {
                    return NextResponse.json(
                        { error: 'Payment verification failed' },
                        { status: 400, headers: securityHeaders }
                    );
                }
            }

            const claim = await claimOrderPayment(orderId, paymentId, intent);

            if (claim === 'replay' && mode === 'enforce') {
                // Only a *fulfilled* claim may short-circuit. claimOrderPayment() runs
                // before updateUser(), so a failure in between would otherwise leave a
                // paying customer on 'free' while every retry answered `{success:true}`.
                if (await isPaymentFulfilled(orderId, paymentId)) {
                    // Same payment submitted twice: idempotent success, no second 30-day extension.
                    const currentUser = await getUserById(session.user.id).catch(() => null);
                    const { createSessionToken, setSessionCookie } = await import('@/lib/auth');
                    const replayToken = await createSessionToken(currentUser || session.user, session.accessToken);
                    await setSessionCookie(replayToken);

                    return NextResponse.json({ success: true }, { headers: securityHeaders });
                }

                console.warn('[Billing] Claim exists but was never fulfilled; granting now', {
                    orderId, paymentId, userId: session.user.id
                });
            }
        }

        // Update user subscription
        const updatedSubscription = {
            tier: grantedTier,
            status: 'active' as const,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            razorpaySubscriptionId: orderId, // Using orderId as subscription id for now
        };

        await updateUser(session.user.id, {
            subscription: updatedSubscription
        });

        if (mode !== 'off') {
            // Close the claim -> grant window. Best effort; never throws.
            await markOrderFulfilled(orderId, paymentId, session.user.id, grantedTier);
        }

        // Refresh session token with new subscription data
        const { createSessionToken, setSessionCookie } = await import('@/lib/auth');

        const updatedUser = {
            ...session.user,
            subscription: updatedSubscription
        };

        // We need the original access token to recreate the session
        const newToken = await createSessionToken(updatedUser, session.accessToken);
        await setSessionCookie(newToken);

        return NextResponse.json({ success: true }, { headers: securityHeaders });

    } catch (error) {
        console.error('Verification error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: securityHeaders }
        );
    }
}
