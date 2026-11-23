import { X } from 'lucide-react';
import type { EventConfig } from '../../shared/types.ts';

export type PolicyTab = 'terms' | 'privacy' | 'refund';

export function PolicyModal({
  openTab,
  onClose,
  onSelectTab,
  eventConfig,
}: {
  openTab: PolicyTab | null;
  onClose: () => void;
  onSelectTab: (tab: PolicyTab) => void;
  eventConfig: EventConfig;
}) {
  if (!openTab) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-modal-title"
    >
      <div className="w-full max-w-2xl bg-[#0E1420] border border-white/15 rounded-xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 id="policy-modal-title" className="font-display text-2xl font-semibold text-[#F8F7F2]">
            Event Policies
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close policies dialog"
            className="p-2 text-slate-400 hover:text-[#F8F7F2] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-6 pt-4 border-b border-white/10">
          {(
            [
              { id: 'terms', label: 'Terms & Conditions' },
              { id: 'privacy', label: 'Privacy Policy' },
              { id: 'refund', label: 'Refund & Cancellation' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                openTab === tab.id
                  ? 'border-[#D6B36A] text-[#D6B36A]'
                  : 'border-transparent text-slate-400 hover:text-[#F8F7F2]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6 max-h-[65vh] overflow-y-auto text-sm text-slate-300 space-y-4 leading-relaxed">
          {openTab === 'terms' && (
            <>
              <p>
                By purchasing a ticket for <strong className="text-[#F8F7F2]">{eventConfig.eventName}</strong>,
                you agree to comply with all venue safety protocols, entry verification procedures,
                and local regulations applicable at {eventConfig.venueName}.
              </p>
              <p>
                Each issued QR pass permits single-entry check-in for one ticket holder. Duplicate,
                tampered, or previously scanned passes are automatically rejected at the entrance gate.
              </p>
              <p>
                Attendees must present a valid government-issued photo ID matching the booking details
                upon request by venue security.
              </p>
            </>
          )}
          {openTab === 'privacy' && (
            <>
              <p>
                We collect your Full Name, Email Address, and Mobile Number solely to process your
                ticket reservation, verify Razorpay payment transactions, generate official QR/PDF
                passes, and deliver booking confirmations.
              </p>
              <p>
                Your payment card, UPI, and banking details are processed directly by Razorpay and
                are never stored on our servers. QR codes contain only an opaque cryptographic ticket
                identifier with no customer email or phone number embedded.
              </p>
              <p>
                For privacy inquiries, contact {eventConfig.contactEmail}.
              </p>
            </>
          )}
          {openTab === 'refund' && (
            <>
              <p>
                All confirmed ticket bookings for <strong className="text-[#F8F7F2]">{eventConfig.eventName}</strong>{' '}
                are final and non-refundable once payment is captured and passes are issued.
              </p>
              <p>
                In the event of a full event cancellation by the organizer, face-value ticket
                refunds will be processed back to the original Razorpay payment instrument within
                5–7 business days.
              </p>
              <p>
                For payment failures where funds were debited without confirmation, contact{' '}
                {eventConfig.contactEmail} with your Booking Reference and Razorpay Payment ID.
              </p>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#D6B36A] text-[#080B12] text-sm font-semibold rounded-lg hover:bg-[#e3c583] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
