import type { EventConfig, TicketCategory } from '../shared/types.ts';

/**
 * Central Event Configuration for Jingle Bell Rock 1.0 (2026)
 * Presented by Feliz Foundation & Events Forever.
 */
export const DEFAULT_EVENT_PLACEHOLDERS = {
  EVENT_NAME: 'Jingle Bell Rock 1.0',
  PRESENTERS: 'Feliz Foundation & Events Forever',
  EVENT_DATE: '25 Dec 2026',
  EVENT_TIME: '7:30 PM Onwards',
  EVENT_VENUE: 'JVPD Grounds',
  EVENT_ADDRESS: 'Military Rd, Next to Rithumbura College, Juhu, Mumbai 400 049',
  EVENT_CITY: 'Mumbai',
  EVENT_COUNTRY: 'India',
  EXPECTED_CROWD: 'Approx. 2,500 Guests',
  BROCHURE_PDF_URL: '/assets/aistudio/brochure_2.0__2__7ba589a7.pdf',
  EVENT_CONTACT: '[ORGANIZER CONTACT NUMBER]',
  EVENT_EMAIL: '[ORGANIZER CONTACT EMAIL]',
  EVENT_INSTAGRAM: '[INSTAGRAM URL]',
  EVENT_LOGO: '/assets/aistudio/WhatsApp_Image_2026-11-23_at_2.07.47_PM_d90ea478.jpeg',
  COUNTDOWN_ISO: '2026-12-25T19:30:00+05:30',
  TIMEZONE: 'Asia/Kolkata',
  CURRENCY: 'INR' as const,
};

export function createInitialEventConfig(): EventConfig {
  const now = new Date().toISOString();
  return {
    eventName: DEFAULT_EVENT_PLACEHOLDERS.EVENT_NAME,
    presenters: DEFAULT_EVENT_PLACEHOLDERS.PRESENTERS,
    tagline: 'Feliz Foundation & Events Forever Present — Music · Dance · Food',
    description:
      'Celebrate Christmas Night in Juhu, Mumbai at Jingle Bell Rock 1.0. Featuring two live bands, a dedicated geodesic DJ stage dome, an expansive illuminated dance floor, VIP canopy seating, bar & food counters, and an expected celebration crowd of 2,500 guests.',
    eventDate: DEFAULT_EVENT_PLACEHOLDERS.EVENT_DATE,
    eventTime: DEFAULT_EVENT_PLACEHOLDERS.EVENT_TIME,
    countdownIso: DEFAULT_EVENT_PLACEHOLDERS.COUNTDOWN_ISO,
    timezone: DEFAULT_EVENT_PLACEHOLDERS.TIMEZONE,
    currency: DEFAULT_EVENT_PLACEHOLDERS.CURRENCY,
    venueName: DEFAULT_EVENT_PLACEHOLDERS.EVENT_VENUE,
    venueAddress: DEFAULT_EVENT_PLACEHOLDERS.EVENT_ADDRESS,
    city: DEFAULT_EVENT_PLACEHOLDERS.EVENT_CITY,
    country: DEFAULT_EVENT_PLACEHOLDERS.EVENT_COUNTRY,
    expectedCrowd: DEFAULT_EVENT_PLACEHOLDERS.EXPECTED_CROWD,
    brochurePdfUrl: DEFAULT_EVENT_PLACEHOLDERS.BROCHURE_PDF_URL,
    googleMapsUrl:
      'https://www.google.com/maps/search/?api=1&query=JVPD+Grounds+Military+Rd+Next+to+Rithumbura+College+Juhu+Mumbai+400049',
    contactNumber: DEFAULT_EVENT_PLACEHOLDERS.EVENT_CONTACT,
    contactEmail: DEFAULT_EVENT_PLACEHOLDERS.EVENT_EMAIL,
    instagramUrl: DEFAULT_EVENT_PLACEHOLDERS.EVENT_INSTAGRAM,
    logoUrl: DEFAULT_EVENT_PLACEHOLDERS.EVENT_LOGO,
    taxPercent: 18,
    platformFeeInr: 49,
    artists: [
      {
        id: 'art-imperial',
        name: 'The Imperial',
        role: 'Live Band',
        description: 'High-energy multi-piece live band performing classic hits, rock anthems, and festive crowd favorites on the Main Stage.',
      },
      {
        id: 'art-route96',
        name: 'Route 96',
        role: 'Live Band',
        description: 'Signature live ensemble bringing rich vocal harmonies, contemporary grooves, and Christmas celebration energy.',
      },
      {
        id: 'art-desmond',
        name: 'Desmond Olivera',
        role: 'Host | Performer',
        description: 'Charismatic emcee and live stage performer guiding the evening festivities, spot prizes, and midnight celebrations.',
      },
      {
        id: 'art-willie',
        name: 'DJ Willie Almeida',
        role: 'DJ Set',
        description: 'Headline DJ spinning high-energy party sets and club remixes inside the illuminated DJ Stage Dome.',
      },
    ],
    highlights: [
      {
        id: 'hl-music',
        title: 'Live Bands & DJ Stage Dome',
        description:
          'Main Stage performances by The Imperial and Route 96 paired with DJ Willie Almeida inside the illuminated geodesic DJ Stage Dome.',
        iconKey: 'music',
      },
      {
        id: 'hl-dance',
        title: 'Central Illuminated Dance Floor',
        description:
          'Expansive open-air LED dance floor positioned directly in front of the Main Stage for 2,500 guests.',
        iconKey: 'sparkles',
      },
      {
        id: 'hl-food',
        title: 'Festive Bar & Food Counters',
        description:
          'Dedicated bar pavilion, multiple food counters, and full on-site kitchen serving festive starters, beverages, and dinner options.',
        iconKey: 'utensils',
      },
      {
        id: 'hl-vip',
        title: 'VIP Canopy & Table Seating',
        description:
          'Elevated VIP canopy zones flanking the dance floor plus organized general round-table seating.',
        iconKey: 'tree',
      },
      {
        id: 'hl-host',
        title: 'Hosted Entertainment & Spot Prizes',
        description:
          'Hosted live by Desmond Olivera with interactive audience moments, live performances, and festive spot prizes.',
        iconKey: 'gift',
      },
      {
        id: 'hl-access',
        title: 'Dual-Gate Entry & QR Verification',
        description:
          'Smooth crowd management through Main Gate and Gate 2 at JVPD Grounds with instant QR pass scanning.',
        iconKey: 'camera',
      },
    ],
    schedule: [
      {
        id: 'sch-1',
        time: '7:30 PM',
        title: 'Gates Open (Main Gate & Gate 2)',
        description:
          'QR ticket verification, VIP canopy & general seating check-in, and welcome hospitality at JVPD Grounds.',
      },
      {
        id: 'sch-2',
        time: '8:00 PM',
        title: 'Opening Set & Host Welcome — Desmond Olivera',
        description:
          'Festive opening showcase, bar & food counters active, and warm-up sets across the main grounds.',
      },
      {
        id: 'sch-3',
        time: '8:45 PM',
        title: 'Live Band Showcase — Route 96',
        description:
          'Live full-band performance on the Main Stage as the central dance floor comes alive.',
      },
      {
        id: 'sch-4',
        time: '10:00 PM',
        title: 'Headline Live Band — The Imperial',
        description:
          'High-voltage live set, Christmas night celebrations, and festive spot prizes hosted by Desmond Olivera.',
      },
      {
        id: 'sch-5',
        time: '11:15 PM Onwards',
        title: 'DJ Dome Takeover — DJ Willie Almeida',
        description:
          'High-energy Christmas night dance session through the late evening celebration.',
      },
    ],
    sponsorshipTiers: [],
    sponsorBrandingPerks: [],
    updatedAt: now,
  };
}

