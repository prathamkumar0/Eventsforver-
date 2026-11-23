import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import type { BookingRecord, EmailStatus, EventConfig, TicketRecord } from '../shared/types.ts';
import { generateBookingPdfBuffer, generateQrPngBuffer, buildVerifyUrl } from './tickets.ts';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildChristmasTicketEmailHtml(params: {
  booking: BookingRecord;
  tickets: TicketRecord[];
  eventConfig: EventConfig;
  downloadPdfUrl: string;
}): string {
  const { booking, tickets, eventConfig, downloadPdfUrl } = params;
  const itemsHtml = booking.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #1E293B;color:#F8F7F2;font-size:14px;">${escapeHtml(item.categoryName)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #1E293B;color:#D6B36A;font-size:14px;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 0;border-bottom:1px solid #1E293B;color:#F8F7F2;font-size:14px;text-align:right;font-family:monospace;">&#8377;${item.lineTotalInr.toLocaleString('en-IN')}</td>
      </tr>`,
    )
    .join('');

  const ticketListHtml = tickets
    .map(
      (t, idx) => `
      <div style="background:#0E1420;border:1px solid #2A3548;border-radius:8px;padding:14px;margin-bottom:10px;">
        <div style="color:#D6B36A;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;font-weight:bold;">Pass ${idx + 1} of ${tickets.length} &bull; ${escapeHtml(t.categoryName)}</div>
        <div style="color:#F8F7F2;font-size:16px;font-family:monospace;font-weight:bold;margin-top:4px;">${escapeHtml(t.ticketCode)}</div>
        <div style="color:#94A3B8;font-size:12px;margin-top:2px;">Attendee: ${escapeHtml(t.customerName)} &bull; Status: PAID</div>
      </div>`,
    )
    .join('');

  return `
<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:#080B12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#F8F7F2;">
  <div style="max-width:620px;margin:0 auto;padding:32px 16px;">
    <div style="background:#0B3025;border:1px solid #D6B36A;border-radius:12px 12px 0 0;padding:32px 28px;text-align:center;">
      <div style="color:#D6B36A;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700;">Official Booking Confirmation</div>
      <h1 style="margin:10px 0 6px;color:#F8F7F2;font-family:Georgia,serif;font-size:32px;letter-spacing:0.5px;">${escapeHtml(eventConfig.eventName)}</h1>
      <p style="margin:0;color:#A9DDF5;font-size:14px;">${escapeHtml(eventConfig.tagline)}</p>
    </div>

    <div style="background:#0C101A;border:1px solid #1E293B;border-top:none;border-radius:0 0 12px 12px;padding:28px;">
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#F8F7F2;">Dear <strong>${escapeHtml(booking.customerName)}</strong>,</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#E2E8F0;">Thank you for booking your ${escapeHtml(eventConfig.eventName)} tickets!</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#E2E8F0;">Your payment has been successfully confirmed. Your official event ticket is attached below.</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#D6B36A;font-weight:600;">Get ready for an unforgettable Christmas celebration at ${escapeHtml(eventConfig.venueName)}!</p>

      <div style="background:#080B12;border:1px solid #263144;border-radius:8px;padding:18px;margin-bottom:22px;">
        <div style="color:#94A3B8;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;">Booking Reference</div>
        <div style="color:#D6B36A;font-size:20px;font-family:monospace;font-weight:bold;margin:4px 0 12px;">${escapeHtml(booking.bookingCode)}</div>
        <div style="color:#E2E8F0;font-size:13px;line-height:1.6;">
          <strong>Date:</strong> ${escapeHtml(eventConfig.eventDate)}<br/>
          <strong>Time:</strong> ${escapeHtml(eventConfig.eventTime)} (${escapeHtml(eventConfig.timezone)})<br/>
          <strong>Venue:</strong> ${escapeHtml(eventConfig.venueName)}<br/>
          <strong>Address:</strong> ${escapeHtml(eventConfig.venueAddress)}, ${escapeHtml(eventConfig.city)}
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;border-bottom:1px solid #334155;color:#94A3B8;font-size:11px;text-transform:uppercase;">Pass Category</th>
            <th style="text-align:center;padding-bottom:8px;border-bottom:1px solid #334155;color:#94A3B8;font-size:11px;text-transform:uppercase;">Qty</th>
            <th style="text-align:right;padding-bottom:8px;border-bottom:1px solid #334155;color:#94A3B8;font-size:11px;text-transform:uppercase;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="text-align:right;margin-bottom:24px;font-size:14px;color:#CBD5E1;">
        <div>Total Paid (incl. taxes &amp; fees): <strong style="color:#D6B36A;font-size:17px;font-family:monospace;">&#8377;${booking.totalInr.toLocaleString('en-IN')}</strong></div>
      </div>

      <div style="text-align:center;margin:24px 0;">
        <img src="cid:primary-ticket-qr" alt="Primary Ticket QR Code" style="width:180px;height:180px;background:#F8F7F2;padding:10px;border-radius:8px;display:inline-block;" />
        <div style="color:#94A3B8;font-size:12px;margin-top:8px;">Present this QR code or the attached PDF pass at entry.</div>
      </div>

      <h3 style="margin:22px 0 10px;font-size:14px;color:#D6B36A;text-transform:uppercase;letter-spacing:1.2px;">Issued Passes (${tickets.length})</h3>
      ${ticketListHtml}

      <div style="text-align:center;margin:26px 0;">
        <a href="${escapeHtml(downloadPdfUrl)}" style="display:inline-block;background:#D72638;color:#F8F7F2;text-decoration:none;font-weight:700;font-size:14px;padding:13px 28px;border-radius:8px;">Download Official PDF Tickets</a>
      </div>

      <div style="border-top:1px solid #1E293B;padding-top:18px;margin-top:20px;font-size:12px;line-height:1.6;color:#94A3B8;">
        <strong style="color:#E2E8F0;">Important Entry Instructions:</strong><br/>
        &bull; Each ticket carries a unique QR code valid for one check-in only.<br/>
        &bull; Carry a valid government photo ID matching the attendee details.<br/>
        &bull; Questions? Contact us at ${escapeHtml(eventConfig.contactEmail)} or ${escapeHtml(eventConfig.contactNumber)}.
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendBookingConfirmationEmail(params: {
  booking: BookingRecord;
  tickets: TicketRecord[];
  eventConfig: EventConfig;
  baseUrl: string;
}): Promise<{ status: EmailStatus; error?: string }> {
  const { booking, tickets, eventConfig, baseUrl } = params;
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const smtpHost = (process.env.SMTP_HOST || '').trim();
  const smtpUser = (process.env.SMTP_USER || '').trim();
  const smtpPass = (process.env.SMTP_PASS || '').trim();
  const emailFrom =
    (process.env.EMAIL_FROM || '').trim() ||
    (smtpUser ? `${eventConfig.eventName} <${smtpUser}>` : `${eventConfig.eventName} <onboarding@resend.dev>`);

  if (!resendKey && !(smtpHost && smtpUser && smtpPass)) {
    return {
      status: 'PENDING_CONFIG',
      error:
        'Email provider is not configured. Set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS to enable automatic ticket email delivery.',
    };
  }

  try {
    const pdfBuffer = await generateBookingPdfBuffer({
      booking,
      tickets,
      eventConfig,
      baseUrl,
    });
    const firstQrBuffer = tickets[0]
      ? await generateQrPngBuffer(buildVerifyUrl(baseUrl, tickets[0].qrToken))
      : null;

    const cleanBase = baseUrl.replace(/\/+$/, '');
    const downloadPdfUrl = `${cleanBase}/api/bookings/${encodeURIComponent(
      booking.id,
    )}/pdf?token=${encodeURIComponent(booking.accessToken)}`;

    const html = buildChristmasTicketEmailHtml({
      booking,
      tickets,
      eventConfig,
      downloadPdfUrl,
    });

    const subject = `Your ${eventConfig.eventName} Ticket Is Confirmed!`;
    const pdfFilename = `Jingle-Bell-Rock-2026-${booking.bookingCode}.pdf`;

    if (resendKey) {
      const resend = new Resend(resendKey);
      const attachments: Array<{
        filename: string;
        content: Buffer;
        contentType?: string;
      }> = [
        {
          filename: pdfFilename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ];
      const result = await resend.emails.send({
        from: emailFrom,
        to: booking.customerEmail,
        subject,
        html,
        attachments,
      });
      if (result.error) {
        return { status: 'FAILED', error: result.error.message };
      }
      return { status: 'SENT' };
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: emailFrom,
      to: booking.customerEmail,
      subject,
      html,
      attachments: [
        {
          filename: pdfFilename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
        ...(firstQrBuffer
          ? [
              {
                filename: 'ticket-qr.png',
                content: firstQrBuffer,
                cid: 'primary-ticket-qr',
              },
            ]
          : []),
      ],
    });

    return { status: 'SENT' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email delivery error';
    return { status: 'FAILED', error: message };
  }
}
