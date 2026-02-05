import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUserById, updateUser } from '@/lib/db';
import { getTier, TierType, TIERS } from '@/lib/billing/tiers';
import { createCheckoutSession, stripe } from '@/lib/billing/payments';
import { securityHeaders } from '@/lib/security';
import { config } from '@/lib/config';

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

        if (!tier.priceId) {
             return NextResponse.json(
                 { error: 'Price ID not configured for this tier' },
                 { status: 500, headers: securityHeaders }
            );
        }

        let user = await getUserById(session.user.id);

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404, headers: securityHeaders }
            );
        }

        let stripeCustomerId = user.stripeCustomerId;

        // Create Stripe customer if not exists
        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: user.email || undefined,
                name: user.name || undefined,
                metadata: {
                    userId: user.id,
                    githubId: user.githubId.toString(),
                },
            });
            stripeCustomerId = customer.id;
            await updateUser(user.id, { stripeCustomerId });
        }

        const successUrl = `${config.appUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${config.appUrl}/billing?canceled=true`;

        const checkoutSession = await createCheckoutSession(
            stripeCustomerId,
            tier.priceId,
            successUrl,
            cancelUrl
        );

        return NextResponse.json(
            { url: checkoutSession.url },
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
