import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Calendar,
  Camera,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  Gift,
  Instagram,
  Mail,
  MapPin,
  Menu,
  Mic2,
  Minus,
  Music,
  Navigation,
  Phone,
  Plus,
  Sparkles,
  Ticket,
  Trees,
  Utensils,
  X,
} from 'lucide-react';
import {
  DEFAULT_EVENT_PLACEHOLDERS,
  EVENT_FAQS,
  createInitialEventConfig,
  createInitialTicketCategories,
} from '../../config/eventConfig.ts';
import type {
  EventConfig,
  EventHighlight,
  PaymentReadiness,
  PublicEventPayload,
  PublicTicketCategory,
} from '../../shared/types.ts';
import { CheckoutModal } from '../components/CheckoutModal.tsx';
import { CountdownTimer } from '../components/CountdownTimer.tsx';
import { PolicyModal, type PolicyTab } from '../components/PolicyModal.tsx';

const BROCHURE_GALLERY = [
  {
    id: 'brochure-cover',
    title: 'Official Event Poster — Jingle Bell Rock 1.0',
    caption: '25 Dec 2026 · 7:30 PM Onwards · Music, Dance & Food',
    src: '/assets/brochure/page-1.jpg',
    alt: 'Jingle Bell Rock 1.0 official event cover poster',
  },
  {
    id: 'brochure-lineup',
    title: 'Performing Artists & Host Lineup',
    caption: 'The Imperial · Route 96 · Desmond Olivera · DJ Willie Almeida',
    src: '/assets/brochure/page-2.jpg',
    alt: 'Jingle Bell Rock 1.0 performing artists The Imperial, Route 96, Desmond Olivera, and DJ Willie Almeida',
  },
  {
    id: 'brochure-map',
    title: 'JVPD Grounds Isometric Venue Layout',
    caption: 'Main Stage, Dance Floor, DJ Stage Dome, VIP Canopy Seating, Bar & Food Counters',
    src: '/assets/brochure/page-4.jpg',
    alt: 'JVPD Grounds venue layout showing Main Stage, Dance Floor, DJ Stage Dome, VIP Seating, Bar, Food Counters, and Gates',
  },
];

const VENUE_ZONES = [
  {
    zone: 'Main Stage & Illuminated Dance Floor',
    detail: 'Central LED dance floor directly facing the Main Stage for The Imperial & Route 96 live sets.',
  },
  {
    zone: 'Geodesic DJ Stage Dome',
    detail: 'Dedicated illuminated dome hosting DJ Willie Almeida with full festive lighting.',
  },
  {
    zone: 'VIP Canopy & Lounge Bays',
    detail: 'Covered canopy seating along the upper lawn plus dedicated side VIP bays flanking the dance floor.',
  },
  {
    zone: 'General Round-Table Seating',
    detail: 'Spacious table seating zones positioned with clear sightlines to both stages.',
  },
  {
    zone: 'Bar, Food Counters & Kitchen',
    detail: 'Dedicated bar pavilion and multi-counter festive dining wing along the east perimeter.',
  },
  {
    zone: 'Main Gate & Gate 2 (Military Rd)',
    detail: 'Dual entry checkpoints next to Rithumbura College for smooth 2,500-guest QR check-in.',
  },
];

function renderHighlightIcon(key: EventHighlight['iconKey']) {
  const cls = 'w-5 h-5 text-[#D6B36A]';
  switch (key) {
    case 'music':
      return <Music className={cls} />;
    case 'tree':
      return <Trees className={cls} />;
    case 'sparkles':
      return <Sparkles className={cls} />;
    case 'utensils':
      return <Utensils className={cls} />;
    case 'camera':
      return <Camera className={cls} />;
    case 'gift':
      return <Gift className={cls} />;
  }
}

