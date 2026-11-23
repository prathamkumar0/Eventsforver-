import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import type { PaymentReadiness } from '../shared/types.ts';

function getCredentials() {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  return { keyId, keySecret, webhookSecret };
}

export function getPaymentReadiness(): PaymentReadiness {
  const { keyId, keySecret, webhookSecret } = getCredentials();
  const razorpayConfigured = Boolean(keyId && keySecret);
  let mode: 'test' | 'live' | 'unconfigured' = 'unconfigured';
  if (razorpayConfigured) {
    mode = keyId.startsWith('rzp_live_') ? 'live' : 'test';
  }

  const hasResend = Boolean((process.env.RESEND_API_KEY || '').trim());
  const hasSmtp = Boolean(
    (process.env.SMTP_HOST || '').trim() &&
      (process.env.SMTP_USER || '').trim() &&
      (process.env.SMTP_PASS || '').trim(),
  );

  return {
    mode,
    razorpayConfigured,
    webhookConfigured: Boolean(webhookSecret),
    emailProvider: hasResend ? 'resend' : hasSmtp ? 'smtp' : 'unconfigured',
  };
}

export function getRazorpayKeyId(): string {
  return getCredentials().keyId;
}

function getRazorpayClient(): Razorpay {
  const { keyId, keySecret } = getCredentials();
  if (!keyId || !keySecret) {
    const err = new Error(
      'Razorpay credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables.',
    ) as Error & { code?: string; statusCode?: number };
    err.code = 'RAZORPAY_NOT_CONFIGURED';
    err.statusCode = 503;
    throw err;
  }
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

export async function createRazorpayOrder(params: {
  amountInr: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string }> {
  const client = getRazorpayClient();
  const amountPaise = Math.round(params.amountInr * 100);
  if (amountPaise < 100) {
    throw new Error('Minimum Razorpay order amount is ₹1.00 (100 paise).');
  }
  const order = await client.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: params.receipt,
    notes: params.notes,
  });
  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
  };
}

export function verifyRazorpayCheckoutSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = getCredentials();
  if (!keySecret) return false;

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(params.signature.trim(), 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export async function verifyPaymentWithRazorpayApi(params: {
  paymentId: string;
  expectedOrderId: string;
  expectedAmountInr: number;
}): Promise<{ verified: boolean; status: string; amountPaise: number }> {
  const client = getRazorpayClient();
  const payment = await client.payments.fetch(params.paymentId);
  const expectedPaise = Math.round(params.expectedAmountInr * 100);
  const statusOk = payment.status === 'captured' || payment.status === 'authorized';
  const orderMatches = payment.order_id === params.expectedOrderId;
  const amountMatches = Number(payment.amount) === expectedPaise;
  const currencyMatches = payment.currency === 'INR';

  return {
    verified: statusOk && orderMatches && amountMatches && currencyMatches,
    status: String(payment.status),
    amountPaise: Number(payment.amount),
  };
}

export function verifyRazorpayWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  const { webhookSecret } = getCredentials();
  if (!webhookSecret || !signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(signatureHeader.trim(), 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
