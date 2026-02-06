import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getInvoiceById, generateInvoicePDF } from '@/lib/billing/invoices';
import { securityHeaders } from '@/lib/security';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();
        const { id } = await params;

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: securityHeaders }
            );
        }

        const invoice = await getInvoiceById(id);

        if (!invoice) {
            return NextResponse.json(
                { error: 'Invoice not found' },
                { status: 404, headers: securityHeaders }
            );
        }

        if (invoice.userId !== session.user.id) {
             return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403, headers: securityHeaders }
            );
        }

        const pdfBuffer = await generateInvoicePDF(invoice);

        return new NextResponse(new Blob([new Uint8Array(pdfBuffer)]), {
            headers: {
                ...securityHeaders,
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
            },
        });

    } catch (error) {
        console.error('Error generating invoice PDF:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: securityHeaders }
        );
    }
}
