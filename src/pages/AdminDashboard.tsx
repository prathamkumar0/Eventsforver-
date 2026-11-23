import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarCog,
  CheckCircle2,
  Download,
  LogOut,
  Mail,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  Ticket,
  Trash2,
  Users,
} from 'lucide-react';
import type {
  AdminOverviewPayload,
  EventConfig,
  PublicTicketCategory,
} from '../../shared/types.ts';
import { auth, signInOrganizerWithGoogle, signOutOrganizer } from '../lib/firebase.ts';

type AdminTab = 'overview' | 'bookings' | 'categories' | 'settings';

export function AdminDashboard({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Bookings filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Category creation / editing state
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatPrice, setNewCatPrice] = useState('1999');
  const [newCatInventory, setNewCatInventory] = useState('50');
  const [newCatBenefits, setNewCatBenefits] = useState('[Editable Benefit 1]\n[Editable Benefit 2]');
  const [editingCat, setEditingCat] = useState<PublicTicketCategory | null>(null);

  // Editable Event Config draft
  const [configDraft, setConfigDraft] = useState<EventConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  const getToken = useCallback(async () => {
    if (!auth.currentUser) throw new Error('Not signed in.');
    return auth.currentUser.getIdToken();
  }, []);

  const fetchOverview = useCallback(async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as AdminOverviewPayload & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load organizer dashboard.');
      }
      setOverview(data);
      setConfigDraft(data.eventConfig);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (authReady && user) {
      void fetchOverview();
    }
  }, [authReady, user, fetchOverview]);

  const handleSignIn = async () => {
    setErrorMsg(null);
    try {
      await signInOrganizerWithGoogle();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign-in cancelled.');
    }
  };

  const handleSignOut = async () => {
    await signOutOrganizer();
    setOverview(null);
  };

  const filteredBookings = useMemo(() => {
    if (!overview) return [];
    const q = searchQuery.trim().toLowerCase();
    return overview.bookings.filter((b) => {
      if (statusFilter !== 'ALL' && b.paymentStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        b.bookingCode.toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        b.customerEmail.toLowerCase().includes(q) ||
        b.customerPhone.toLowerCase().includes(q)
      );
    });
  }, [overview, searchQuery, statusFilter]);

  const handleResendEmail = async (bookingId: string) => {
    setResendingId(bookingId);
    setStatusBanner(null);
    setErrorMsg(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/resend-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as {
        emailStatus?: string;
        emailError?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Resend failed.');
      setStatusBanner(
        data.emailStatus === 'SENT'
          ? 'Ticket email sent successfully.'
          : `Email status: ${data.emailStatus}${data.emailError ? ` (${data.emailError})` : ''}`,
      );
      await fetchOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to resend email.');
    } finally {
      setResendingId(null);
    }
  };

  const handleExportCsv = async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/bookings/export.csv', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to export CSV.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'jingle-bell-rock-bookings.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'CSV export failed.');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusBanner(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newCatName,
          description: newCatDesc || '[Editable ticket category description]',
          priceInr: Number(newCatPrice),
          isPlaceholderPrice: false,
          totalInventory: Number(newCatInventory),
          benefits: newCatBenefits.split('\n').map((s) => s.trim()).filter(Boolean),
          enabled: true,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not create category.');
      setNewCatName('');
      setNewCatDesc('');
      setStatusBanner('New ticket category added.');
      await fetchOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Category creation failed.');
    }
  };

  const handleSaveCategoryEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat) return;
    setErrorMsg(null);
    setStatusBanner(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/categories/${encodeURIComponent(editingCat.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editingCat.name,
          description: editingCat.description,
          priceInr: editingCat.priceInr,
          isPlaceholderPrice: editingCat.isPlaceholderPrice,
          totalInventory: editingCat.totalInventory,
          benefits: editingCat.benefits,
          enabled: editingCat.enabled,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to update category.');
      setEditingCat(null);
      setStatusBanner('Ticket category updated.');
      await fetchOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const handleToggleCategory = async (cat: PublicTicketCategory) => {
    setErrorMsg(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/categories/${encodeURIComponent(cat.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: !cat.enabled }),
      });
      if (!res.ok) throw new Error('Failed to toggle category.');
      await fetchOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Toggle failed.');
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    setErrorMsg(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/categories/${encodeURIComponent(catId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      setStatusBanner('Category deleted.');
      await fetchOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configDraft) return;
    setSavingConfig(true);
    setErrorMsg(null);
    setStatusBanner(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/event-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(configDraft),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to save event settings.');
      setStatusBanner('Event configuration saved and live on landing page.');
      await fetchOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingConfig(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#080B12] text-[#F8F7F2] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#D6B36A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#080B12] text-[#F8F7F2] flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-white/10 bg-[#0E1420] rounded-xl p-8 space-y-6">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D6B36A]">
              Organizer Console
            </div>
            <h1 className="font-display text-3xl font-semibold text-[#F8F7F2]">
              Admin Sign-In Required
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Sign in with your authorized organizer Google account to manage ticket inventory, event configuration, bookings, and email delivery.
            </p>
          </div>

          {errorMsg && (
            <div className="border border-[#D72638]/40 bg-[#8F1528]/25 rounded-lg p-3 text-xs text-red-200">
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            onClick={handleSignIn}
            className="w-full py-3 px-4 bg-[#D6B36A] hover:bg-[#e5c784] text-[#080B12] text-sm font-semibold rounded-lg transition-colors"
          >
            Sign in with Google
          </button>

          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="w-full py-2.5 px-4 border border-white/15 hover:border-white/30 text-slate-300 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Event Website
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080B12] text-[#F8F7F2] flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0A0E17] p-5 flex flex-col justify-between shrink-0">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            {overview?.eventConfig.logoUrl && (
              <img
                src={overview.eventConfig.logoUrl}
                alt="Events Forever logo"
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-md object-contain bg-black border border-[#D6B36A]/45 shrink-0"
              />
            )}
            <div>
              <div className="font-display text-2xl font-semibold text-[#F8F7F2]">
                {overview?.eventConfig.eventName || 'Jingle Bell Rock 1.0'}
              </div>
              <div className="text-xs text-[#D6B36A] mt-0.5">Organizer Dashboard</div>
            </div>
          </div>

          <nav className="flex lg:flex-col gap-1.5 overflow-x-auto">
            {(
              [
                { id: 'overview', label: 'Overview', icon: BarChart3 },
                { id: 'bookings', label: 'Bookings', icon: Users },
                { id: 'categories', label: 'Ticket Tiers', icon: Ticket },
                { id: 'settings', label: 'Event Settings', icon: CalendarCog },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#D6B36A]/15 text-[#D6B36A] border border-[#D6B36A]/35'
                      : 'text-slate-300 hover:bg-white/5 hover:text-[#F8F7F2] border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => onNavigate('/verify')}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-[#F8F7F2] transition-colors whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4 shrink-0 text-[#A9DDF5]" />
              <span>Gate Scanner</span>
            </button>
          </nav>
        </div>

        <div className="hidden lg:block pt-6 border-t border-white/10 space-y-3">
          <div className="text-xs text-slate-400 truncate">{user.email}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="flex-1 px-3 py-2 border border-white/15 rounded-lg text-xs font-medium text-slate-300 hover:text-[#F8F7F2]"
            >
              View Site
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="p-2 border border-white/15 rounded-lg text-slate-300 hover:text-red-300"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="text-xs text-slate-400">
              Admin / {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </div>
            <h1 className="font-display text-3xl font-semibold text-[#F8F7F2]">
              {activeTab === 'overview' && 'Event Revenue & Inventory'}
              {activeTab === 'bookings' && 'Customer Bookings & Tickets'}
              {activeTab === 'categories' && 'Ticket Categories & Pricing'}
              {activeTab === 'settings' && 'Central Event Configuration'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchOverview()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 border border-white/15 rounded-lg text-xs font-medium text-slate-200 hover:bg-white/5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="lg:hidden px-3.5 py-2 border border-white/15 rounded-lg text-xs font-medium text-slate-200"
            >
              Public Site
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="border border-[#D72638]/45 bg-[#8F1528]/25 rounded-lg p-4 text-sm text-red-200 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-[#D72638] shrink-0 mt-0.5" />
            <div className="flex-1">
              <div>{errorMsg}</div>
              {errorMsg.toLowerCase().includes('access denied') && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mt-2 text-xs underline text-[#D6B36A]"
                >
                  Switch Google Account
                </button>
              )}
            </div>
          </div>
        )}

        {statusBanner && (
          <div className="border border-emerald-500/35 bg-emerald-950/25 rounded-lg p-4 text-sm text-emerald-200 flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusBanner}</span>
          </div>
        )}

        {overview && activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  label: 'Total Revenue',
                  value: `₹${overview.metrics.totalRevenueInr.toLocaleString('en-IN')}`,
                },
                {
                  label: 'Tickets Sold',
                  value: overview.metrics.totalTicketsSold.toLocaleString('en-IN'),
                },
                {
                  label: 'Total Bookings',
                  value: overview.metrics.totalBookings.toLocaleString('en-IN'),
                },
                {
                  label: 'Available Passes',
                  value: overview.metrics.availableTicketsCount.toLocaleString('en-IN'),
                },
                {
                  label: 'Successful Payments',
                  value: overview.metrics.paidBookingsCount.toLocaleString('en-IN'),
                },
                {
                  label: 'Pending Checkouts',
                  value: overview.metrics.pendingBookingsCount.toLocaleString('en-IN'),
                },
                {
                  label: 'Failed / Cancelled',
                  value: overview.metrics.failedBookingsCount.toLocaleString('en-IN'),
                },
                {
                  label: 'Sold-Out Categories',
                  value: overview.metrics.soldOutCategoriesCount.toLocaleString('en-IN'),
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="border border-white/10 bg-[#0E1420] rounded-xl p-5"
                >
                  <div className="text-xs text-slate-400">{kpi.label}</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-[#F8F7F2] mt-2">
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Readiness Panel */}
            <div className="border border-white/10 bg-[#0E1420] rounded-xl p-6 space-y-4">
              <h2 className="font-display text-2xl font-semibold text-[#F8F7F2]">
                Gateway &amp; Delivery Configuration
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="border border-white/10 bg-[#080B12] rounded-lg p-4">
                  <div className="text-xs text-slate-400">Razorpay Gateway</div>
                  <div className="font-semibold mt-1 text-[#F8F7F2]">
                    {overview.paymentReadiness.mode === 'live'
                      ? 'Live Mode Active'
                      : overview.paymentReadiness.mode === 'test'
                      ? 'Test Mode Active'
                      : 'Not Configured'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Env: <code className="font-mono">RAZORPAY_KEY_ID</code>,{' '}
                    <code className="font-mono">RAZORPAY_KEY_SECRET</code>
                  </div>
                </div>

                <div className="border border-white/10 bg-[#080B12] rounded-lg p-4">
                  <div className="text-xs text-slate-400">Razorpay Webhook</div>
                  <div className="font-semibold mt-1 text-[#F8F7F2]">
                    {overview.paymentReadiness.webhookConfigured
                      ? 'Signature Secret Active'
                      : 'Secret Missing'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Endpoint: <code className="font-mono">/api/webhooks/razorpay</code>
                  </div>
                </div>

                <div className="border border-white/10 bg-[#080B12] rounded-lg p-4">
                  <div className="text-xs text-slate-400">Transactional Email</div>
                  <div className="font-semibold mt-1 text-[#F8F7F2]">
                    {overview.paymentReadiness.emailProvider === 'resend'
                      ? 'Resend API Active'
                      : overview.paymentReadiness.emailProvider === 'smtp'
                      ? 'SMTP / Brevo Active'
                      : 'Not Configured'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Env: <code className="font-mono">RESEND_API_KEY</code> or{' '}
                    <code className="font-mono">SMTP_*</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {overview && activeTab === 'bookings' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="flex flex-1 gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by booking ID, name, email, or phone..."
                    className="w-full pl-10 pr-4 py-2 bg-[#0E1420] border border-white/15 rounded-lg text-sm text-[#F8F7F2] placeholder:text-slate-500 focus:outline-none focus:border-[#D6B36A]"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-[#0E1420] border border-white/15 rounded-lg text-sm text-[#F8F7F2]"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PAID">Paid</option>
                  <option value="PENDING">Pending</option>
                  <option value="FAILED">Failed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#D6B36A] hover:bg-[#e3c583] text-[#080B12] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                Download CSV Report
              </button>
            </div>

            <div className="border border-white/10 bg-[#0E1420] rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 text-slate-400 bg-[#080B12]">
                  <tr>
                    <th className="py-3 px-4 font-medium">Booking ID</th>
                    <th className="py-3 px-4 font-medium">Customer</th>
                    <th className="py-3 px-4 font-medium">Passes</th>
                    <th className="py-3 px-4 font-medium text-right">Amount</th>
                    <th className="py-3 px-4 font-medium">Payment</th>
                    <th className="py-3 px-4 font-medium">Email Status</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {filteredBookings.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        No bookings match your current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-4 font-mono font-semibold text-[#D6B36A] whitespace-nowrap">
                          {b.bookingCode}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#F8F7F2]">{b.customerName}</div>
                          <div className="text-slate-400">{b.customerEmail}</div>
                          <div className="text-slate-500 font-mono">{b.customerPhone}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {b.items.map((i) => `${i.categoryName} x${i.quantity}`).join(', ')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#F8F7F2]">
                          ₹{b.totalInr.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-medium ${
                              b.paymentStatus === 'PAID'
                                ? 'text-emerald-400'
                                : b.paymentStatus === 'PENDING'
                                ? 'text-amber-300'
                                : 'text-red-400'
                            }`}
                          >
                            {b.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{b.emailStatus}</td>
                        <td className="py-3 px-4 text-right">
                          {b.paymentStatus === 'PAID' && (
                            <button
                              type="button"
                              disabled={resendingId === b.id}
                              onClick={() => void handleResendEmail(b.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-white/15 hover:border-[#D6B36A] rounded-md text-xs text-slate-200 disabled:opacity-50"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              {resendingId === b.id ? 'Sending...' : 'Resend Email'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {overview && activeTab === 'categories' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-4">
              {overview.categories.map((cat) => (
                <div
                  key={cat.id}
                  className="border border-white/10 bg-[#0E1420] rounded-xl p-5 space-y-3"
                >
                  {editingCat?.id === cat.id ? (
                    <form onSubmit={handleSaveCategoryEdit} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                          type="text"
                          required
                          value={editingCat.name}
                          onChange={(e) =>
                            setEditingCat({ ...editingCat, name: e.target.value })
                          }
                          placeholder="Category Name"
                          className="px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-sm text-[#F8F7F2]"
                        />
                        <input
                          type="number"
                          required
                          min={0}
                          value={editingCat.priceInr}
                          onChange={(e) =>
                            setEditingCat({ ...editingCat, priceInr: Number(e.target.value) })
                          }
                          placeholder="Price INR"
                          className="px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-sm font-mono text-[#F8F7F2]"
                        />
                        <input
                          type="number"
                          required
                          min={cat.soldCount + cat.reservedCount}
                          value={editingCat.totalInventory}
                          onChange={(e) =>
                            setEditingCat({
                              ...editingCat,
                              totalInventory: Number(e.target.value),
                            })
                          }
                          placeholder="Total Inventory"
                          className="px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-sm font-mono text-[#F8F7F2]"
                        />
                      </div>
                      <textarea
                        rows={2}
                        value={editingCat.description}
                        onChange={(e) =>
                          setEditingCat({ ...editingCat, description: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-sm text-[#F8F7F2]"
                      />
                      <textarea
                        rows={3}
                        value={editingCat.benefits.join('\n')}
                        onChange={(e) =>
                          setEditingCat({
                            ...editingCat,
                            benefits: e.target.value.split('\n'),
                          })
                        }
                        placeholder="One benefit per line"
                        className="w-full px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-xs text-[#F8F7F2]"
                      />
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={editingCat.isPlaceholderPrice}
                          onChange={(e) =>
                            setEditingCat({
                              ...editingCat,
                              isPlaceholderPrice: e.target.checked,
                            })
                          }
                        />
                        Mark as Editable Placeholder Price
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          className="px-4 py-2 bg-[#D6B36A] text-[#080B12] text-xs font-semibold rounded-lg"
                        >
                          Save Changes
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCat(null)}
                          className="px-4 py-2 border border-white/15 text-xs text-slate-300 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h3 className="font-display text-2xl font-semibold text-[#F8F7F2]">
                              {cat.name}
                            </h3>
                            <span className="text-xs text-slate-500">·</span>
                            <span
                              className={`text-xs font-medium ${
                                cat.enabled ? 'text-emerald-400' : 'text-slate-400'
                              }`}
                            >
                              {cat.enabled ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 mt-1">{cat.description}</p>
                        </div>

                        <div className="text-right font-mono">
                          <div className="text-lg font-bold text-[#D6B36A]">
                            ₹{cat.priceInr.toLocaleString('en-IN')}
                          </div>
                          <div className="text-xs text-slate-400">
                            {cat.availableCount} avail / {cat.soldCount} sold / {cat.totalInventory} total
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => setEditingCat(cat)}
                          className="px-3 py-1.5 border border-white/15 hover:border-[#D6B36A] rounded-md text-xs text-slate-200"
                        >
                          Edit Price &amp; Inventory
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleCategory(cat)}
                          className="px-3 py-1.5 border border-white/15 rounded-md text-xs text-slate-300 hover:text-[#F8F7F2]"
                        >
                          {cat.enabled ? 'Disable' : 'Enable'}
                        </button>
                        {cat.soldCount === 0 && cat.reservedCount === 0 && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteCategory(cat.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 border border-red-500/30 rounded-md text-xs text-red-300 hover:bg-red-950/30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <form
              onSubmit={handleAddCategory}
              className="lg:col-span-4 border border-white/10 bg-[#0E1420] rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-[#D6B36A]">
                <Plus className="w-4 h-4" />
                <span>Add Ticket Category</span>
              </div>
              <input
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Category Name (e.g. Backstage Lounge)"
                className="w-full px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-sm text-[#F8F7F2]"
              />
              <textarea
                rows={2}
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                placeholder="Short description"
                className="w-full px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-sm text-[#F8F7F2]"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Price (INR)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newCatPrice}
                    onChange={(e) => setNewCatPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-sm font-mono text-[#F8F7F2]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Inventory</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newCatInventory}
                    onChange={(e) => setNewCatInventory(e.target.value)}
                    className="w-full px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-sm font-mono text-[#F8F7F2]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Benefits (one per line)
                </label>
                <textarea
                  rows={3}
                  value={newCatBenefits}
                  onChange={(e) => setNewCatBenefits(e.target.value)}
                  className="w-full px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-xs text-[#F8F7F2]"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-[#D72638] hover:bg-[#b81d2d] text-[#F8F7F2] text-sm font-semibold rounded-lg"
              >
                Create Ticket Tier
              </button>
            </form>
          </div>
        )}

        {configDraft && activeTab === 'settings' && (
          <form
            onSubmit={handleSaveConfig}
            className="border border-white/10 bg-[#0E1420] rounded-xl p-6 space-y-6 max-w-4xl"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(
                [
                  { key: 'eventName', label: 'Event Name' },
                  { key: 'presenters', label: 'Presenters / Organizers' },
                  { key: 'tagline', label: 'Tagline' },
                  { key: 'expectedCrowd', label: 'Expected Crowd' },
                  { key: 'eventDate', label: 'Event Date' },
                  { key: 'eventTime', label: 'Event Time' },
                  { key: 'countdownIso', label: 'Countdown Target (ISO 8601)' },
                  { key: 'timezone', label: 'Timezone (e.g. Asia/Kolkata)' },
                  { key: 'venueName', label: 'Venue Name' },
                  { key: 'venueAddress', label: 'Full Venue Address' },
                  { key: 'city', label: 'City' },
                  { key: 'country', label: 'Country' },
                  { key: 'googleMapsUrl', label: 'Google Maps Directions URL' },
                  { key: 'contactNumber', label: 'Contact Number' },
                  { key: 'contactEmail', label: 'Contact Email' },
                  { key: 'instagramUrl', label: 'Instagram URL' },
                ] as const
              ).map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {field.label}
                  </label>
                  <input
                    type="text"
                    value={String(configDraft[field.key] ?? '')}
                    onChange={(e) =>
                      setConfigDraft({ ...configDraft, [field.key]: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-sm text-[#F8F7F2]"
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Applicable Tax (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step="0.5"
                  value={configDraft.taxPercent}
                  onChange={(e) =>
                    setConfigDraft({ ...configDraft, taxPercent: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-sm font-mono text-[#F8F7F2]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Platform Fee per Pass (INR)
                </label>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  value={configDraft.platformFeeInr}
                  onChange={(e) =>
                    setConfigDraft({ ...configDraft, platformFeeInr: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-sm font-mono text-[#F8F7F2]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Event Description
              </label>
              <textarea
                rows={3}
                value={configDraft.description}
                onChange={(e) =>
                  setConfigDraft({ ...configDraft, description: e.target.value })
                }
                className="w-full px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-sm text-[#F8F7F2]"
              />
            </div>

            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="text-sm font-semibold text-[#D6B36A]">
                Event Schedule Timings
              </div>
              {configDraft.schedule.map((slot, index) => (
                <div key={slot.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <input
                    type="text"
                    value={slot.time}
                    onChange={(e) => {
                      const next = [...configDraft.schedule];
                      next[index] = { ...slot, time: e.target.value };
                      setConfigDraft({ ...configDraft, schedule: next });
                    }}
                    className="sm:col-span-3 px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-xs font-mono text-[#F8F7F2]"
                  />
                  <input
                    type="text"
                    value={slot.title}
                    onChange={(e) => {
                      const next = [...configDraft.schedule];
                      next[index] = { ...slot, title: e.target.value };
                      setConfigDraft({ ...configDraft, schedule: next });
                    }}
                    className="sm:col-span-4 px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-xs text-[#F8F7F2]"
                  />
                  <input
                    type="text"
                    value={slot.description}
                    onChange={(e) => {
                      const next = [...configDraft.schedule];
                      next[index] = { ...slot, description: e.target.value };
                      setConfigDraft({ ...configDraft, schedule: next });
                    }}
                    className="sm:col-span-5 px-3 py-2 bg-[#080B12] border border-white/15 rounded-lg text-xs text-[#F8F7F2]"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingConfig}
                className="px-6 py-2.5 bg-[#D6B36A] hover:bg-[#e5c784] text-[#080B12] text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {savingConfig ? 'Saving...' : 'Save Event Configuration'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
