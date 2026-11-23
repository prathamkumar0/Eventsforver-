import { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Lock,
  Mail,
  ShieldCheck,
  Ticket,
  X,
} from 'lucide-react';
import type {
  BookingRecord,
  EventConfig,
  PaymentReadiness,
  PublicTicketCategory,
  TicketRecord,
} from '../../shared/types.ts';
import type { PolicyTab } from './PolicyModal.tsx';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

interface SelectedLine {
  category: PublicTicketCategory;
  quantity: number;
}

interface ConfirmedResult {
  booking: BookingRecord;
  tickets: TicketRecord[];
  qrDataUrls: Record<string, string>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[+\d][\d\s-]{7,18}$/;

export function CheckoutModal({
  open,
  onClose,
  selectedLines,
  eventConfig,
  paymentReadiness,
  subtotalInr,
  taxInr,
  platformFeeInr,
  totalInr,
  totalQuantity,
  onOpenPolicy,
  onBookingCompleted,
}: {
  open: boolean;
  onClose: () => void;
  selectedLines: SelectedLine[];
  eventConfig: EventConfig;
  paymentReadiness: PaymentReadiness;
  subtotalInr: number;
  taxInr: number;
  platformFeeInr: number;
  totalInr: number;
  totalQuantity: number;
  onOpenPolicy: (tab: PolicyTab) => void;
  onBookingCompleted: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [configNotice, setConfigNotice] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedResult | null>(null);

  if (!open) return null;

  const fireCelebrationConfetti = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try {
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.6 },
        colors: ['#D6B36A', '#D72638', '#F8F7F2', '#0B3025'],
      });
    } catch {
      // Ignore confetti runtime failures
    }
  };

  const handleClose = () => {
    if (submitting || verifying) return;
    setErrorMsg(null);
    setConfigNotice(null);
    if (confirmed) {
      setConfirmed(null);
      setFullName('');
      setEmail('');
      setPhone('');
      setAcceptedTerms(false);
    }
    onClose();
  };

  const validateForm = (): string | null => {
    if (fullName.trim().length < 2) {
      return 'Please enter your full name as it should appear on the event pass.';
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      return 'Please enter a valid email address. Your official QR and PDF tickets are sent here.';
    }
    if (!PHONE_PATTERN.test(phone.trim())) {
      return 'Please enter a valid mobile number (e.g. +91 9876543210).';
    }
    if (!acceptedTerms) {
      return 'Please accept the Terms & Conditions, Privacy Policy, and Refund Policy to continue.';
    }
    if (selectedLines.length === 0 || totalQuantity <= 0) {
      return 'Please select at least one ticket before proceeding.';
    }
    return null;
  };

  const handleProceedPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || verifying) return;

    setErrorMsg(null);
    setConfigNotice(null);

    const validationError = validateForm();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/checkout/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: fullName.trim(),
          customerEmail: email.trim(),
          customerPhone: phone.trim(),
          acceptedTerms,
          items: selectedLines.map((line) => ({
            categoryId: line.category.id,
            quantity: line.quantity,
          })),
        }),
      });

      const data = (await res.json()) as {
        code?: string;
        error?: string;
        bookingId?: string;
        bookingCode?: string;
        accessToken?: string;
        razorpayOrderId?: string;
        amountPaise?: number;
        currency?: string;
        keyId?: string;
        eventName?: string;
      };

      if (!res.ok) {
        if (data.code === 'RAZORPAY_NOT_CONFIGURED') {
          setConfigNotice(
            data.error ||
              'Razorpay credentials are not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your server environment variables.',
          );
          setSubmitting(false);
          return;
        }
        throw new Error(data.error || 'Could not create payment order.');
      }

      if (!window.Razorpay) {
        throw new Error(
          'Razorpay Checkout script failed to load. Please check your network connection and refresh.',
        );
      }

      const bookingId = data.bookingId!;
      const accessToken = data.accessToken!;

      const rzp = new window.Razorpay({
        key: data.keyId,
        amount: data.amountPaise,
        currency: data.currency || 'INR',
        name: data.eventName || eventConfig.eventName,
        description: `Booking ${data.bookingCode} (${totalQuantity} pass${totalQuantity > 1 ? 'es' : ''})`,
        order_id: data.razorpayOrderId,
        prefill: {
          name: fullName.trim(),
          email: email.trim(),
          contact: phone.trim(),
        },
        theme: {
          color: '#D72638',
        },
        modal: {
          ondismiss: async () => {
            setSubmitting(false);
            await fetch('/api/checkout/fail', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingId, accessToken, status: 'CANCELLED' }),
            }).catch(() => undefined);
            onBookingCompleted();
            setErrorMsg('Payment was cancelled before completion. Any held tickets have been released.');
          },
        },
        handler: async (paymentResponse: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          setVerifying(true);
          setSubmitting(false);
          try {
            const verifyRes = await fetch('/api/checkout/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bookingId,
                accessToken,
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature,
              }),
            });

            const verifyData = (await verifyRes.json()) as {
              error?: string;
              booking?: BookingRecord;
              tickets?: TicketRecord[];
              qrDataUrls?: Record<string, string>;
            };

            if (!verifyRes.ok || !verifyData.booking || !verifyData.tickets) {
              throw new Error(verifyData.error || 'Server payment verification failed.');
            }

            setConfirmed({
              booking: verifyData.booking,
              tickets: verifyData.tickets,
              qrDataUrls: verifyData.qrDataUrls || {},
            });
            onBookingCompleted();
            fireCelebrationConfetti();
          } catch (err) {
            setErrorMsg(
              err instanceof Error
                ? err.message
                : 'Unable to verify payment on server. Contact support with your payment ID.',
            );
          } finally {
            setVerifying(false);
          }
        },
      });

      rzp.on('payment.failed', async () => {
        setSubmitting(false);
        await fetch('/api/checkout/fail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId, accessToken, status: 'FAILED' }),
        }).catch(() => undefined);
        onBookingCompleted();
        setErrorMsg('Payment failed at Razorpay gateway. No tickets were charged; please try again.');
      });

      rzp.open();
    } catch (err) {
      setSubmitting(false);
      setErrorMsg(err instanceof Error ? err.message : 'Checkout initialization failed.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
    >
      <div className="w-full max-w-3xl bg-[#0E1420] border border-white/15 rounded-xl overflow-hidden shadow-2xl my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#080B12]">
          <div className="flex items-center gap-3">
            {eventConfig.logoUrl && (
              <img
                src={eventConfig.logoUrl}
                alt="Events Forever logo"
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-md object-contain bg-black border border-[#D6B36A]/45 shrink-0 hidden sm:block"
              />
            )}
            <div>
              <h2 id="checkout-modal-title" className="font-display text-2xl font-semibold text-[#F8F7F2]">
                {confirmed ? 'Booking Confirmed' : 'Complete Your Ticket Booking'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {eventConfig.eventName} · {eventConfig.eventDate} · {eventConfig.venueName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting || verifying}
            aria-label="Close checkout"
            className="p-2 text-slate-400 hover:text-[#F8F7F2] rounded-lg transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {verifying ? (
          <div className="p-10 text-center space-y-4">
            <div className="w-10 h-10 border-2 border-[#D6B36A] border-t-transparent rounded-full animate-spin mx-auto" />
            <h3 className="font-display text-2xl font-semibold text-[#F8F7F2]">
              Verifying Payment &amp; Generating Passes
            </h3>
            <p className="text-sm text-slate-300 max-w-md mx-auto">
              Confirming cryptographic signature with Razorpay and issuing your unique QR tickets. Please do not close this window.
            </p>
          </div>
        ) : confirmed ? (
          <div className="p-6 sm:p-8 max-h-[80vh] overflow-y-auto space-y-6">
            <div className="border border-emerald-500/30 bg-emerald-950/25 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-emerald-300">
                    Payment Verified — Status: {confirmed.booking.paymentStatus}
                  </div>
                  <div className="text-xs text-slate-300 mt-1">
                    Booking Reference:{' '}
                    <span className="font-mono text-[#D6B36A] font-semibold">
                      {confirmed.booking.bookingCode}
                    </span>
                    {confirmed.booking.razorpayPaymentId && (
                      <> · Payment ID: <span className="font-mono">{confirmed.booking.razorpayPaymentId}</span></>
                    )}
                  </div>
                </div>
              </div>
              <a
                href={`/api/bookings/${encodeURIComponent(confirmed.booking.id)}/pdf?token=${encodeURIComponent(
                  confirmed.booking.accessToken,
                )}`}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#D72638] hover:bg-[#b81d2d] text-[#F8F7F2] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                Download Your Ticket
              </a>
            </div>

            <div className="border border-white/10 bg-[#080B12] rounded-lg p-4 flex items-start gap-3 text-sm">
              <Mail className="w-5 h-5 text-[#D6B36A] shrink-0 mt-0.5" />
              <div>
                {confirmed.booking.emailStatus === 'SENT' ? (
                  <p className="text-slate-200">
                    Your official PDF and QR tickets have been emailed to{' '}
                    <strong className="text-[#F8F7F2]">{confirmed.booking.customerEmail}</strong>.
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-amber-300 font-medium">
                      Your tickets are issued and ready to download above.
                    </p>
                    <p className="text-xs text-slate-400">
                      Automatic email delivery is currently pending ({confirmed.booking.emailError || confirmed.booking.emailStatus}). Save or download your PDF ticket right here, or ask the organizer to resend once email credentials are active.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#D6B36A] tracking-wide mb-3">
                Issued Event Passes ({confirmed.tickets.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {confirmed.tickets.map((ticket, index) => (
                  <div
                    key={ticket.id}
                    className="border border-white/10 bg-[#080B12] rounded-xl p-4 flex items-center gap-4"
                  >
                    {confirmed.qrDataUrls[ticket.id] && (
                      <img
                        src={confirmed.qrDataUrls[ticket.id]}
                        alt={`QR code for ${ticket.ticketCode}`}
                        className="w-24 h-24 rounded-md bg-[#F8F7F2] p-1 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs text-slate-400">
                        Pass {index + 1} of {confirmed.tickets.length} · {ticket.status}
                      </div>
                      <div className="font-mono text-sm font-semibold text-[#D6B36A] mt-0.5">
                        {ticket.ticketCode}
                      </div>
                      <div className="text-sm font-medium text-[#F8F7F2] truncate mt-1">
                        {ticket.categoryName}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {ticket.customerName}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-[#F8F7F2] text-sm font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleProceedPayment} className="p-6 sm:p-8 max-h-[82vh] overflow-y-auto">
            {!paymentReadiness.razorpayConfigured && (
              <div className="mb-6 border border-amber-500/35 bg-amber-950/25 rounded-lg p-4 text-xs text-amber-200 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Razorpay Credentials Needed:</span>{' '}
                  Set <code className="font-mono text-amber-100">RAZORPAY_KEY_ID</code> and{' '}
                  <code className="font-mono text-amber-100">RAZORPAY_KEY_SECRET</code> in your
                  environment variables to activate Razorpay Test Mode or Live Mode checkout.
                </div>
              </div>
            )}

            {configNotice && (
              <div className="mb-6 border border-amber-500/40 bg-amber-950/35 rounded-lg p-4 text-sm text-amber-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">Gateway Not Configured Yet</div>
                  <p className="text-xs text-amber-100/90 leading-relaxed">{configNotice}</p>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="mb-6 border border-[#D72638]/50 bg-[#8F1528]/30 rounded-lg p-4 text-sm text-red-100 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#D72638] shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 space-y-5">
                <div>
                  <label htmlFor="checkout-name" className="block text-sm font-medium text-slate-200 mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="checkout-name"
                    type="text"
                    required
                    maxLength={120}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter attendee full name"
                    className="w-full px-4 py-2.5 bg-[#080B12] border border-white/15 rounded-lg text-sm text-[#F8F7F2] placeholder:text-slate-500 focus:outline-none focus:border-[#D6B36A]"
                  />
                </div>

                <div>
                  <label htmlFor="checkout-email" className="block text-sm font-medium text-slate-200 mb-1.5">
                    Email Address
                  </label>
                  <input
                    id="checkout-email"
                    type="email"
                    required
                    maxLength={160}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-2.5 bg-[#080B12] border border-white/15 rounded-lg text-sm text-[#F8F7F2] placeholder:text-slate-500 focus:outline-none focus:border-[#D6B36A]"
                  />
                  <p className="text-xs text-slate-400 mt-1.5">
                    Your QR code and official PDF tickets will be delivered to this email address.
                  </p>
                </div>

                <div>
                  <label htmlFor="checkout-phone" className="block text-sm font-medium text-slate-200 mb-1.5">
                    Mobile Number
                  </label>
                  <input
                    id="checkout-phone"
                    type="tel"
                    required
                    maxLength={20}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-4 py-2.5 bg-[#080B12] border border-white/15 rounded-lg text-sm text-[#F8F7F2] placeholder:text-slate-500 focus:outline-none focus:border-[#D6B36A]"
                  />
                </div>

                <div className="pt-2">
                  <label className="flex items-start gap-3 cursor-pointer text-xs text-slate-300 leading-relaxed">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-white/30 bg-[#080B12] accent-[#D6B36A]"
                    />
                    <span>
                      I agree to the{' '}
                      <button
                        type="button"
                        onClick={() => onOpenPolicy('terms')}
                        className="text-[#D6B36A] underline hover:text-[#f0d38c]"
                      >
                        Terms &amp; Conditions
                      </button>
                      ,{' '}
                      <button
                        type="button"
                        onClick={() => onOpenPolicy('privacy')}
                        className="text-[#D6B36A] underline hover:text-[#f0d38c]"
                      >
                        Privacy Policy
                      </button>
                      , and{' '}
                      <button
                        type="button"
                        onClick={() => onOpenPolicy('refund')}
                        className="text-[#D6B36A] underline hover:text-[#f0d38c]"
                      >
                        Refund &amp; Cancellation Policy
                      </button>
                      .
                    </span>
                  </label>
                </div>
              </div>

              <div className="lg:col-span-5 bg-[#080B12] border border-white/10 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#D6B36A] tracking-wide mb-4">
                    <Ticket className="w-4 h-4" />
                    <span>Booking Summary ({totalQuantity} pass{totalQuantity > 1 ? 'es' : ''})</span>
                  </div>

                  <div className="space-y-3 border-b border-white/10 pb-4">
                    {selectedLines.map(({ category, quantity }) => (
                      <div key={category.id} className="flex items-start justify-between gap-2 text-sm">
                        <div>
                          <div className="text-[#F8F7F2] font-medium">{category.name}</div>
                          <div className="text-xs text-slate-400 font-mono">
                            {quantity} x ₹{category.priceInr.toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div className="font-mono text-[#F8F7F2]">
                          ₹{(category.priceInr * quantity).toLocaleString('en-IN')}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 py-4 text-xs text-slate-300 border-b border-white/10">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-mono">₹{subtotalInr.toLocaleString('en-IN')}</span>
                    </div>
                    {eventConfig.taxPercent > 0 && (
                      <div className="flex justify-between">
                        <span>Applicable Taxes ({eventConfig.taxPercent}%)</span>
                        <span className="font-mono">₹{taxInr.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {eventConfig.platformFeeInr > 0 && (
                      <div className="flex justify-between">
                        <span>Booking Fee</span>
                        <span className="font-mono">₹{platformFeeInr.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <span className="text-sm font-semibold text-[#F8F7F2]">Final Payable</span>
                    <span className="font-mono text-xl font-bold text-[#D6B36A]">
                      ₹{totalInr.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-4 bg-[#D72638] hover:bg-[#b81d2d] disabled:opacity-60 text-[#F8F7F2] text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    {submitting ? 'Creating Secure Order...' : 'Proceed to Secure Payment'}
                  </button>
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#D6B36A]" />
                    <span>
                      Secured by Razorpay ({paymentReadiness.mode === 'live' ? 'Live Mode' : 'Test Mode'})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
