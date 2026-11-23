export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
export type EmailStatus = 'NOT_SENT' | 'SENT' | 'FAILED' | 'PENDING_CONFIG';
export type TicketStatus = 'VALID' | 'USED' | 'CANCELLED' | 'REFUNDED';

export interface EventHighlight {
  id: string;
  title: string;
  description: string;
  iconKey: 'music' | 'tree' | 'sparkles' | 'utensils' | 'camera' | 'gift';
}

export interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  description: string;
}

export interface ArtistLineupItem {
  id: string;
  name: string;
  role: string;
  description: string;
}

export interface SponsorshipTier {
  id: string;
  name: string;
  amountLabel: string;
  perks: string[];
}

export interface EventConfig {
  eventName: string;
  presenters: string;
  tagline: string;
  description: string;
  eventDate: string;
  eventTime: string;
  countdownIso: string;
  timezone: string;
  currency: 'INR';
  venueName: string;
  venueAddress: string;
  city: string;
  country: string;
  expectedCrowd: string;
  brochurePdfUrl: string;
  googleMapsUrl: string;
  contactNumber: string;
  contactEmail: string;
  instagramUrl: string;
  logoUrl: string;
  taxPercent: number;
  platformFeeInr: number;
  highlights: EventHighlight[];
  schedule: ScheduleItem[];
  artists: ArtistLineupItem[];
  sponsorshipTiers: SponsorshipTier[];
  sponsorBrandingPerks: string[];
  updatedAt: string;
}

export interface TicketCategory {
  id: string;
  name: string;
  description: string;
  priceInr: number;
  isPlaceholderPrice: boolean;
  totalInventory: number;
  soldCount: number;
  reservedCount: number;
  benefits: string[];
  enabled: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface PublicTicketCategory extends TicketCategory {
  availableCount: number;
}

export interface BookingLineItem {
  categoryId: string;
  categoryName: string;
  unitPriceInr: number;
  quantity: number;
  lineTotalInr: number;
}

export interface BookingRecord {
  id: string;
  bookingCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: BookingLineItem[];
  totalQuantity: number;
  subtotalInr: number;
  taxInr: number;
  platformFeeInr: number;
  totalInr: number;
  paymentStatus: PaymentStatus;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  emailStatus: EmailStatus;
  emailError?: string;
  accessToken: string;
  reservationExpiresAt: string;
  webhookEventIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TicketRecord {
  id: string;
  ticketCode: string;
  bookingId: string;
  bookingCode: string;
  categoryId: string;
  categoryName: string;
  customerName: string;
  qrToken: string;
  status: TicketStatus;
  checkedInAt?: string;
  checkedInBy?: string;
  createdAt: string;
}

export interface PaymentReadiness {
  mode: 'test' | 'live' | 'unconfigured';
  razorpayConfigured: boolean;
  webhookConfigured: boolean;
  emailProvider: 'resend' | 'smtp' | 'unconfigured';
}

export interface PublicEventPayload {
  eventConfig: EventConfig;
  categories: PublicTicketCategory[];
  paymentReadiness: PaymentReadiness;
}

export interface AdminOverviewPayload {
  eventConfig: EventConfig;
  categories: PublicTicketCategory[];
  bookings: BookingRecord[];
  tickets: TicketRecord[];
  paymentReadiness: PaymentReadiness;
  metrics: {
    totalBookings: number;
    totalTicketsSold: number;
    totalRevenueInr: number;
    paidBookingsCount: number;
    pendingBookingsCount: number;
    failedBookingsCount: number;
    availableTicketsCount: number;
    soldOutCategoriesCount: number;
  };
}
