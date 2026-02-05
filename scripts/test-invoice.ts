
// Set dummy env vars for config
process.env.GITHUB_CLIENT_ID = 'dummy';
process.env.GITHUB_CLIENT_SECRET = 'dummy';
process.env.GITHUB_WEBHOOK_SECRET = 'dummy';
process.env.GCP_PROJECT_ID = 'dummy';
process.env.JWT_SECRET = 'dummy';
process.env.STRIPE_SECRET_KEY = 'dummy';
process.env.RESEND_API_KEY = 'dummy';

import fs from 'fs';
import path from 'path';
import { generateInvoicePDF, type Invoice } from '@/lib/billing/invoices';

async function main() {
    const invoice: Invoice = {
        userId: 'user-123',
        invoiceNumber: 'INV-2023-001',
        date: new Date(),
        userDetails: {
            name: 'John Doe',
            email: 'john@example.com',
            address: '123 Test Lane, Mumbai, MH, 400001'
        },
        items: [
            { description: 'Pro Plan Subscription', quantity: 1, unitPrice: 20.00, total: 20.00 },
            { description: 'Extra Build Minutes', quantity: 5, unitPrice: 0.10, total: 0.50 }
        ],
        subtotal: 20.50,
        gstRate: 0.18,
        gstAmount: 3.69,
        total: 24.19,
        status: 'pending'
    };

    console.log('Generating PDF...');
    try {
        const pdfBuffer = await generateInvoicePDF(invoice);
        const outputPath = path.join(process.cwd(), 'test-invoice.pdf');
        fs.writeFileSync(outputPath, pdfBuffer);
        console.log(`Invoice saved to ${outputPath}`);
    } catch (error) {
        console.error('Error generating invoice:', error);
        process.exit(1);
    }
}

main();
