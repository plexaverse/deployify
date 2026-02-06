import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listInvoicesForUser } from '@/lib/billing/invoices';
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

        const invoices = await listInvoicesForUser(session.user.id);

        return NextResponse.json(
            { invoices },
            { headers: securityHeaders }
        );

    } catch (error) {
        console.error('Error fetching invoices:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: securityHeaders }
        );
    }
}
