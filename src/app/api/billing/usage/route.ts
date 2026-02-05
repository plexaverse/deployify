import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUsage } from '@/lib/billing/tracker';
import { getUserById } from '@/lib/db';
import { calculateTierLimits, getTier } from '@/lib/billing/tiers';
import { securityHeaders } from '@/lib/security';

export async function GET() {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const user = await getUserById(session.user.id);

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404, headers: securityHeaders }
            );
        }

        const usage = await getUsage(user.id);
        const limits = calculateTierLimits(user);
        const tier = getTier(user.subscription?.tier);

        return NextResponse.json(
            {
                usage,
                limits,
                tier: {
                    id: tier.id,
                    name: tier.name,
                }
            },
            { headers: securityHeaders }
        );

    } catch (error) {
        console.error('Error fetching billing usage:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: securityHeaders }
        );
    }
}
