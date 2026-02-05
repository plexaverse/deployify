import PDFDocument from 'pdfkit';
import { getDb, Collections } from '../firebase';

export interface InvoiceItem {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
}

export interface Invoice {
    id?: string;
    userId: string;
    invoiceNumber: string;
    date: Date;
    userDetails: {
        name: string;
        email: string;
        address?: string;
    };
    items: InvoiceItem[];
    subtotal: number;
    gstRate: number; // e.g., 0.18
    gstAmount: number;
    total: number;
    status: 'paid' | 'pending';
    createdAt?: Date;
}

/**
 * Generates a PDF invoice for the given invoice data.
 * Returns a Promise that resolves to a Buffer containing the PDF data.
 */
export async function generateInvoicePDF(invoice: Invoice): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            resolve(pdfData);
        });

        doc.on('error', (err) => {
            reject(err);
        });

        // Header
        doc.fillColor('#444444')
            .fontSize(20)
            .text('Deployify', 50, 57)
            .fontSize(10)
            .text('Deployify Inc.', 200, 50, { align: 'right' })
            .text('123 Cloud Street', 200, 65, { align: 'right' })
            .text('Tech City, TC 560001', 200, 80, { align: 'right' })
            .moveDown();

        // Invoice Title
        doc.fillColor('#000000')
            .fontSize(20)
            .text('INVOICE', 50, 160);

        // Invoice Metadata
        generateHr(doc, 185);

        const customerInformationTop = 200;

        doc.fontSize(10)
            .text('Invoice Number:', 50, customerInformationTop)
            .font('Helvetica-Bold')
            .text(invoice.invoiceNumber, 150, customerInformationTop)
            .font('Helvetica')
            .text('Invoice Date:', 50, customerInformationTop + 15)
            .text(formatDate(invoice.date), 150, customerInformationTop + 15)
            .text('Balance Due:', 50, customerInformationTop + 30)
            .text(formatCurrency(invoice.total), 150, customerInformationTop + 30)

            .font('Helvetica-Bold')
            .text(invoice.userDetails.name, 300, customerInformationTop)
            .font('Helvetica')
            .text(invoice.userDetails.email, 300, customerInformationTop + 15)
            .text(invoice.userDetails.address || '', 300, customerInformationTop + 30)
            .moveDown();

        generateHr(doc, 252);

        // Table Header
        const invoiceTableTop = 330;

        doc.font('Helvetica-Bold');
        generateTableRow(
            doc,
            invoiceTableTop,
            'Item',
            'Unit Cost',
            'Quantity',
            'Line Total'
        );
        generateHr(doc, invoiceTableTop + 20);
        doc.font('Helvetica');

        // Table Rows
        let i = 0;
        for (i = 0; i < invoice.items.length; i++) {
            const item = invoice.items[i];
            const position = invoiceTableTop + (i + 1) * 30;
            generateTableRow(
                doc,
                position,
                item.description,
                formatCurrency(item.unitPrice),
                item.quantity.toString(),
                formatCurrency(item.total)
            );

            generateHr(doc, position + 20);
        }

        // Totals
        const subtotalPosition = invoiceTableTop + (i + 1) * 30;

        doc.font('Helvetica-Bold');
        generateTableRow(
            doc,
            subtotalPosition,
            '',
            '',
            'Subtotal',
            formatCurrency(invoice.subtotal)
        );

        const gstPosition = subtotalPosition + 20;
        const gstLabel = `GST (${(invoice.gstRate * 100).toFixed(0)}%)`;
        generateTableRow(
            doc,
            gstPosition,
            '',
            '',
            gstLabel,
            formatCurrency(invoice.gstAmount)
        );

        const totalPosition = gstPosition + 25;
        doc.font('Helvetica-Bold');
        generateTableRow(
            doc,
            totalPosition,
            '',
            '',
            'Total',
            formatCurrency(invoice.total)
        );

        // Footer
        doc.fontSize(10)
            .text(
                'Payment is due within 15 days. Thank you for your business.',
                50,
                780,
                { align: 'center', width: 500 }
            );

        doc.end();
    });
}

function generateHr(doc: PDFDocument, y: number) {
    doc.strokeColor('#aaaaaa')
        .lineWidth(1)
        .moveTo(50, y)
        .lineTo(550, y)
        .stroke();
}

function generateTableRow(
    doc: PDFDocument,
    y: number,
    item: string,
    unitCost: string,
    quantity: string,
    lineTotal: string
) {
    doc.fontSize(10)
        .text(item, 50, y)
        .text(unitCost, 280, y, { width: 90, align: 'right' })
        .text(quantity, 370, y, { width: 90, align: 'right' })
        .text(lineTotal, 0, y, { align: 'right' });
}

function formatDate(date: Date) {
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    return year + '/' + month + '/' + day;
}

function formatCurrency(amount: number) {
    return 'INR ' + (amount).toFixed(2);
}

/**
 * Stores the invoice record in Firestore.
 */
export async function createInvoiceRecord(invoice: Invoice): Promise<string> {
    const db = getDb();
    const invoiceRef = await db.collection(Collections.INVOICES).add({
        ...invoice,
        createdAt: new Date(),
        // Ensure date objects are correctly stored if needed, though Firestore SDK handles Date usually.
    });
    return invoiceRef.id;
}
