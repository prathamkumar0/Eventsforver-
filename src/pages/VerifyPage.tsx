import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Html5Qrcode } from 'html5-qrcode';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  QrCode,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { TicketRecord, TicketStatus } from '../../shared/types.ts';
import { auth, signInOrganizerWithGoogle } from '../lib/firebase.ts';

interface PublicVerifyResult {
  authentic: boolean;
  ticketCode?: string;
  bookingCode?: string;
  categoryName?: string;
  status?: TicketStatus;
  checkedInAt?: string | null;
  eventName?: string;
  eventDate?: string;
  venueName?: string;
  error?: string;
}

interface AdminVerifyResult {
  valid: boolean;
  ticket: TicketRecord;
  booking: {
    id: string;
    bookingCode: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    paymentStatus: string;
  };
  eventConfig: {
    eventName: string;
    eventDate: string;
    venueName: string;
  };
}

export function VerifyPage({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [codeInput, setCodeInput] = useState('');
  const [publicResult, setPublicResult] = useState<PublicVerifyResult | null>(null);
  const [adminResult, setAdminResult] = useState<AdminVerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return unsub;
  }, []);

  const lookupAdminTicket = useCallback(async (rawCode: string) => {
    if (!auth.currentUser || !rawCode.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    setActionMsg(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/tickets/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ codeOrToken: rawCode.trim() }),
      });
      const data = (await res.json()) as AdminVerifyResult & { error?: string };
      if (!res.ok) {
        setAdminResult(null);
        throw new Error(data.error || 'Ticket verification failed.');
      }
      setAdminResult(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to verify ticket.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    if (tokenParam) {
      setCodeInput(tokenParam);
      if (user) {
        void lookupAdminTicket(tokenParam);
      } else {
        setLoading(true);
        fetch(`/api/tickets/verify-public?token=${encodeURIComponent(tokenParam)}`)
          .then((r) => r.json())
          .then((data: PublicVerifyResult) => setPublicResult(data))
          .catch(() => setPublicResult({ authentic: false, error: 'Verification request failed.' }))
          .finally(() => setLoading(false));
      }
    }
  }, [user, lookupAdminTicket]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // ignore stop errors
      }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, [stopScanner]);

  const startScanner = async () => {
    setErrorMsg(null);
    setActionMsg(null);
    try {
      const qr = new Html5Qrcode('qr-reader-region');
      scannerRef.current = qr;
      setScanning(true);
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          setCodeInput(decodedText);
          void stopScanner();
          void lookupAdminTicket(decodedText);
        },
        () => undefined,
      );
    } catch (err) {
      setScanning(false);
      setErrorMsg(
        err instanceof Error
          ? `Camera unavailable: ${err.message}. Enter the Ticket ID manually below.`
          : 'Camera unavailable.',
      );
    }
  };

  const handleCheckIn = async () => {
    if (!auth.currentUser || !adminResult) return;
    setLoading(true);
    setErrorMsg(null);
    setActionMsg(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/tickets/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ codeOrToken: adminResult.ticket.id }),
      });
      const data = (await res.json()) as {
        outcome?: string;
        ticket?: TicketRecord;
        error?: string;
      };
      if (!res.ok) {
        if (data.ticket) {
          setAdminResult({ ...adminResult, ticket: data.ticket });
        }
        throw new Error(data.error || 'Check-in rejected.');
      }
      if (data.ticket) {
        setAdminResult({ ...adminResult, ticket: data.ticket });
      }
      setActionMsg(`Checked in ${adminResult.ticket.ticketCode} successfully.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Check-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (status: TicketStatus) => {
    if (!auth.currentUser || !adminResult) return;
    setErrorMsg(null);
    setActionMsg(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(
        `/api/admin/tickets/${encodeURIComponent(adminResult.ticket.id)}/status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ status }),
        },
      );
      const data = (await res.json()) as { ticket?: TicketRecord; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to update status.');
      if (data.ticket) {
        setAdminResult({ ...adminResult, ticket: data.ticket });
      }
      setActionMsg(`Ticket status updated to ${status}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Status update failed.');
    }
  };

  return (
    <div className="min-h-screen bg-[#080B12] text-[#F8F7F2] p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D6B36A]">
              Gate Verification System
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#F8F7F2]">
              Jingle Bell Rock 1.0 Check-In
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('/admin')}
              className="px-3.5 py-2 border border-white/15 rounded-lg text-xs font-medium text-slate-200 hover:bg-white/5"
            >
              Admin Console
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-white/15 rounded-lg text-xs font-medium text-slate-200 hover:bg-white/5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Event Site
            </button>
          </div>
        </div>

        {/* Public Guest QR Scan Authenticity View */}
        {!user && publicResult && (
          <div className="border border-white/15 bg-[#0E1420] rounded-xl p-6 space-y-4">
            {publicResult.authentic ? (
              <>
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  <div>
                    <div className="font-semibold text-emerald-300">Authentic Official Pass</div>
                    <div className="text-xs text-slate-400">
                      {publicResult.eventName} · {publicResult.eventDate} · {publicResult.venueName}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-white/10 pt-4 text-xs">
                  <div>
                    <div className="text-slate-400">Ticket ID</div>
                    <div className="font-mono font-semibold text-[#D6B36A] mt-0.5">
                      {publicResult.ticketCode}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Booking ID</div>
                    <div className="font-mono font-semibold mt-0.5">{publicResult.bookingCode}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Category</div>
                    <div className="font-semibold mt-0.5">{publicResult.categoryName}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Gate Status</div>
                    <div className="font-semibold mt-0.5">{publicResult.status}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 text-red-300">
                <XCircle className="w-6 h-6 shrink-0" />
                <span>{publicResult.error || 'Ticket could not be verified.'}</span>
              </div>
            )}
          </div>
        )}

        {/* Organizer Authentication Prompt */}
        {!user ? (
          <div className="border border-white/10 bg-[#0E1420] rounded-xl p-8 text-center space-y-4">
            <QrCode className="w-10 h-10 text-[#D6B36A] mx-auto" />
            <h2 className="font-display text-2xl font-semibold text-[#F8F7F2]">
              Organizer Gate Scanner
            </h2>
            <p className="text-sm text-slate-300 max-w-md mx-auto">
              Authorized event staff must sign in with an organizer Google account to scan attendee QR codes and mark tickets as checked in.
            </p>
            <button
              type="button"
              onClick={() => void signInOrganizerWithGoogle()}
              className="px-6 py-2.5 bg-[#D6B36A] hover:bg-[#e5c784] text-[#080B12] text-sm font-semibold rounded-lg transition-colors"
            >
              Sign in as Organizer
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Camera QR Scanner + Manual Input */}
            <div className="border border-white/10 bg-[#0E1420] rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[#F8F7F2]">
                  Scan QR Code or Enter Ticket ID
                </div>
                {!scanning ? (
                  <button
                    type="button"
                    onClick={() => void startScanner()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#D6B36A] hover:bg-[#e5c784] text-[#080B12] text-xs font-semibold rounded-lg"
                  >
                    <Camera className="w-4 h-4" />
                    Start Camera Scanner
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void stopScanner()}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-red-400/40 text-red-200 text-xs font-semibold rounded-lg"
                  >
                    <CameraOff className="w-4 h-4" />
                    Stop Camera
                  </button>
                )}
              </div>

              <div
                id="qr-reader-region"
                className={scanning ? 'rounded-lg overflow-hidden border border-[#D6B36A]/40 bg-black' : 'hidden'}
              />

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void lookupAdminTicket(codeInput);
                }}
                className="flex flex-col sm:flex-row gap-3"
              >
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="Enter Ticket Code (e.g. TKT-A1B2C3D4) or paste QR URL..."
                    className="w-full pl-10 pr-4 py-2.5 bg-[#080B12] border border-white/15 rounded-lg text-sm font-mono text-[#F8F7F2] placeholder:text-slate-500 focus:outline-none focus:border-[#D6B36A]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 bg-[#D72638] hover:bg-[#b81d2d] text-[#F8F7F2] text-sm font-semibold rounded-lg whitespace-nowrap shrink-0"
                >
                  {loading ? 'Checking...' : 'Verify Ticket'}
                </button>
              </form>
            </div>

            {errorMsg && (
              <div className="border border-[#D72638]/50 bg-[#8F1528]/30 rounded-xl p-4 text-sm text-red-100 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#D72638] shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {actionMsg && (
              <div className="border border-emerald-500/40 bg-emerald-950/30 rounded-xl p-4 text-sm text-emerald-200 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>{actionMsg}</span>
              </div>
            )}

            {adminResult && (
              <div className="border border-white/15 bg-[#0E1420] rounded-xl p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
                  <div>
                    <div className="text-xs text-slate-400">
                      {adminResult.eventConfig.eventName} · {adminResult.eventConfig.venueName}
                    </div>
                    <div className="font-mono text-2xl font-bold text-[#D6B36A] mt-1">
                      {adminResult.ticket.ticketCode}
                    </div>
                  </div>
                  <div
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide ${
                      adminResult.ticket.status === 'VALID'
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                        : adminResult.ticket.status === 'USED'
                        ? 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
                        : 'bg-red-950/60 text-red-300 border border-red-500/40'
                    }`}
                  >
                    STATUS: {adminResult.ticket.status}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-400">Pass Category</div>
                    <div className="font-semibold text-[#F8F7F2]">
                      {adminResult.ticket.categoryName}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Attendee Name</div>
                    <div className="font-semibold text-[#F8F7F2]">
                      {adminResult.ticket.customerName}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Booking ID</div>
                    <div className="font-mono text-[#F8F7F2]">
                      {adminResult.booking.bookingCode} ({adminResult.booking.paymentStatus})
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Contact</div>
                    <div className="text-slate-300">
                      {adminResult.booking.customerEmail} · {adminResult.booking.customerPhone}
                    </div>
                  </div>
                </div>

                {adminResult.ticket.checkedInAt && (
                  <div className="border border-amber-500/30 bg-amber-950/20 rounded-lg p-3 text-xs text-amber-200">
                    Checked in at <span className="font-mono">{adminResult.ticket.checkedInAt}</span> by{' '}
                    {adminResult.ticket.checkedInBy}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    disabled={loading || adminResult.ticket.status !== 'VALID' || !adminResult.valid}
                    onClick={() => void handleCheckIn()}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/10 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    Mark as Checked In
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleStatusChange('CANCELLED')}
                    className="px-4 py-2 border border-white/15 hover:border-red-400/50 text-xs text-slate-300 rounded-lg"
                  >
                    Mark Cancelled
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStatusChange('REFUNDED')}
                    className="px-4 py-2 border border-white/15 hover:border-red-400/50 text-xs text-slate-300 rounded-lg"
                  >
                    Mark Refunded
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
