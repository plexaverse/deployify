import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import PDFDocument from 'pdfkit';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const body = await request.json();
        const { results, query, storageName, storageType } = body;

        if (!results || !Array.isArray(results) || results.length === 0) {
            return NextResponse.json({ error: 'No results to export' }, { status: 400 });
        }

        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));

        // Title and Header Info
        doc.fontSize(20).fillColor('#6366f1').font('Helvetica-Bold').text('DEPLOYIFY DATA LAB REPORT', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(8).fillColor('#666666').font('Helvetica').text('SECURE CLOUD INFRASTRUCTURE DATA EXPORT', { align: 'center', characterSpacing: 1 });
        doc.moveDown(2);

        // Metadata Box
        const metadataY = doc.y;
        doc.rect(30, metadataY, doc.page.width - 60, 60).fillAndStroke('#f9fafb', '#e5e7eb');
        doc.fillColor('#000000');

        doc.fontSize(9).font('Helvetica-Bold').text('PROJECT ID:', 40, metadataY + 10).font('Helvetica').text(id.toUpperCase(), 120, metadataY + 10);
        doc.font('Helvetica-Bold').text('STORAGE:', 40, metadataY + 25).font('Helvetica').text(`${storageName.toUpperCase()} (${storageType.toUpperCase()})`, 120, metadataY + 25);
        doc.font('Helvetica-Bold').text('EXPORT DATE:', 40, metadataY + 40).font('Helvetica').text(new Date().toLocaleString().toUpperCase(), 120, metadataY + 40);

        doc.moveDown(4);

        // Query Section
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('EXECUTED QUERY:');
        doc.moveDown(0.5);
        const queryY = doc.y;
        doc.rect(30, queryY, doc.page.width - 60, 40).fill('#111827');
        doc.fillColor('#ffffff').fontSize(8).font('Courier').text(query || 'N/A', 40, queryY + 10, { width: doc.page.width - 80 });

        doc.moveDown(4);

        // Results Table
        doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold').text(`QUERY RESULTS (${results.length} ROWS):`);
        doc.moveDown(1);

        const columns = Object.keys(results[0]);
        const startX = 30;
        const usableWidth = doc.page.width - 60;
        const colWidth = usableWidth / columns.length;

        // Draw Table Header
        let currentY = doc.y;
        doc.rect(startX, currentY, usableWidth, 20).fill('#f3f4f6');
        doc.fillColor('#374151').fontSize(7).font('Helvetica-Bold');

        columns.forEach((col, i) => {
            doc.text(col.toUpperCase(), startX + (i * colWidth) + 5, currentY + 6, {
                width: colWidth - 10,
                lineBreak: false,
                ellipsis: true
            });
        });

        doc.moveDown(1.5);

        // Draw Rows
        doc.fillColor('#4b5563').fontSize(7).font('Helvetica');
        results.forEach((row, rowIndex) => {
            // Check if we need a new page
            if (doc.y > doc.page.height - 50) {
                doc.addPage();
                currentY = 30;

                // Redraw Header on new page
                doc.rect(startX, currentY, usableWidth, 20).fill('#f3f4f6');
                doc.fillColor('#374151').fontSize(7).font('Helvetica-Bold');
                columns.forEach((col, i) => {
                    doc.text(col.toUpperCase(), startX + (i * colWidth) + 5, currentY + 6, {
                        width: colWidth - 10,
                        lineBreak: false,
                        ellipsis: true
                    });
                });
                doc.moveDown(1.5);
                doc.fillColor('#4b5563').fontSize(7).font('Helvetica');
            }

            const rowY = doc.y;
            // Alternating row background
            if (rowIndex % 2 === 1) {
                doc.rect(startX, rowY - 2, usableWidth, 12).fill('#f9fafb');
                doc.fillColor('#4b5563');
            }

            columns.forEach((col, i) => {
                const val = row[col];
                const text = typeof val === 'object' ? JSON.stringify(val) : String(val);
                doc.text(text, startX + (i * colWidth) + 5, rowY, {
                    width: colWidth - 10,
                    height: 10,
                    ellipsis: true
                });
            });
            doc.moveDown(1.2);
        });

        // Footer on each page
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(6).fillColor('#9ca3af').text(
                `CONFIDENTIAL - DEPLOYIFY MANAGED INFRASTRUCTURE - PAGE ${i + 1} OF ${pages.count}`,
                startX,
                doc.page.height - 20,
                { align: 'center' }
            );
        }

        return new Promise((resolve, reject) => {
            doc.on('end', () => {
                try {
                    const pdfBuffer = Buffer.concat(chunks);
                    resolve(new NextResponse(pdfBuffer, {
                        headers: {
                            'Content-Type': 'application/pdf',
                            'Content-Disposition': `attachment; filename="datalab-report-${id}.pdf"`
                        }
                    }));
                } catch (err) {
                    reject(err);
                }
            });
            doc.on('error', reject);
            doc.end();
        });

    } catch (error) {
        console.error('PDF Export failed:', error);
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
    }
}