export function createInitialTicketCategories(): TicketCategory[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'couple-entry',
      name: 'Couple Entry',
      description:
        'Official Couple Entry pass for Jingle Bell Rock 1.0 at JVPD Grounds, Mumbai — valid for two guests (Music · Dance · Food).',
      priceInr: 2500,
      isPlaceholderPrice: false,
      totalInventory: 1250,
      soldCount: 0,
      reservedCount: 0,
      benefits: [
        'Valid for 2 Guests (Couple Entry) via Main Gate / Gate 2',
        'Access to Main Stage (The Imperial & Route 96) & Geodesic DJ Stage Dome',
        'Central Illuminated Dance Floor, Bar & Food Counters Access',
        'Instant Digital QR Verification & Official PDF Pass',
      ],
      enabled: true,
      sortOrder: 1,
      updatedAt: now,
    },
  ];
}

export const EVENT_FAQS = [
  {
    q: 'When and where is Jingle Bell Rock 1.0 taking place?',
    a: 'Jingle Bell Rock 1.0 takes place on Friday, 25 December 2026 from 7:30 PM onwards at JVPD Grounds, Military Rd, Next to Rithumbura College, Juhu, Mumbai 400 049.',
  },
  {
    q: 'Who is performing at the event?',
    a: 'The official lineup features live bands The Imperial and Route 96 on the Main Stage, host & performer Desmond Olivera, and DJ Willie Almeida performing in the DJ Stage Dome.',
  },
  {
    q: 'What is included in the Couple Entry ticket?',
    a: 'Each Couple Entry pass (₹2,500) grants entry for two guests via Main Gate or Gate 2 with access to the Main Stage live bands, Geodesic DJ Stage Dome, Central Dance Floor, general seating, and bar & food counters.',
  },
  {
    q: 'How can I book tickets and receive my passes?',
    a: 'Select your Couple Entry pass quantity on this page, click "Book Tickets Now", enter your contact details, and complete payment via Razorpay. Your unique QR-coded tickets and PDF pass are available for immediate download and automatically emailed to you.',
  },
  {
    q: 'Can I show my ticket on my phone at the gate?',
    a: 'Yes. Present your digital PDF or QR code on your mobile phone (with screen brightness raised) at Main Gate or Gate 2 along Military Road, paired with a valid government photo ID.',
  },
  {
    q: 'Can I purchase multiple Couple Entry passes in one booking?',
    a: 'Yes. You can select multiple Couple Entry passes in a single booking. Each pass issued receives its own unique Ticket ID and separate QR code.',
  },
  {
    q: 'What happens if I do not receive my ticket email?',
    a: 'You can download your official PDF ticket immediately after Razorpay verification on the confirmation screen. You can also contact the organizer with your Booking ID to trigger an instant email resend.',
  },
];
