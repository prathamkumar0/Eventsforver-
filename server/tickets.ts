import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import type { BookingRecord, EventConfig, TicketRecord } from '../shared/types.ts';

export function buildVerifyUrl(baseUrl: string, qrToken: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/verify?token=${encodeURIComponent(qrToken)}`;
}

export async function generateQrPngBuffer(content: string): Promise<Buffer> {
  return QRCode.toBuffer(content, {
    type: 'png',
    width: 360,
    margin: 2,
    color: {
      dark: '#080B12',
      light: '#F8F7F2',
    },
    errorCorrectionLevel: 'M',
  });
}

export async function generateQrDataUrl(content: string): Promise<string> {
  return QRCode.toDataURL(content, {
    width: 320,
    margin: 2,
    color: {
      dark: '#080B12',
      light: '#F8F7F2',
    },
    errorCorrectionLevel: 'M',
  });
}

export async function generateBookingPdfBuffer(params: {
  booking: BookingRecord;
  tickets: TicketRecord[];
  eventConfig: EventConfig;
  baseUrl: string;
}): Promise<Buffer> {
  const { booking, tickets, eventConfig, baseUrl } = params;

  const qrBuffers = await Promise.all(
    tickets.map((ticket) => generateQrPngBuffer(buildVerifyUrl(baseUrl, ticket.qrToken))),
  );

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 42,
      info: {
        Title: `${eventConfig.eventName} - Official Tickets (${booking.bookingCode})`,
        Author: eventConfig.eventName,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    tickets.forEach((ticket, idx) => {
      if (idx > 0) doc.addPage();

      // Dark luxury background card
      doc.rect(0, 0, doc.page.width, doc.page.height).fill('#080B12');

      // Outer Champagne Gold border
      doc
        .lineWidth(1.5)
        .strokeColor('#D6B36A')
        .rect(28, 28, doc.page.width - 56, doc.page.height - 56)
        .stroke();

      // Inner accent header band
      doc.rect(28, 28, doc.page.width - 56, 118).fill('#0B3025');
      doc
        .lineWidth(1)
        .strokeColor('#D6B36A')
        .moveTo(28, 146)
        .lineTo(doc.page.width - 28, 146)
        .stroke();

      const logoPath = path.resolve(
        process.cwd(),
        'public',
        eventConfig.logoUrl.replace(/^\/+/, ''),
      );
      const hasLogo = eventConfig.logoUrl && fs.existsSync(logoPath);
      const textStartX = hasLogo ? 124 : 54;
      if (hasLogo) {
        try {
          doc.image(logoPath, 48, 52, { width: 62, height: 62 });
        } catch {
          // ignore logo rendering error
        }
      }

      // Header text
      doc
        .fillColor('#D6B36A')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('OFFICIAL EVENT PASS', textStartX, 48, { characterSpacing: 2 });

      doc
        .fillColor('#F8F7F2')
        .font('Times-Bold')
        .fontSize(26)
        .text(eventConfig.eventName.toUpperCase(), textStartX, 68);

      doc
        .fillColor('#A9DDF5')
        .font('Helvetica')
        .fontSize(10)
        .text(eventConfig.tagline, textStartX, 106, { width: doc.page.width - textStartX - 165 });

      // Payment status stamp
      doc.rect(doc.page.width - 152, 54, 98, 30).fill('#D72638');
      doc
        .fillColor('#F8F7F2')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('STATUS: PAID', doc.page.width - 152, 63, { width: 98, align: 'center' });

      // Pass category & attendee section
      let y = 178;
      doc
        .fillColor('#D6B36A')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('PASS CATEGORY', 54, y, { characterSpacing: 1.5 });
      doc
        .fillColor('#F8F7F2')
        .font('Times-Bold')
        .fontSize(24)
        .text(ticket.categoryName, 54, y + 16);

      y += 64;
      const colLeft = 54;
      const colMid = 260;

      const drawField = (label: string, value: string, x: number, fy: number) => {
        doc
          .fillColor('#94A3B8')
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .text(label.toUpperCase(), x, fy, { characterSpacing: 1 });
        doc
          .fillColor('#F8F7F2')
          .font('Helvetica-Bold')
          .fontSize(12)
          .text(value, x, fy + 14, { width: 190 });
      };

      drawField('Attendee Name', ticket.customerName, colLeft, y);
      drawField('Booking ID', booking.bookingCode, colMid, y);

      y += 54;
      drawField('Unique Ticket ID', ticket.ticketCode, colLeft, y);
      drawField('Pass Number', `${idx + 1} of ${tickets.length}`, colMid, y);

      y += 54;
      drawField('Event Date', eventConfig.eventDate, colLeft, y);
      drawField('Event Time', eventConfig.eventTime, colMid, y);

      y += 54;
      drawField('Venue', eventConfig.venueName, colLeft, y);
      drawField('City', `${eventConfig.city}, ${eventConfig.country}`, colMid, y);

      y += 54;
      doc
        .fillColor('#94A3B8')
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text('VENUE ADDRESS', colLeft, y, { characterSpacing: 1 });
      doc
        .fillColor('#F8F7F2')
        .font('Helvetica')
        .fontSize(11)
        .text(eventConfig.venueAddress, colLeft, y + 14, { width: 320 });

      // QR Box on the right
      const qrBoxX = doc.page.width - 216;
      const qrBoxY = 186;
      doc.rect(qrBoxX, qrBoxY, 162, 198).fill('#F8F7F2');
      doc.image(qrBuffers[idx], qrBoxX + 11, qrBoxY + 11, { width: 140, height: 140 });
      doc
        .fillColor('#080B12')
        .font('Courier-Bold')
        .fontSize(9.5)
        .text(ticket.ticketCode, qrBoxX + 8, qrBoxY + 162, {
          width: 146,
          align: 'center',
        });
      doc
        .fillColor('#475569')
        .font('Helvetica')
        .fontSize(7.5)
        .text('SCAN AT ENTRANCE GATE', qrBoxX + 8, qrBoxY + 178, {
          width: 146,
          align: 'center',
        });

      // Divider & Entry Instructions
      const footerY = 580;
      doc
        .lineWidth(0.75)
        .strokeColor('#334155')
        .moveTo(54, footerY)
        .lineTo(doc.page.width - 54, footerY)
        .stroke();

      doc
        .fillColor('#D6B36A')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('IMPORTANT ENTRY INSTRUCTIONS', 54, footerY + 18, { characterSpacing: 1 });

      doc
        .fillColor('#CBD5E1')
        .font('Helvetica')
        .fontSize(9.5)
        .text(
          [
            '1. Present this digital PDF or QR code on your mobile phone (with brightness raised) or as a printed copy at the venue entrance.',
            '2. Each Ticket ID and QR code is valid for a single check-in only. Duplicate or previously scanned passes will be declined automatically.',
            '3. Please carry a valid government-issued photo ID matching the attendee details for smooth security verification.',
            `4. Organizer Contact: ${eventConfig.contactEmail} | ${eventConfig.contactNumber}`,
          ].join('\n'),
          54,
          footerY + 38,
          { width: doc.page.width - 108, lineGap: 5 },
        );
    });

    doc.end();
  });
}
