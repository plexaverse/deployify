import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateUser } from '@/lib/db';
import { verifyPaymentSignature } from '@/lib/billing/payments';
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

        // Update user subscription
        const updatedSubscription = {
            tier: tierId as 'free' | 'pro' | 'team' | 'enterprise',
            status: 'active' as const,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            razorpaySubscriptionId: orderId, // Using orderId as subscription id for now
        };

        await updateUser(session.user.id, {
            subscription: updatedSubscription
        });

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
