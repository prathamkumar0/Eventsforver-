import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import type { Request, Response } from 'express';
import type { AdminRequest } from './server/auth.ts';
import { requireAdmin } from './server/auth.ts';
import { sendBookingConfirmationEmail } from './server/email.ts';
import {
  createRazorpayOrder,
  getPaymentReadiness,
  getRazorpayKeyId,
  verifyPaymentWithRazorpayApi,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from './server/razorpay.ts';
import {
  checkInTicketAtomically,
  createCategoryByAdmin,
  deleteCategoryByAdmin,
  getAdminOverview,
  getBookingById,
  getBookingByOrderId,
  getPublicEventData,
  getTicketsForBooking,
  lookupTicketByTokenOrCode,
  markBookingFailedOrCancelled,
  markBookingPaidIdempotent,
  reserveAndCreatePendingBooking,
  updateBookingEmailStatus,
  updateCategoryByAdmin,
  updateEventConfigByAdmin,
  updateTicketStatusByAdmin,
} from './server/store.ts';
import {
  buildVerifyUrl,
  generateBookingPdfBuffer,
  generateQrDataUrl,
} from './server/tickets.ts';
import type { TicketStatus } from './shared/types.ts';

const PORT = Number(process.env.PORT || 3000);
const SIGNING_SECRET =
  (process.env.TICKET_SIGNING_SECRET || '').trim() ||
  crypto.createHash('sha256').update(process.cwd()).digest('hex');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_REGEX = /^[+\d][\d\s-]{7,18}$/;

function resolveBaseUrl(req: Request): string {
  const configured = (process.env.APP_URL || '').trim();
  if (configured && configured !== 'MY_APP_URL' && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function csvEscape(value: string | number | undefined): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', true);

  // 1. Razorpay Webhook Endpoint (MUST receive raw body before express.json)
  app.post(
    '/api/webhooks/razorpay',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
      try {
        const signature = req.headers['x-razorpay-signature'] as string | undefined;
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

        if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
          res.status(400).json({ error: 'Invalid webhook signature.' });
          return;
        }

        const event = JSON.parse(rawBody.toString('utf8')) as {
          event?: string;
          id?: string;
          payload?: {
            payment?: {
              entity?: {
                id?: string;
                order_id?: string;
                amount?: number;
                status?: string;
              };
            };
            order?: {
              entity?: {
                id?: string;
                amount?: number;
                status?: string;
              };
            };
          };
        };

        const eventName = event.event || '';
        const eventId =
          event.id ||
          (req.headers['x-razorpay-event-id'] as string | undefined) ||
          `${eventName}_${Date.now()}`;

        const paymentEntity = event.payload?.payment?.entity;
        const orderEntity = event.payload?.order?.entity;
        const orderId = paymentEntity?.order_id || orderEntity?.id;

        if (!orderId) {
          res.status(200).json({ received: true });
          return;
        }

        const booking = await getBookingByOrderId(orderId);
        if (!booking) {
          res.status(200).json({ received: true });
          return;
        }

        if (eventName === 'payment.captured' || eventName === 'order.paid') {
          const paymentId = paymentEntity?.id || booking.razorpayPaymentId || 'webhook_verified';
          const expectedPaise = Math.round(booking.totalInr * 100);
          const actualPaise = Number(paymentEntity?.amount ?? orderEntity?.amount ?? expectedPaise);

          if (actualPaise !== expectedPaise) {
            console.error(
              `Webhook amount mismatch for booking ${booking.bookingCode}: expected ${expectedPaise}, got ${actualPaise}`,
            );
            res.status(400).json({ error: 'Payment amount mismatch.' });
            return;
          }

          const confirmed = await markBookingPaidIdempotent({
            bookingId: booking.id,
            razorpayPaymentId: paymentId,
            webhookEventId: eventId,
            signingSecret: SIGNING_SECRET,
          });

          if (confirmed.newlyConfirmed || confirmed.booking.emailStatus === 'NOT_SENT') {
            const { eventConfig } = await getPublicEventData();
            const emailRes = await sendBookingConfirmationEmail({
              booking: confirmed.booking,
              tickets: confirmed.tickets,
              eventConfig,
              baseUrl: resolveBaseUrl(req),
            });
            await updateBookingEmailStatus(confirmed.booking.id, emailRes.status, emailRes.error);
          }
        } else if (eventName === 'payment.failed') {
          await markBookingFailedOrCancelled({
            bookingId: booking.id,
            status: 'FAILED',
            webhookEventId: eventId,
          });
        }

        res.status(200).json({ received: true });
      } catch (err) {
        console.error('Webhook processing error:', err);
        res.status(500).json({ error: 'Webhook processing error.' });
      }
    },
  );

  // JSON parser for standard endpoints
  app.use(express.json({ limit: '1mb' }));

  // 2. Health & Public Event Endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, readiness: getPaymentReadiness() });
  });

  app.get('/api/public/event', async (_req: Request, res: Response) => {
    try {
      const publicData = await getPublicEventData();
      res.json({
        ...publicData,
        paymentReadiness: getPaymentReadiness(),
      });
    } catch (err) {
      console.error('Public event fetch error:', err);
      res.status(500).json({ error: 'Unable to load event configuration.' });
    }
  });

  // 3. Checkout: Create Razorpay Order & Reserve Inventory
  app.post('/api/checkout/create-order', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        customerName?: string;
        customerEmail?: string;
        customerPhone?: string;
        acceptedTerms?: boolean;
        items?: Array<{ categoryId: string; quantity: number }>;
      };

      const customerName = String(body.customerName || '').trim();
      const customerEmail = String(body.customerEmail || '').trim().toLowerCase();
      const customerPhone = String(body.customerPhone || '').trim();

      if (customerName.length < 2 || customerName.length > 120) {
        res.status(400).json({ error: 'Please enter your full name (2–120 characters).' });
        return;
      }
      if (!EMAIL_REGEX.test(customerEmail) || customerEmail.length > 160) {
        res.status(400).json({
          error: 'Please enter a valid email address so your tickets can be delivered accurately.',
        });
        return;
      }
      if (!PHONE_REGEX.test(customerPhone)) {
        res.status(400).json({
          error: 'Please enter a valid mobile number (e.g. +91 9876543210).',
        });
        return;
      }
      if (!body.acceptedTerms) {
        res.status(400).json({
          error: 'Please accept the Terms & Conditions, Privacy Policy, and Refund Policy.',
        });
        return;
      }

      const booking = await reserveAndCreatePendingBooking({
        customerName,
        customerEmail,
        customerPhone,
        requestedItems: body.items || [],
        createOrderFn: async (amountInr, bookingCode, bookingId) => {
          const order = await createRazorpayOrder({
            amountInr,
            receipt: bookingCode,
            notes: {
              bookingId,
              bookingCode,
              event: 'Christmas Night 2026',
            },
          });
          return order.id;
        },
      });

      const { eventConfig } = await getPublicEventData();

      res.status(201).json({
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        accessToken: booking.accessToken,
        razorpayOrderId: booking.razorpayOrderId,
        amountPaise: Math.round(booking.totalInr * 100),
        currency: 'INR',
        keyId: getRazorpayKeyId(),
        eventName: eventConfig.eventName,
        booking,
      });
    } catch (err) {
      const typed = err as Error & { code?: string; statusCode?: number };
      if (typed.code === 'RAZORPAY_NOT_CONFIGURED') {
        res.status(503).json({
          code: 'RAZORPAY_NOT_CONFIGURED',
          error: typed.message,
        });
        return;
      }
      const message = typed.message || 'Unable to initiate booking.';
      res.status(typed.statusCode || 400).json({ error: message });
    }
  });

  // 4. Checkout: Server-Side Payment Signature + Razorpay API Verification
  app.post('/api/checkout/verify-payment', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        bookingId?: string;
        accessToken?: string;
        razorpay_order_id?: string;
        razorpay_payment_id?: string;
        razorpay_signature?: string;
      };

      const bookingId = String(body.bookingId || '').trim();
      const orderId = String(body.razorpay_order_id || '').trim();
      const paymentId = String(body.razorpay_payment_id || '').trim();
      const signature = String(body.razorpay_signature || '').trim();

      if (!bookingId || !orderId || !paymentId || !signature) {
        res.status(400).json({ error: 'Missing required payment verification fields.' });
        return;
      }

      const existingBooking = await getBookingById(bookingId);
      if (!existingBooking) {
        res.status(404).json({ error: 'Booking not found.' });
        return;
      }
      if (existingBooking.razorpayOrderId !== orderId) {
        res.status(400).json({ error: 'Order ID does not match booking record.' });
        return;
      }

      const signatureOk = verifyRazorpayCheckoutSignature({
        orderId,
        paymentId,
        signature,
      });
      if (!signatureOk) {
        await markBookingFailedOrCancelled({ bookingId, status: 'FAILED' });
        res.status(400).json({ error: 'Invalid payment signature. Verification failed.' });
        return;
      }

      const apiCheck = await verifyPaymentWithRazorpayApi({
        paymentId,
        expectedOrderId: orderId,
        expectedAmountInr: existingBooking.totalInr,
      });
      if (!apiCheck.verified) {
        await markBookingFailedOrCancelled({ bookingId, status: 'FAILED' });
        res.status(400).json({
          error: `Payment verification rejected by gateway (status: ${apiCheck.status}).`,
        });
        return;
      }

      const confirmed = await markBookingPaidIdempotent({
        bookingId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        signingSecret: SIGNING_SECRET,
      });

      const { eventConfig } = await getPublicEventData();
      const baseUrl = resolveBaseUrl(req);

      if (confirmed.newlyConfirmed || confirmed.booking.emailStatus === 'NOT_SENT') {
        const emailResult = await sendBookingConfirmationEmail({
          booking: confirmed.booking,
          tickets: confirmed.tickets,
          eventConfig,
          baseUrl,
        });
        await updateBookingEmailStatus(
          confirmed.booking.id,
          emailResult.status,
          emailResult.error,
        );
        confirmed.booking.emailStatus = emailResult.status;
        confirmed.booking.emailError = emailResult.error;
      }

      const qrDataUrls: Record<string, string> = {};
      for (const ticket of confirmed.tickets) {
        qrDataUrls[ticket.id] = await generateQrDataUrl(buildVerifyUrl(baseUrl, ticket.qrToken));
      }

      res.json({
        booking: confirmed.booking,
        tickets: confirmed.tickets,
        qrDataUrls,
        eventConfig,
      });
    } catch (err) {
      console.error('Payment verification error:', err);
      const message = err instanceof Error ? err.message : 'Payment verification failed.';
      res.status(500).json({ error: message });
    }
  });

  // 5. Checkout: Cancel / Payment Failed Release
  app.post('/api/checkout/fail', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        bookingId?: string;
        accessToken?: string;
        status?: 'FAILED' | 'CANCELLED';
      };
      const bookingId = String(body.bookingId || '').trim();
      const accessToken = String(body.accessToken || '').trim();
      if (!bookingId || !accessToken) {
        res.status(400).json({ error: 'Missing booking identifier.' });
        return;
      }
      const booking = await getBookingById(bookingId);
      if (!booking || booking.accessToken !== accessToken) {
        res.status(403).json({ error: 'Unauthorized booking access.' });
        return;
      }
      const updated = await markBookingFailedOrCancelled({
        bookingId,
        status: body.status === 'FAILED' ? 'FAILED' : 'CANCELLED',
      });
      res.json({ booking: updated });
    } catch (err) {
      console.error('Checkout fail release error:', err);
      res.status(500).json({ error: 'Unable to update booking status.' });
    }
  });

  // 6. Booking Lookup & PDF Ticket Download (Access-Token Guarded)
  app.get('/api/bookings/:bookingId', async (req: Request, res: Response) => {
    try {
      const bookingId = String(req.params.bookingId || '');
      const token = String(req.query.token || '');
      const booking = await getBookingById(bookingId);
      if (!booking || !token || booking.accessToken !== token) {
        res.status(403).json({ error: 'Invalid or missing booking access token.' });
        return;
      }
      const tickets =
        booking.paymentStatus === 'PAID' ? await getTicketsForBooking(booking.id) : [];
      const { eventConfig } = await getPublicEventData();
      const baseUrl = resolveBaseUrl(req);
      const qrDataUrls: Record<string, string> = {};
      for (const ticket of tickets) {
        qrDataUrls[ticket.id] = await generateQrDataUrl(buildVerifyUrl(baseUrl, ticket.qrToken));
      }
      res.json({ booking, tickets, qrDataUrls, eventConfig });
    } catch (err) {
      console.error('Booking lookup error:', err);
      res.status(500).json({ error: 'Unable to retrieve booking.' });
    }
  });

  app.get('/api/bookings/:bookingId/pdf', async (req: Request, res: Response) => {
    try {
      const bookingId = String(req.params.bookingId || '');
      const token = String(req.query.token || '');
      const booking = await getBookingById(bookingId);
      if (!booking || !token || booking.accessToken !== token) {
        res.status(403).json({ error: 'Invalid or missing booking access token.' });
        return;
      }
      if (booking.paymentStatus !== 'PAID') {
        res.status(400).json({ error: 'Tickets are only issued after verified payment.' });
        return;
      }
      const tickets = await getTicketsForBooking(booking.id);
      if (tickets.length === 0) {
        res.status(404).json({ error: 'No tickets found for this booking.' });
        return;
      }
      const { eventConfig } = await getPublicEventData();
      const pdfBuffer = await generateBookingPdfBuffer({
        booking,
        tickets,
        eventConfig,
        baseUrl: resolveBaseUrl(req),
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Christmas-Night-2026-${booking.bookingCode}.pdf"`,
      );
      res.send(pdfBuffer);
    } catch (err) {
      console.error('PDF generation error:', err);
      res.status(500).json({ error: 'Unable to generate PDF ticket.' });
    }
  });

  // 7. Public Non-PII Ticket Authenticity Check (when attendee scans their QR code)
  app.get('/api/tickets/verify-public', async (req: Request, res: Response) => {
    try {
      const token = String(req.query.token || '').trim();
      if (!token) {
        res.status(400).json({ error: 'Ticket token is required.' });
        return;
      }
      const found = await lookupTicketByTokenOrCode(token);
      if (!found || found.booking.paymentStatus !== 'PAID') {
        res.status(404).json({
          authentic: false,
          error: 'No valid paid ticket found for this QR code.',
        });
        return;
      }
      res.json({
        authentic: true,
        ticketCode: found.ticket.ticketCode,
        bookingCode: found.booking.bookingCode,
        categoryName: found.ticket.categoryName,
        status: found.ticket.status,
        checkedInAt: found.ticket.checkedInAt || null,
        eventName: found.eventConfig.eventName,
        eventDate: found.eventConfig.eventDate,
        venueName: found.eventConfig.venueName,
      });
    } catch (err) {
      console.error('Public ticket verify error:', err);
      res.status(500).json({ error: 'Unable to verify ticket.' });
    }
  });

  // 8. Protected Admin Routes
  app.get('/api/admin/overview', requireAdmin, async (_req: AdminRequest, res: Response) => {
    try {
      const overview = await getAdminOverview(getPaymentReadiness());
      res.json(overview);
    } catch (err) {
      console.error('Admin overview error:', err);
      res.status(500).json({ error: 'Failed to load admin overview.' });
    }
  });

  app.put('/api/admin/event-config', requireAdmin, async (req: AdminRequest, res: Response) => {
    try {
      const updated = await updateEventConfigByAdmin(req.body || {});
      res.json({ eventConfig: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to update event configuration.',
      });
    }
  });

  app.post('/api/admin/categories', requireAdmin, async (req: AdminRequest, res: Response) => {
    try {
      const body = req.body as {
        name?: string;
        description?: string;
        priceInr?: number;
        isPlaceholderPrice?: boolean;
        totalInventory?: number;
        benefits?: string[];
        enabled?: boolean;
      };
      if (!body.name || body.priceInr === undefined || body.totalInventory === undefined) {
        res.status(400).json({ error: 'Name, price, and inventory are required.' });
        return;
      }
      const created = await createCategoryByAdmin({
        name: body.name,
        description: body.description || '',
        priceInr: Number(body.priceInr),
        isPlaceholderPrice: Boolean(body.isPlaceholderPrice),
        totalInventory: Number(body.totalInventory),
        benefits: Array.isArray(body.benefits) ? body.benefits : [],
        enabled: body.enabled !== false,
      });
      res.status(201).json({ category: created });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to create category.',
      });
    }
  });

  app.put('/api/admin/categories/:id', requireAdmin, async (req: AdminRequest, res: Response) => {
    try {
      const updated = await updateCategoryByAdmin(String(req.params.id), req.body || {});
      res.json({ category: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to update category.',
      });
    }
  });

  app.delete('/api/admin/categories/:id', requireAdmin, async (req: AdminRequest, res: Response) => {
    try {
      await deleteCategoryByAdmin(String(req.params.id));
      res.json({ deleted: true });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to delete category.',
      });
    }
  });

  app.post(
    '/api/admin/bookings/:id/resend-email',
    requireAdmin,
    async (req: AdminRequest, res: Response) => {
      try {
        const booking = await getBookingById(String(req.params.id));
        if (!booking) {
          res.status(404).json({ error: 'Booking not found.' });
          return;
        }
        if (booking.paymentStatus !== 'PAID') {
          res.status(400).json({
            error: 'Cannot send entry tickets for unpaid or unverified bookings.',
          });
          return;
        }
        const tickets = await getTicketsForBooking(booking.id);
        const { eventConfig } = await getPublicEventData();
        const emailResult = await sendBookingConfirmationEmail({
          booking,
          tickets,
          eventConfig,
          baseUrl: resolveBaseUrl(req),
        });
        await updateBookingEmailStatus(booking.id, emailResult.status, emailResult.error);
        res.json({
          emailStatus: emailResult.status,
          emailError: emailResult.error,
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to resend email.',
        });
      }
    },
  );

  app.get('/api/admin/bookings/export.csv', requireAdmin, async (_req: AdminRequest, res: Response) => {
    try {
      const overview = await getAdminOverview(getPaymentReadiness());
      const header = [
        'Booking Code',
        'Created At',
        'Customer Name',
        'Customer Email',
        'Customer Phone',
        'Categories',
        'Total Qty',
        'Subtotal (INR)',
        'Tax (INR)',
        'Platform Fee (INR)',
        'Total Paid (INR)',
        'Payment Status',
        'Razorpay Order ID',
        'Razorpay Payment ID',
        'Email Status',
      ];
      const rows = overview.bookings.map((b) => [
        csvEscape(b.bookingCode),
        csvEscape(b.createdAt),
        csvEscape(b.customerName),
        csvEscape(b.customerEmail),
        csvEscape(b.customerPhone),
        csvEscape(b.items.map((i) => `${i.categoryName} x${i.quantity}`).join('; ')),
        csvEscape(b.totalQuantity),
        csvEscape(b.subtotalInr),
        csvEscape(b.taxInr),
        csvEscape(b.platformFeeInr),
        csvEscape(b.totalInr),
        csvEscape(b.paymentStatus),
        csvEscape(b.razorpayOrderId),
        csvEscape(b.razorpayPaymentId || ''),
        csvEscape(b.emailStatus),
      ]);
      const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="christmas-night-2026-bookings.csv"',
      );
      res.send(csv);
    } catch (err) {
      console.error('CSV export error:', err);
      res.status(500).json({ error: 'Unable to export CSV report.' });
    }
  });

  app.post('/api/admin/tickets/verify', requireAdmin, async (req: AdminRequest, res: Response) => {
    try {
      const rawInput = String((req.body as { codeOrToken?: string })?.codeOrToken || '').trim();
      if (!rawInput) {
        res.status(400).json({ error: 'Enter or scan a Ticket ID or QR token.' });
        return;
      }

      let tokenOrCode = rawInput;
      try {
        if (/^https?:\/\//i.test(rawInput)) {
          const url = new URL(rawInput);
          const qp = url.searchParams.get('token');
          if (qp) tokenOrCode = qp;
        }
      } catch {
        // treat as literal code
      }

      const found = await lookupTicketByTokenOrCode(tokenOrCode);
      if (!found) {
        res.status(404).json({ valid: false, error: 'Ticket not found in database.' });
        return;
      }

      res.json({
        valid: found.booking.paymentStatus === 'PAID',
        ticket: found.ticket,
        booking: {
          id: found.booking.id,
          bookingCode: found.booking.bookingCode,
          customerName: found.booking.customerName,
          customerEmail: found.booking.customerEmail,
          customerPhone: found.booking.customerPhone,
          paymentStatus: found.booking.paymentStatus,
        },
        eventConfig: {
          eventName: found.eventConfig.eventName,
          eventDate: found.eventConfig.eventDate,
          venueName: found.eventConfig.venueName,
        },
      });
    } catch (err) {
      console.error('Admin verify error:', err);
      res.status(500).json({ error: 'Ticket verification failed.' });
    }
  });

  app.post('/api/admin/tickets/checkin', requireAdmin, async (req: AdminRequest, res: Response) => {
    try {
      const codeOrToken = String((req.body as { codeOrToken?: string })?.codeOrToken || '').trim();
      if (!codeOrToken) {
        res.status(400).json({ error: 'Ticket identifier is required.' });
        return;
      }
      const result = await checkInTicketAtomically(
        codeOrToken,
        req.adminUser?.email || 'organizer',
      );
      if (result.outcome === 'NOT_FOUND') {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
      }
      if (result.outcome === 'ALREADY_USED') {
        res.status(409).json({
          outcome: 'ALREADY_USED',
          error: `Duplicate entry blocked: ticket ${result.ticket?.ticketCode} was already checked in at ${result.ticket?.checkedInAt}.`,
          ticket: result.ticket,
        });
        return;
      }
      if (result.outcome === 'INVALID_STATUS') {
        res.status(400).json({
          outcome: 'INVALID_STATUS',
          error: `Ticket cannot be checked in (ticket status: ${result.ticket?.status}, payment: ${result.booking?.paymentStatus}).`,
          ticket: result.ticket,
        });
        return;
      }
      res.json({
        outcome: 'CHECKED_IN',
        ticket: result.ticket,
      });
    } catch (err) {
      console.error('Check-in error:', err);
      res.status(500).json({ error: 'Check-in failed.' });
    }
  });

  app.post(
    '/api/admin/tickets/:id/status',
    requireAdmin,
    async (req: AdminRequest, res: Response) => {
      try {
        const status = (req.body as { status?: TicketStatus })?.status;
        if (!status || !['VALID', 'USED', 'CANCELLED', 'REFUNDED'].includes(status)) {
          res.status(400).json({ error: 'Invalid ticket status.' });
          return;
        }
        const updated = await updateTicketStatusByAdmin(String(req.params.id), status);
        if (!updated) {
          res.status(404).json({ error: 'Ticket not found.' });
          return;
        }
        res.json({ ticket: updated });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Unable to update ticket status.',
        });
      }
    },
  );

  // 9. Frontend Vite Dev Middleware or Production Static Hosting
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Christmas Night 2026 server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