export function LandingPage({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  const [eventConfig, setEventConfig] = useState<EventConfig>(() => createInitialEventConfig());
  const [categories, setCategories] = useState<PublicTicketCategory[]>(() =>
    createInitialTicketCategories().map((c) => ({
      ...c,
      availableCount: c.totalInventory - c.soldCount - c.reservedCount,
    })),
  );
  const [paymentReadiness, setPaymentReadiness] = useState<PaymentReadiness>({
    mode: 'unconfigured',
    razorpayConfigured: false,
    webhookConfigured: false,
    emailProvider: 'unconfigured',
  });
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [policyTab, setPolicyTab] = useState<PolicyTab | null>(null);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [lightboxImage, setLightboxImage] = useState<(typeof BROCHURE_GALLERY)[number] | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [heroParallaxY, setHeroParallaxY] = useState(0);

  const loadEventData = useCallback(async () => {
    try {
      const res = await fetch('/api/public/event');
      if (!res.ok) return;
      const data = (await res.json()) as PublicEventPayload;
      setEventConfig(data.eventConfig);
      setCategories(data.categories);
      setPaymentReadiness(data.paymentReadiness);
      setQuantities((prev) => {
        const next: Record<string, number> = {};
        for (const cat of data.categories) {
          const current = prev[cat.id] || 0;
          next[cat.id] = Math.min(current, cat.availableCount);
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEventData();
  }, [loadEventData]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return;

    const onScroll = () => {
      const y = Math.min(window.scrollY * 0.14, 70);
      setHeroParallaxY(y);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const updateQuantity = (cat: PublicTicketCategory, delta: number) => {
    setQuantities((prev) => {
      const current = prev[cat.id] || 0;
      const nextVal = Math.max(0, Math.min(cat.availableCount, Math.min(25, current + delta)));
      return { ...prev, [cat.id]: nextVal };
    });
  };

  const selectedLines = useMemo(() => {
    return categories
      .map((cat) => ({
        category: cat,
        quantity: quantities[cat.id] || 0,
      }))
      .filter((item) => item.quantity > 0);
  }, [categories, quantities]);

  const pricing = useMemo(() => {
    const totalQuantity = selectedLines.reduce((sum, l) => sum + l.quantity, 0);
    const subtotalInr =
      Math.round(
        selectedLines.reduce((sum, l) => sum + l.category.priceInr * l.quantity, 0) * 100,
      ) / 100;
    const taxInr = Math.round(subtotalInr * (eventConfig.taxPercent / 100) * 100) / 100;
    const platformFeeInr = Math.round(eventConfig.platformFeeInr * totalQuantity * 100) / 100;
    const totalInr = Math.round((subtotalInr + taxInr + platformFeeInr) * 100) / 100;
    return { totalQuantity, subtotalInr, taxInr, platformFeeInr, totalInr };
  }, [selectedLines, eventConfig.taxPercent, eventConfig.platformFeeInr]);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#080B12] text-[#F8F7F2] relative overflow-x-hidden pb-20 lg:pb-0">
      {/* Top Bar Contract: 3 zones (1-line wordmark | 5 concise nav links | 1 primary CTA) */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#080B12]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="inline-flex items-center gap-3 font-display text-xl sm:text-2xl font-semibold tracking-tight text-[#F8F7F2] whitespace-nowrap shrink-0"
          >
            {!failedImages.brandLogo && (
              <img
                src={eventConfig.logoUrl || DEFAULT_EVENT_PLACEHOLDERS.EVENT_LOGO}
                alt="Events Forever logo"
                referrerPolicy="no-referrer"
                onError={() => setFailedImages((p) => ({ ...p, brandLogo: true }))}
                className="w-10 h-10 rounded-lg object-contain bg-black border border-[#D6B36A]/50 p-0.5 shrink-0"
              />
            )}
            <span>Events Forever</span>
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <button
              type="button"
              onClick={() => scrollToSection('lineup')}
              className="hover:text-[#D6B36A] transition-colors whitespace-nowrap shrink-0"
            >
              Lineup
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('experience')}
              className="hover:text-[#D6B36A] transition-colors whitespace-nowrap shrink-0"
            >
              Highlights
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('venue-map')}
              className="hover:text-[#D6B36A] transition-colors whitespace-nowrap shrink-0"
            >
              Venue Map
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('tickets')}
              className="hover:text-[#D6B36A] transition-colors whitespace-nowrap shrink-0"
            >
              Tickets
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('schedule')}
              className="hover:text-[#D6B36A] transition-colors whitespace-nowrap shrink-0"
            >
              Schedule
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => scrollToSection('tickets')}
              className="px-4 py-2 bg-[#D72638] hover:bg-[#b81d2d] text-[#F8F7F2] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Get Tickets
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2.5 text-slate-300 hover:text-[#F8F7F2] rounded-lg border border-white/10"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#080B12] px-4 py-4 flex flex-col gap-2">
            {[
              { id: 'lineup', label: 'Lineup' },
              { id: 'experience', label: 'Highlights' },
              { id: 'venue-map', label: 'Venue Map' },
              { id: 'tickets', label: 'Tickets' },
              { id: 'schedule', label: 'Schedule' },
              { id: 'faq', label: 'FAQ' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className="text-left px-3 py-2.5 text-sm font-medium text-slate-200 hover:text-[#D6B36A] rounded-lg hover:bg-white/5"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* HERO SECTION */}
      <section
        id="top"
        className="relative min-h-[88vh] flex items-center overflow-hidden border-b border-white/10"
      >
        <div
          className="absolute inset-0 will-change-transform"
          style={{ transform: `translate3d(0, ${heroParallaxY}px, 0) scale(1.06)` }}
        >
          {!failedImages.hero ? (
            <img
              src="/src/assets/images/hero_christmas_gala_1794914957805.jpg"
              alt="Jingle Bell Rock 1.0 Christmas Night festival atmosphere"
              referrerPolicy="no-referrer"
              onError={() => setFailedImages((p) => ({ ...p, hero: true }))}
              className="w-full h-full object-cover object-center"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#0B3025] via-[#080B12] to-[#8F1528]/50" />
          )}
        </div>

        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-[#080B12]/96 via-[#080B12]/84 to-[#080B12]/65"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#080B12] via-transparent to-[#080B12]/45"
        />
        <div
          aria-hidden="true"
          className="absolute -top-20 right-1/3 w-[440px] h-[440px] rounded-full bg-[#D72638]/10 blur-[110px] pointer-events-none"
        />

        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-7 space-y-6"
            >
              <div className="flex items-center gap-3">
                {eventConfig.logoUrl && !failedImages.heroLogo && (
                  <img
                    src={eventConfig.logoUrl}
                    alt="Events Forever official logo"
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImages((p) => ({ ...p, heroLogo: true }))}
                    className="w-11 h-11 rounded-lg object-contain bg-black border border-[#D6B36A]/50 p-0.5 shrink-0"
                  />
                )}
                <p className="text-xs sm:text-sm font-semibold tracking-[0.2em] uppercase text-[#D6B36A]">
                  {eventConfig.presenters} Present
                </p>
              </div>

              <h1
                className="font-display font-bold tracking-tight text-[#F8F7F2] leading-[1.02]"
                style={{
                  fontSize: 'clamp(2.65rem, 5.2vw, 4.75rem)',
                  textWrap: 'balance',
                }}
              >
                JINGLE BELL ROCK <span className="gold-gradient-text">1.0</span>
              </h1>

              <p className="font-display text-2xl sm:text-3xl text-[#A9DDF5] font-medium leading-snug">
                {eventConfig.eventDate} · {eventConfig.eventTime} · Music · Dance · Food
              </p>

              <p className="text-base text-slate-300 max-w-2xl leading-relaxed">
                {eventConfig.description}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-white/15 py-4 max-w-2xl">
                <div>
                  <div className="text-xs text-[#D6B36A] font-medium">Date &amp; Time</div>
                  <div className="text-sm sm:text-base font-semibold text-[#F8F7F2] mt-0.5">
                    {eventConfig.eventDate} · {eventConfig.eventTime}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#D6B36A] font-medium">Venue</div>
                  <div className="text-sm sm:text-base font-semibold text-[#F8F7F2] mt-0.5">
                    {eventConfig.venueName}, Juhu
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#D6B36A] font-medium">Expected Crowd</div>
                  <div className="text-sm sm:text-base font-semibold text-[#F8F7F2] mt-0.5">
                    {eventConfig.expectedCrowd}
                  </div>
                </div>
              </div>

              <div className="pt-1">
                <CountdownTimer
                  targetIso={eventConfig.countdownIso}
                  timezone={eventConfig.timezone}
                />
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => scrollToSection('tickets')}
                  className="px-7 py-3.5 bg-[#D72638] hover:bg-[#b81d2d] text-[#F8F7F2] text-sm font-semibold rounded-lg transition-all duration-200 hover:-translate-y-0.5 shadow-lg shadow-[#D72638]/25 whitespace-nowrap shrink-0"
                >
                  GET YOUR TICKETS
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('lineup')}
                  className="inline-flex items-center gap-2 px-6 py-3.5 border border-[#D6B36A]/55 hover:border-[#D6B36A] bg-[#080B12]/70 text-[#F8F7F2] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Music className="w-4 h-4 text-[#D6B36A]" />
                  EXPLORE LINEUP
                </button>
              </div>
            </motion.div>

            {/* Right Column: Official Event Poster Artwork from Brochure Page 1 */}
            <div className="lg:col-span-5 flex justify-center lg:justify-end">
              <button
                type="button"
                onClick={() => setLightboxImage(BROCHURE_GALLERY[0])}
                className="group relative max-w-[380px] w-full rounded-xl overflow-hidden border border-[#D6B36A]/40 bg-[#0E1420] shadow-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6B36A]"
              >
                {!failedImages.poster ? (
                  <img
                    src="/assets/brochure/page-1.jpg"
                    alt="Jingle Bell Rock 1.0 official event poster"
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImages((p) => ({ ...p, poster: true }))}
                    className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="aspect-[2/3] bg-[#0B3025] flex items-center justify-center p-8 text-center">
                    <span className="font-display text-2xl text-[#D6B36A]">
                      {eventConfig.eventName}
                    </span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 flex items-center justify-between text-xs text-slate-200">
                  <span>Official Event Poster</span>
                  <span className="text-[#D6B36A] font-medium">Click to expand</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* PERFORMING ARTISTS & HOST LINEUP SECTION */}
      <section id="lineup" className="py-20 sm:py-24 border-b border-white/10 bg-[#0A0E17]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7 space-y-8">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D6B36A]">
                  Live Entertainment Lineup
                </p>
                <h2
                  className="font-display text-3xl sm:text-5xl font-semibold text-[#F8F7F2]"
                  style={{ textWrap: 'balance' }}
                >
                  Two Live Bands, Host &amp; DJ Dome Takeover
                </h2>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                  From live stage harmonies on the Main Stage to high-energy club sets inside the geodesic DJ Stage Dome.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {eventConfig.artists.map((artist, idx) => (
                  <div
                    key={artist.id}
                    className="border border-white/10 bg-[#0E1420] rounded-xl p-5 space-y-2.5 hover:border-[#D6B36A]/45 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="text-[#D6B36A] font-semibold tracking-wide">
                        {artist.role}
                      </span>
                      <span className="font-mono">0{idx + 1}</span>
                    </div>
                    <h3 className="font-display text-2xl font-semibold text-[#F8F7F2] flex items-center gap-2">
                      {artist.role.includes('Host') ? (
                        <Mic2 className="w-4 h-4 text-[#D6B36A] shrink-0" />
                      ) : (
                        <Music className="w-4 h-4 text-[#D6B36A] shrink-0" />
                      )}
                      <span>{artist.name}</span>
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">{artist.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5">
              <button
                type="button"
                onClick={() => setLightboxImage(BROCHURE_GALLERY[1])}
                className="group relative w-full rounded-xl overflow-hidden border border-[#D6B36A]/35 bg-[#0E1420] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6B36A]"
              >
                {!failedImages.lineupPoster ? (
                  <img
                    src="/assets/brochure/page-2.jpg"
                    alt="Jingle Bell Rock 1.0 artist lineup featuring The Imperial, Route 96, Desmond Olivera, and DJ Willie Almeida"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImages((p) => ({ ...p, lineupPoster: true }))}
                    className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="aspect-[2/3] bg-[#0E1420] flex items-center justify-center p-6">
                    <Music className="w-8 h-8 text-[#D6B36A]" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 flex items-center justify-between text-xs text-slate-200">
                  <span>Official Artist Poster</span>
                  <span className="text-[#D6B36A] font-medium">View full size</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* EVENT HIGHLIGHTS SECTION */}
      <section id="experience" className="py-20 sm:py-24 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-14 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D6B36A]">
              Music · Dance · Food
            </p>
            <h2
              className="font-display text-3xl sm:text-5xl font-semibold text-[#F8F7F2]"
              style={{ textWrap: 'balance' }}
            >
              Experience Jingle Bell Rock 1.0
            </h2>
            <p className="text-base text-slate-300 leading-relaxed">
              Every zone inside JVPD Grounds is crafted for an immersive Christmas night celebration with 2,500 guests.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {eventConfig.highlights.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                className="border border-white/10 bg-[#0E1420] rounded-xl p-6 hover:border-[#D6B36A]/45 transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-[#0B3025]/60 border border-[#D6B36A]/25 flex items-center justify-center">
                    {renderHighlightIcon(item.iconKey)}
                  </div>
                  <span className="font-mono text-xs text-slate-500">0{idx + 1}</span>
                </div>
                <h3 className="font-display text-2xl font-semibold text-[#F8F7F2] mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* VENUE LAYOUT & GROUNDS MAP SECTION */}
      <section id="venue-map" className="py-20 sm:py-24 border-b border-white/10 bg-[#0A0E17]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5">
              <button
                type="button"
                onClick={() => setLightboxImage(BROCHURE_GALLERY[2])}
                className="group relative w-full rounded-xl overflow-hidden border border-[#D6B36A]/35 bg-[#0E1420] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6B36A]"
              >
                {!failedImages.venueMap ? (
                  <img
                    src="/assets/brochure/page-4.jpg"
                    alt="JVPD Grounds venue map showing Main Stage, Dance Floor, DJ Stage, VIP Canopy, Bar, and Food Counters"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImages((p) => ({ ...p, venueMap: true }))}
                    className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="aspect-[2/3] bg-[#0E1420] flex items-center justify-center p-6">
                    <MapPin className="w-8 h-8 text-[#D6B36A]" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 flex items-center justify-between text-xs text-slate-200">
                  <span>JVPD Grounds Site Map</span>
                  <span className="text-[#D6B36A] font-medium">Zoom Layout</span>
                </div>
              </button>
            </div>

            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D6B36A]">
                  Grounds Blueprint
                </p>
                <h2 className="font-display text-3xl sm:text-5xl font-semibold text-[#F8F7F2]">
                  Explore JVPD Grounds Layout
                </h2>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                  Designed for seamless circulation between the Main Stage, Central Dance Floor, Geodesic DJ Dome, VIP Canopy Bays, and Hospitality Wing.
                </p>
              </div>

              <div className="divide-y divide-white/10 border-y border-white/10">
                {VENUE_ZONES.map((z, idx) => (
                  <div key={z.zone} className="py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-baseline">
                    <div className="sm:col-span-5 font-semibold text-sm text-[#D6B36A]">
                      0{idx + 1}. {z.zone}
                    </div>
                    <div className="sm:col-span-7 text-xs sm:text-sm text-slate-300">
                      {z.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TICKET BOOKING SECTION */}
      <section id="tickets" className="py-20 sm:py-24 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-12 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D6B36A]">
              Reserve Your Entry
            </p>
            <h2 className="font-display text-3xl sm:text-5xl font-semibold text-[#F8F7F2]">
              Book Passes for {eventConfig.eventName}
            </h2>
            <p className="text-sm sm:text-base text-slate-300">
              Official Couple Entry pass in Indian Rupees (INR) — valid for two guests at {eventConfig.venueName}.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 space-y-4">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((s) => (
                    <div
                      key={s}
                      className="h-44 rounded-xl border border-white/10 bg-[#0E1420] animate-pulse"
                    />
                  ))}
                </div>
              ) : categories.length === 0 ? (
                <div className="border border-white/10 bg-[#0E1420] rounded-xl p-8 text-center text-slate-300">
                  No ticket categories are currently enabled for sale. Check back soon.
                </div>
              ) : (
                categories.map((cat) => {
                  const qty = quantities[cat.id] || 0;
                  const soldOut = cat.availableCount <= 0;
                  const lineTotal = cat.priceInr * qty;
                  return (
                    <div
                      key={cat.id}
                      className={`border rounded-xl p-6 transition-colors ${
                        qty > 0
                          ? 'border-[#D6B36A]/65 bg-[#0E1420]'
                          : 'border-white/10 bg-[#0E1420]/80 hover:border-white/20'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <h3 className="font-display text-2xl font-semibold text-[#F8F7F2]">
                              {cat.name}
                            </h3>
                            <span className="text-xs text-slate-400">·</span>
                            <span
                              className={`text-xs font-medium ${
                                soldOut ? 'text-[#D72638]' : 'text-emerald-400'
                              }`}
                            >
                              {soldOut
                                ? 'Sold Out'
                                : `${cat.availableCount} passes available`}
                            </span>
                            {cat.isPlaceholderPrice && (
                              <>
                                <span className="text-xs text-slate-500">·</span>
                                <span className="text-xs text-[#D6B36A]">
                                  Editable Placeholder Price
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-sm text-slate-300">{cat.description}</p>
                        </div>

                        <div className="sm:text-right shrink-0">
                          <div className="font-mono text-2xl font-bold text-[#D6B36A]">
                            ₹{cat.priceInr.toLocaleString('en-IN')}
                          </div>
                          <div className="text-xs text-slate-400">
                            {cat.name.toLowerCase().includes('couple')
                              ? 'per couple pass (2 guests)'
                              : 'per pass'}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-5 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <ul className="space-y-1.5 text-xs text-slate-300">
                          {cat.benefits.map((benefit, bIdx) => (
                            <li key={bIdx} className="flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full bg-[#D6B36A] shrink-0" />
                              <span>{benefit}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                          {qty > 0 && (
                            <div className="text-right">
                              <div className="text-[11px] text-slate-400">Line Total</div>
                              <div className="font-mono text-sm font-semibold text-[#F8F7F2]">
                                ₹{lineTotal.toLocaleString('en-IN')}
                              </div>
                            </div>
                          )}

                          <div className="inline-flex items-center border border-white/15 bg-[#080B12] rounded-lg overflow-hidden">
                            <button
                              type="button"
                              aria-label={`Decrease quantity for ${cat.name}`}
                              disabled={qty <= 0 || soldOut}
                              onClick={() => updateQuantity(cat, -1)}
                              className="w-11 h-11 flex items-center justify-center text-slate-200 hover:bg-white/10 disabled:opacity-30 transition-colors"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-11 text-center font-mono text-sm font-semibold text-[#F8F7F2]">
                              {qty}
                            </span>
                            <button
                              type="button"
                              aria-label={`Increase quantity for ${cat.name}`}
                              disabled={soldOut || qty >= cat.availableCount || qty >= 25}
                              onClick={() => updateQuantity(cat, 1)}
                              className="w-11 h-11 flex items-center justify-center text-slate-200 hover:bg-white/10 disabled:opacity-30 transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sticky Booking Summary */}
            <div className="lg:col-span-4 lg:sticky lg:top-24 border border-[#D6B36A]/35 bg-[#0E1420] rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h3 className="font-display text-2xl font-semibold text-[#F8F7F2]">
                  Booking Summary
                </h3>
                <Ticket className="w-5 h-5 text-[#D6B36A]" />
              </div>

              {selectedLines.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-400">
                  Select your Couple Entry pass quantity to calculate your total.
                </div>
              ) : (
                <>
                  <div className="space-y-3 border-b border-white/10 pb-4">
                    {selectedLines.map(({ category, quantity }) => (
                      <div key={category.id} className="flex items-start justify-between text-sm gap-2">
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

                  <div className="space-y-2 text-xs text-slate-300 border-b border-white/10 pb-4">
                    <div className="flex justify-between">
                      <span>Tickets ({pricing.totalQuantity})</span>
                      <span className="font-mono">₹{pricing.subtotalInr.toLocaleString('en-IN')}</span>
                    </div>
                    {eventConfig.taxPercent > 0 && (
                      <div className="flex justify-between">
                        <span>Applicable Taxes ({eventConfig.taxPercent}%)</span>
                        <span className="font-mono">₹{pricing.taxInr.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {eventConfig.platformFeeInr > 0 && (
                      <div className="flex justify-between">
                        <span>Booking Fee (₹{eventConfig.platformFeeInr} / pass)</span>
                        <span className="font-mono">₹{pricing.platformFeeInr.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#F8F7F2]">Final Payable</span>
                    <span className="font-mono text-2xl font-bold text-[#D6B36A]">
                      ₹{pricing.totalInr.toLocaleString('en-IN')}
                    </span>
                  </div>
                </>
              )}

              <button
                type="button"
                disabled={pricing.totalQuantity === 0}
                onClick={() => setCheckoutOpen(true)}
                className="w-full py-3.5 px-5 bg-[#D72638] hover:bg-[#b81d2d] disabled:bg-white/10 disabled:text-slate-500 text-[#F8F7F2] text-sm font-semibold rounded-lg transition-all duration-200"
              >
                BOOK TICKETS NOW
              </button>

              <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                All amounts are verified server-side before Razorpay Checkout. Inventory is held for 15 minutes during checkout.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* EVENT SCHEDULE SECTION */}
      <section id="schedule" className="py-20 sm:py-24 border-b border-white/10 bg-[#0A0E17]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D6B36A]">
              Evening Timeline
            </p>
            <h2 className="font-display text-3xl sm:text-5xl font-semibold text-[#F8F7F2]">
              Event Schedule ({eventConfig.eventDate})
            </h2>
            <p className="text-sm text-slate-400">
              Doors open at {eventConfig.eventTime} ({eventConfig.timezone}). Editable anytime from Admin Settings.
            </p>
          </div>

          <div className="divide-y divide-white/10 border-y border-white/10">
            {eventConfig.schedule.map((slot) => (
              <div
                key={slot.id}
                className="py-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-start"
              >
                <div className="md:col-span-3 font-mono text-sm font-semibold text-[#D6B36A]">
                  {slot.time}
                </div>
                <div className="md:col-span-9 space-y-1">
                  <h3 className="font-display text-2xl font-semibold text-[#F8F7F2]">
                    {slot.title}
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">{slot.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VENUE & DIRECTIONS SECTION */}
      <section id="venue" className="py-20 sm:py-24 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center border border-white/10 bg-[#0E1420] rounded-xl p-6 sm:p-10">
            <div className="lg:col-span-7 space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D6B36A]">
                Venue &amp; Arrival
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#F8F7F2]">
                {eventConfig.venueName}
              </h2>
              <div className="space-y-2 text-sm text-slate-300">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-[#D6B36A] shrink-0 mt-1" />
                  <span>
                    {eventConfig.venueAddress} · {eventConfig.city}, {eventConfig.country}
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Calendar className="w-4 h-4 text-[#D6B36A] shrink-0 mt-1" />
                  <span>
                    {eventConfig.eventDate} · {eventConfig.eventTime} ({eventConfig.timezone})
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <a
                  href={eventConfig.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 bg-[#D6B36A] hover:bg-[#e5c784] text-[#080B12] text-sm font-semibold rounded-lg transition-colors"
                >
                  <Navigation className="w-4 h-4" />
                  Get Directions
                </a>
                <a
                  href={eventConfig.brochurePdfUrl}
                  download="Jingle-Bell-Rock-1.0-Brochure.pdf"
                  className="inline-flex items-center gap-2 px-5 py-3 border border-white/15 hover:border-white/30 text-[#F8F7F2] text-sm font-medium rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4 text-[#D6B36A]" />
                  <span>Download Brochure</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>
              </div>
            </div>

            <div className="lg:col-span-5 border border-white/10 bg-[#080B12] rounded-xl p-6 space-y-4">
              <div className="text-sm font-semibold text-[#D6B36A]">
                Gate Entry &amp; Verification Notice
              </div>
              <ul className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
                <li>1. Entry is via Main Gate and Gate 2 along Military Rd, next to Rithumbura College.</li>
                <li>2. Every ticket carries a unique QR token valid for a single scan only.</li>
                <li>3. Valid government-issued photo ID is required at venue security check-in.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="py-20 sm:py-24 border-b border-white/10 bg-[#0A0E17]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D6B36A]">
              Questions &amp; Answers
            </p>
            <h2 className="font-display text-3xl sm:text-5xl font-semibold text-[#F8F7F2]">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3">
            {EVENT_FAQS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={faq.q}
                  className="border border-white/10 bg-[#0E1420] rounded-xl overflow-hidden"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="font-medium text-base text-[#F8F7F2]">{faq.q}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-[#D6B36A] shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 text-sm text-slate-300 leading-relaxed border-t border-white/5 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CONTACT SECTION */}
      <section id="contact" className="py-16 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                {eventConfig.logoUrl && !failedImages.contactLogo && (
                  <img
                    src={eventConfig.logoUrl}
                    alt="Events Forever logo"
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImages((p) => ({ ...p, contactLogo: true }))}
                    className="w-9 h-9 rounded-md object-contain bg-black border border-[#D6B36A]/45 shrink-0"
                  />
                )}
                <div className="text-xs uppercase tracking-[0.2em] text-[#D6B36A] font-semibold">
                  {eventConfig.presenters}
                </div>
              </div>
              <h2 className="font-display text-3xl font-semibold text-[#F8F7F2]">
                Bookings &amp; Event Support
              </h2>
              <p className="text-sm text-slate-400">
                Contact the organizing team for ticket assistance, group reservations, or venue inquiries.
              </p>
            </div>

            <div className="border border-white/10 bg-[#0E1420] rounded-xl p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs text-[#D6B36A] font-medium">
                <Phone className="w-4 h-4" />
                <span>Organizer Phone</span>
              </div>
              <div className="text-base font-medium text-[#F8F7F2]">
                {eventConfig.contactNumber}
              </div>
            </div>

            <div className="border border-white/10 bg-[#0E1420] rounded-xl p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs text-[#D6B36A] font-medium">
                <Mail className="w-4 h-4" />
                <span>Email &amp; Social</span>
              </div>
              <div className="text-base font-medium text-[#F8F7F2] break-all">
                {eventConfig.contactEmail}
              </div>
              <a
                href={eventConfig.instagramUrl.startsWith('http') ? eventConfig.instagramUrl : '#contact'}
                target={eventConfig.instagramUrl.startsWith('http') ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[#A9DDF5] hover:underline pt-1"
              >
                <Instagram className="w-3.5 h-3.5" />
                <span>{eventConfig.instagramUrl}</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* QUIET FOOTER */}
      <footer className="bg-[#080B12] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 pb-10 border-b border-white/10">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {!failedImages.footerLogo && (
                  <img
                    src={eventConfig.logoUrl || DEFAULT_EVENT_PLACEHOLDERS.EVENT_LOGO}
                    alt="Events Forever logo"
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImages((p) => ({ ...p, footerLogo: true }))}
                    className="w-10 h-10 rounded-lg object-contain bg-black border border-[#D6B36A]/50 p-0.5 shrink-0"
                  />
                )}
                <div className="font-display text-2xl font-semibold text-[#F8F7F2]">
                  Events Forever
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {eventConfig.eventName} · Presented by {eventConfig.presenters} · {eventConfig.venueName}, {eventConfig.city}
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#D6B36A]">
                Navigation
              </div>
              <div className="flex flex-col gap-1.5 text-slate-300">
                <button type="button" onClick={() => scrollToSection('lineup')} className="text-left hover:text-[#F8F7F2]">
                  Artist Lineup
                </button>
                <button type="button" onClick={() => scrollToSection('venue-map')} className="text-left hover:text-[#F8F7F2]">
                  JVPD Venue Map
                </button>
                <button type="button" onClick={() => scrollToSection('tickets')} className="text-left hover:text-[#F8F7F2]">
                  Book Tickets
                </button>
                <button type="button" onClick={() => scrollToSection('schedule')} className="text-left hover:text-[#F8F7F2]">
                  Schedule
                </button>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#D6B36A]">
                Legal &amp; Policies
              </div>
              <div className="flex flex-col gap-1.5 text-slate-300">
                <button type="button" onClick={() => setPolicyTab('privacy')} className="text-left hover:text-[#F8F7F2]">
                  Privacy Policy
                </button>
                <button type="button" onClick={() => setPolicyTab('terms')} className="text-left hover:text-[#F8F7F2]">
                  Terms &amp; Conditions
                </button>
                <button type="button" onClick={() => setPolicyTab('refund')} className="text-left hover:text-[#F8F7F2]">
                  Refund Policy
                </button>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#D6B36A]">
                Organizer Portal
              </div>
              <div className="flex flex-col gap-1.5 text-slate-300">
                <button
                  type="button"
                  onClick={() => onNavigate('/admin')}
                  className="text-left hover:text-[#D6B36A] transition-colors"
                >
                  Admin Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/verify')}
                  className="text-left hover:text-[#D6B36A] transition-colors"
                >
                  Ticket Verification Scanner
                </button>
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <span>
              © {new Date().getFullYear()} Events Forever · {eventConfig.eventName}. All rights reserved.
            </span>
            <span>Currency: {eventConfig.currency} · Timezone: {eventConfig.timezone}</span>
          </div>
        </div>
      </footer>

      {/* Mobile Sticky Bottom CTA */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-white/15 bg-[#080B12]/95 backdrop-blur-md px-4 py-2.5 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-400">
            {pricing.totalQuantity > 0
              ? `${pricing.totalQuantity} pass${pricing.totalQuantity > 1 ? 'es' : ''} selected`
              : `${eventConfig.eventDate} · ${eventConfig.eventTime}`}
          </div>
          <div className="font-mono text-base font-bold text-[#D6B36A]">
            {pricing.totalQuantity > 0
              ? `₹${pricing.totalInr.toLocaleString('en-IN')}`
              : categories[0]
              ? `${categories[0].name} · ₹${categories[0].priceInr.toLocaleString('en-IN')}`
              : `${eventConfig.venueName}, Mumbai`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (pricing.totalQuantity > 0) {
              setCheckoutOpen(true);
            } else {
              scrollToSection('tickets');
            }
          }}
          className="px-5 py-2.5 bg-[#D72638] hover:bg-[#b81d2d] text-[#F8F7F2] text-sm font-semibold rounded-lg whitespace-nowrap shrink-0"
        >
          BOOK TICKETS
        </button>
      </div>

      {/* Lightbox Modal for Brochure Posters */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-w-3xl w-full bg-[#0E1420] border border-white/15 rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <div>
                <div className="font-display text-xl font-semibold text-[#F8F7F2]">
                  {lightboxImage.title}
                </div>
                <div className="text-xs text-slate-400">{lightboxImage.caption}</div>
              </div>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                aria-label="Close brochure preview"
                className="p-2 text-slate-400 hover:text-[#F8F7F2]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={lightboxImage.src}
              alt={lightboxImage.alt}
              referrerPolicy="no-referrer"
              className="w-full max-h-[78vh] object-contain bg-[#080B12]"
            />
          </div>
        </div>
      )}

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        selectedLines={selectedLines}
        eventConfig={eventConfig}
        paymentReadiness={paymentReadiness}
        subtotalInr={pricing.subtotalInr}
        taxInr={pricing.taxInr}
        platformFeeInr={pricing.platformFeeInr}
        totalInr={pricing.totalInr}
        totalQuantity={pricing.totalQuantity}
        onOpenPolicy={(tab) => setPolicyTab(tab)}
        onBookingCompleted={() => {
          void loadEventData();
        }}
      />

      <PolicyModal
        openTab={policyTab}
        onClose={() => setPolicyTab(null)}
        onSelectTab={(tab) => setPolicyTab(tab)}
        eventConfig={eventConfig}
      />
    </div>
  );
}
