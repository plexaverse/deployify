import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUserById } from '@/lib/db';
import { TIERS, TierType } from '@/lib/billing/tiers';
import { createOrder } from '@/lib/billing/payments';
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

        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            console.error('Razorpay keys are missing');
            return NextResponse.json(
                { error: 'Payment gateway not configured' },
                { status: 503, headers: securityHeaders }
            );
        }

        const body = await req.json();
        const { tierId } = body;

        if (!tierId) {
            return NextResponse.json(
                { error: 'Missing tierId' },
                { status: 400, headers: securityHeaders }
            );
        }

        const tier = TIERS[tierId as TierType];
        if (!tier) {
            return NextResponse.json(
                { error: 'Invalid tierId' },
                { status: 400, headers: securityHeaders }
            );
        }

        if (tier.id === 'free') {
            return NextResponse.json(
                { error: 'Cannot checkout for free tier' },
                { status: 400, headers: securityHeaders }
            );
        }

        // Razorpay expects amount in paise (multiply by 100)
        // Assuming price is in INR for Razorpay
        const amount = tier.price * 100;

        const user = await getUserById(session.user.id);

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404, headers: securityHeaders }
            );
        }

        const order = await createOrder(
            amount,
            'INR',
            `receipt_${user.id}_${Date.now()}`,
            { userId: user.id, tierId: tier.id }
        );

        return NextResponse.json(
            {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: process.env.RAZORPAY_KEY_ID
            },
            { headers: securityHeaders }
        );

    } catch (error) {
        console.error('Checkout error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: securityHeaders }
        );
    }
}
