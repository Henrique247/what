import PDFDocument from 'pdfkit';

export interface PdfGenerationOptions {
    title: string;
    content: string;
    pageSize?: 'A4' | 'A5' | 'LETTER';
    orientation?: 'portrait' | 'landscape';
    font?: 'Helvetica' | 'Times-Roman' | 'Courier';
    fontSize?: number;
    margins?: {
        top?: number;
        bottom?: number;
        left?: number;
        right?: number;
    };
    headerText?: string;
    footerText?: string;
    paginationEnabled?: boolean;
    author?: string;
}

/**
 * Generates a PDF buffer using PDFKit strictly respecting user layout options.
 */
export async function generatePdfBuffer(options: PdfGenerationOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const size = options.pageSize || 'A4';
            const layout = options.orientation || 'portrait';
            const topMargin = options.margins?.top ?? 50;
            const bottomMargin = options.margins?.bottom ?? 50;
            const leftMargin = options.margins?.left ?? 50;
            const rightMargin = options.margins?.right ?? 50;

            const doc = new PDFDocument({
                size,
                layout,
                margins: {
                    top: topMargin,
                    bottom: bottomMargin,
                    left: leftMargin,
                    right: rightMargin
                },
                bufferPages: true,
                info: {
                    Title: options.title || 'Documento',
                    Author: options.author || 'Assistente TechStar'
                }
            });

            const buffers: Buffer[] = [];
            doc.on('data', (chunk) => buffers.push(chunk));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });
            doc.on('error', (err) => reject(err));

            const baseFont = options.font || 'Helvetica';
            const fontSize = options.fontSize || 12;

            // Header (optional)
            if (options.headerText) {
                doc.font(baseFont).fontSize(9).fillColor('#666666');
                doc.text(options.headerText, leftMargin, 25, {
                    align: 'center'
                });
                doc.moveDown(1);
            }

            // Document Title
            if (options.title) {
                doc.font(baseFont === 'Times-Roman' ? 'Times-Bold' : (baseFont === 'Courier' ? 'Courier-Bold' : 'Helvetica-Bold'))
                   .fontSize(Math.max(fontSize + 6, 18))
                   .fillColor('#111827')
                   .text(options.title, { align: 'center' });
                doc.moveDown(1.5);
            }

            // Document Body Content
            doc.font(baseFont)
               .fontSize(fontSize)
               .fillColor('#374151')
               .text(options.content || 'Documento sem conteúdo especificado.', {
                   align: 'justify',
                   lineGap: 4
               });

            // Pagination and Footers (apply across all buffered pages)
            const range = doc.bufferedPageRange();
            for (let i = range.start; i < range.start + range.count; i++) {
                doc.switchToPage(i);
                const pageHeight = doc.page.height;

                // Footer text
                if (options.footerText) {
                    doc.font(baseFont)
                       .fontSize(8)
                       .fillColor('#888888')
                       .text(options.footerText, leftMargin, pageHeight - 35, {
                           width: doc.page.width - leftMargin - rightMargin,
                           align: 'left'
                       });
                }

                // Page numbering (e.g. "Página 1 de 3")
                if (options.paginationEnabled !== false) {
                    doc.font(baseFont)
                       .fontSize(8)
                       .fillColor('#888888')
                       .text(`Página ${i + 1} de ${range.count}`, leftMargin, pageHeight - 35, {
                           width: doc.page.width - leftMargin - rightMargin,
                           align: options.footerText ? 'right' : 'center'
                       });
                }
            }

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}
