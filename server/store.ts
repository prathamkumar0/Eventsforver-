import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AdminOverviewPayload,
  BookingLineItem,
  BookingRecord,
  EmailStatus,
  EventConfig,
  PaymentReadiness,
  PublicTicketCategory,
  TicketCategory,
  TicketRecord,
  TicketStatus,
} from '../shared/types.ts';
import { createInitialEventConfig, createInitialTicketCategories } from '../config/eventConfig.ts';

interface StoreData {
  eventConfig: EventConfig;
  ticketCategories: TicketCategory[];
  bookings: BookingRecord[];
  tickets: TicketRecord[];
  admins: string[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const RESERVATION_TTL_MS = 15 * 60 * 1000;

let writeQueue: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function ensureStoreFile(): StoreData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initial: StoreData = {
      eventConfig: createInitialEventConfig(),
      ticketCategories: createInitialTicketCategories(),
      bookings: [],
      tickets: [],
      admins: ['prathamkumar1703@gmail.com'],
    };
    const tmp = `${STORE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(initial, null, 2), 'utf8');
    fs.renameSync(tmp, STORE_PATH);
    return initial;
  }
  const raw = fs.readFileSync(STORE_PATH, 'utf8');
  const parsed = JSON.parse(raw) as StoreData;

  // Upgrade untouched initial template or old placeholder multi-tier config automatically
  const defaults = createInitialEventConfig();
  const isUntouchedTemplate =
    parsed.bookings.length === 0 &&
    ((parsed.eventConfig?.venueName === '[VENUE NAME]' &&
      parsed.eventConfig?.eventName === 'Christmas Night 2026') ||
      (parsed.ticketCategories?.some((c) => c.id === 'early-bird' && c.isPlaceholderPrice) &&
        parsed.eventConfig?.logoUrl === '/assets/brochure/page-1.jpg'));

  if (isUntouchedTemplate) {
    const upgraded: StoreData = {
      eventConfig: defaults,
      ticketCategories: createInitialTicketCategories(),
      bookings: [],
      tickets: [],
      admins: parsed.admins?.length ? parsed.admins : ['prathamkumar1703@gmail.com'],
    };
    saveStoreFile(upgraded);
    return upgraded;
  }

  // Ensure new fields exist on any existing EventConfig
  parsed.eventConfig = {
    ...defaults,
    ...parsed.eventConfig,
    artists: parsed.eventConfig?.artists?.length ? parsed.eventConfig.artists : defaults.artists,
    sponsorshipTiers: parsed.eventConfig?.sponsorshipTiers?.length
      ? parsed.eventConfig.sponsorshipTiers
      : defaults.sponsorshipTiers,
    sponsorBrandingPerks: parsed.eventConfig?.sponsorBrandingPerks?.length
      ? parsed.eventConfig.sponsorBrandingPerks
      : defaults.sponsorBrandingPerks,
  };

  if (!parsed.admins || parsed.admins.length === 0) {
    parsed.admins = ['prathamkumar1703@gmail.com'];
  }
  return parsed;
}

function saveStoreFile(data: StoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmp = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, STORE_PATH);
}

function releaseExpiredReservationsInMemory(data: StoreData): boolean {
  const now = Date.now();
  let changed = false;

  for (const booking of data.bookings) {
    if (
      booking.paymentStatus === 'PENDING' &&
      Date.parse(booking.reservationExpiresAt) <= now
    ) {
      booking.paymentStatus = 'CANCELLED';
      booking.updatedAt = new Date(now).toISOString();
      for (const item of booking.items) {
        const cat = data.ticketCategories.find((c) => c.id === item.categoryId);
        if (cat) {
          cat.reservedCount = Math.max(0, cat.reservedCount - item.quantity);
        }
      }
      changed = true;
    }
  }
  return changed;
}

function loadCleanStore(): StoreData {
  const data = ensureStoreFile();
  if (releaseExpiredReservationsInMemory(data)) {
    saveStoreFile(data);
  }
  return data;
}

export function toPublicCategory(cat: TicketCategory): PublicTicketCategory {
  const availableCount = Math.max(0, cat.totalInventory - cat.soldCount - cat.reservedCount);
  return {
    ...cat,
    availableCount,
  };
}

export async function getPublicEventData(): Promise<{
  eventConfig: EventConfig;
  categories: PublicTicketCategory[];
}> {
  return withLock(async () => {
    const data = loadCleanStore();
    const categories = data.ticketCategories
      .filter((c) => c.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toPublicCategory);
    return {
      eventConfig: data.eventConfig,
      categories,
    };
  });
}

export async function isAdminEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  return withLock(async () => {
    const data = loadCleanStore();
    return data.admins.some((a) => a.toLowerCase() === normalized);
  });
}

export async function calculateServerQuote(
  requestedItems: Array<{ categoryId: string; quantity: number }>,
): Promise<{
  eventConfig: EventConfig;
  items: BookingLineItem[];
  totalQuantity: number;
  subtotalInr: number;
  taxInr: number;
  platformFeeInr: number;
  totalInr: number;
}> {
  return withLock(async () => {
    const data = loadCleanStore();
    if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
      throw new Error('Select at least one ticket to continue.');
    }

    const merged = new Map<string, number>();
    for (const entry of requestedItems) {
      if (!entry || typeof entry.categoryId !== 'string') {
        throw new Error('Invalid ticket selection.');
      }
      const qty = Number(entry.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new Error('Ticket quantities must be positive whole numbers.');
      }
      if (qty > 25) {
        throw new Error('Maximum 25 passes per category per booking.');
      }
      merged.set(entry.categoryId, (merged.get(entry.categoryId) || 0) + qty);
    }

    const lineItems: BookingLineItem[] = [];
    let totalQuantity = 0;
    let subtotalInr = 0;

    for (const [categoryId, quantity] of merged.entries()) {
      const cat = data.ticketCategories.find((c) => c.id === categoryId);
      if (!cat) {
        throw new Error('Selected ticket category does not exist.');
      }
      if (!cat.enabled) {
        throw new Error(`${cat.name} is currently unavailable.`);
      }
      const available = Math.max(0, cat.totalInventory - cat.soldCount - cat.reservedCount);
      if (available <= 0) {
        throw new Error(`${cat.name} is sold out.`);
      }
      if (quantity > available) {
        throw new Error(`Only ${available} pass(es) remaining for ${cat.name}.`);
      }
      const lineTotalInr = Math.round(cat.priceInr * quantity * 100) / 100;
      lineItems.push({
        categoryId: cat.id,
        categoryName: cat.name,
        unitPriceInr: cat.priceInr,
        quantity,
        lineTotalInr,
      });
      totalQuantity += quantity;
      subtotalInr += lineTotalInr;
    }

    const taxInr = Math.round(subtotalInr * (data.eventConfig.taxPercent / 100) * 100) / 100;
    const platformFeeInr = Math.round(data.eventConfig.platformFeeInr * totalQuantity * 100) / 100;
    const totalInr = Math.round((subtotalInr + taxInr + platformFeeInr) * 100) / 100;

    return {
      eventConfig: data.eventConfig,
      items: lineItems,
      totalQuantity,
      subtotalInr,
      taxInr,
      platformFeeInr,
      totalInr,
    };
  });
}

function generateBookingCode(): string {
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `CN26-${rand}`;
}

function generateTicketCode(): string {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `TKT-${rand}`;
}

function generateQrToken(ticketId: string, secret: string): string {
  const nonce = crypto.randomBytes(12).toString('hex');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${ticketId}.${nonce}`)
    .digest('hex')
    .slice(0, 24);
  return `${nonce}.${sig}`;
}

export async function reserveAndCreatePendingBooking(params: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  requestedItems: Array<{ categoryId: string; quantity: number }>;
  createOrderFn: (amountInr: number, bookingCode: string, bookingId: string) => Promise<string>;
}): Promise<BookingRecord> {
  return withLock(async () => {
    const data = loadCleanStore();
    const merged = new Map<string, number>();
    for (const entry of params.requestedItems) {
      const qty = Number(entry.quantity);
      if (!Number.isInteger(qty) || qty <= 0 || qty > 25) {
        throw new Error('Invalid ticket quantity.');
      }
      merged.set(entry.categoryId, (merged.get(entry.categoryId) || 0) + qty);
    }

    if (merged.size === 0) {
      throw new Error('Please select at least one ticket.');
    }

    const lineItems: BookingLineItem[] = [];
    let totalQuantity = 0;
    let subtotalInr = 0;

    for (const [categoryId, quantity] of merged.entries()) {
      const cat = data.ticketCategories.find((c) => c.id === categoryId);
      if (!cat || !cat.enabled) {
        throw new Error('Selected ticket category is unavailable.');
      }
      const available = Math.max(0, cat.totalInventory - cat.soldCount - cat.reservedCount);
      if (quantity > available) {
        throw new Error(
          available === 0
            ? `${cat.name} is sold out.`
            : `Only ${available} pass(es) remaining for ${cat.name}.`,
        );
      }
      const lineTotalInr = Math.round(cat.priceInr * quantity * 100) / 100;
      lineItems.push({
        categoryId: cat.id,
        categoryName: cat.name,
        unitPriceInr: cat.priceInr,
        quantity,
        lineTotalInr,
      });
      totalQuantity += quantity;
      subtotalInr += lineTotalInr;
    }

    const taxInr = Math.round(subtotalInr * (data.eventConfig.taxPercent / 100) * 100) / 100;
    const platformFeeInr = Math.round(data.eventConfig.platformFeeInr * totalQuantity * 100) / 100;
    const totalInr = Math.round((subtotalInr + taxInr + platformFeeInr) * 100) / 100;

    const bookingId = `bk_${crypto.randomUUID().replace(/-/g, '')}`;
    const bookingCode = generateBookingCode();
    const accessToken = crypto.randomBytes(24).toString('hex');

    // Create Razorpay order BEFORE committing inventory reservation
    const razorpayOrderId = await params.createOrderFn(totalInr, bookingCode, bookingId);

    // Reserve inventory atomically
    for (const item of lineItems) {
      const cat = data.ticketCategories.find((c) => c.id === item.categoryId);
      if (cat) {
        cat.reservedCount += item.quantity;
        cat.updatedAt = new Date().toISOString();
      }
    }

    const now = new Date().toISOString();
    const booking: BookingRecord = {
      id: bookingId,
      bookingCode,
      customerName: params.customerName.trim(),
      customerEmail: params.customerEmail.trim().toLowerCase(),
      customerPhone: params.customerPhone.trim(),
      items: lineItems,
      totalQuantity,
      subtotalInr,
      taxInr,
      platformFeeInr,
      totalInr,
      paymentStatus: 'PENDING',
      razorpayOrderId,
      emailStatus: 'NOT_SENT',
      accessToken,
      reservationExpiresAt: new Date(Date.now() + RESERVATION_TTL_MS).toISOString(),
      webhookEventIds: [],
      createdAt: now,
      updatedAt: now,
    };

    data.bookings.unshift(booking);
    saveStoreFile(data);
    return booking;
  });
}

export async function getBookingById(bookingId: string): Promise<BookingRecord | null> {
  return withLock(async () => {
    const data = loadCleanStore();
    return data.bookings.find((b) => b.id === bookingId) || null;
  });
}

export async function getBookingByOrderId(orderId: string): Promise<BookingRecord | null> {
  return withLock(async () => {
    const data = loadCleanStore();
    return data.bookings.find((b) => b.razorpayOrderId === orderId) || null;
  });
}

export async function getTicketsForBooking(bookingId: string): Promise<TicketRecord[]> {
  return withLock(async () => {
    const data = loadCleanStore();
    return data.tickets.filter((t) => t.bookingId === bookingId);
  });
}

export async function markBookingPaidIdempotent(params: {
  bookingId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
  webhookEventId?: string;
  signingSecret: string;
}): Promise<{
  booking: BookingRecord;
  tickets: TicketRecord[];
  newlyConfirmed: boolean;
}> {
  return withLock(async () => {
    const data = loadCleanStore();
    const booking = data.bookings.find((b) => b.id === params.bookingId);
    if (!booking) {
      throw new Error('Booking record not found.');
    }

    if (params.webhookEventId && booking.webhookEventIds.includes(params.webhookEventId)) {
      const existingTickets = data.tickets.filter((t) => t.bookingId === booking.id);
      return { booking, tickets: existingTickets, newlyConfirmed: false };
    }

    if (booking.paymentStatus === 'PAID') {
      if (params.webhookEventId) {
        booking.webhookEventIds.push(params.webhookEventId);
        saveStoreFile(data);
      }
      const existingTickets = data.tickets.filter((t) => t.bookingId === booking.id);
      return { booking, tickets: existingTickets, newlyConfirmed: false };
    }

    const wasPending = booking.paymentStatus === 'PENDING';

    // Convert reserved inventory to sold inventory safely
    for (const item of booking.items) {
      const cat = data.ticketCategories.find((c) => c.id === item.categoryId);
      if (cat) {
        if (wasPending) {
          cat.reservedCount = Math.max(0, cat.reservedCount - item.quantity);
        }
        cat.soldCount += item.quantity;
        cat.updatedAt = new Date().toISOString();
      }
    }

    const now = new Date().toISOString();
    booking.paymentStatus = 'PAID';
    booking.razorpayPaymentId = params.razorpayPaymentId;
    if (params.razorpaySignature) {
      booking.razorpaySignature = params.razorpaySignature;
    }
    if (params.webhookEventId) {
      booking.webhookEventIds.push(params.webhookEventId);
    }
    booking.updatedAt = now;

    // Issue unique TicketRecord per ticket purchased (prevent duplicates)
    const existingTickets = data.tickets.filter((t) => t.bookingId === booking.id);
    const issuedTickets: TicketRecord[] = [...existingTickets];

    if (existingTickets.length === 0) {
      for (const item of booking.items) {
        for (let i = 0; i < item.quantity; i += 1) {
          const ticketId = `tkt_${crypto.randomUUID().replace(/-/g, '')}`;
          const ticket: TicketRecord = {
            id: ticketId,
            ticketCode: generateTicketCode(),
            bookingId: booking.id,
            bookingCode: booking.bookingCode,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            customerName: booking.customerName,
            qrToken: generateQrToken(ticketId, params.signingSecret),
            status: 'VALID',
            createdAt: now,
          };
          data.tickets.unshift(ticket);
          issuedTickets.push(ticket);
        }
      }
    }

    saveStoreFile(data);
    return { booking, tickets: issuedTickets, newlyConfirmed: true };
  });
}

export async function markBookingFailedOrCancelled(params: {
  bookingId: string;
  status: 'FAILED' | 'CANCELLED';
  webhookEventId?: string;
}): Promise<BookingRecord | null> {
  return withLock(async () => {
    const data = loadCleanStore();
    const booking = data.bookings.find((b) => b.id === params.bookingId);
    if (!booking) return null;

    if (booking.paymentStatus === 'PAID') {
      // Never downgrade an already verified PAID booking
      return booking;
    }

    if (booking.paymentStatus === 'PENDING') {
      for (const item of booking.items) {
        const cat = data.ticketCategories.find((c) => c.id === item.categoryId);
        if (cat) {
          cat.reservedCount = Math.max(0, cat.reservedCount - item.quantity);
          cat.updatedAt = new Date().toISOString();
        }
      }
    }

    booking.paymentStatus = params.status;
    if (params.webhookEventId && !booking.webhookEventIds.includes(params.webhookEventId)) {
      booking.webhookEventIds.push(params.webhookEventId);
    }
    booking.updatedAt = new Date().toISOString();
    saveStoreFile(data);
    return booking;
  });
}

export async function updateBookingEmailStatus(
  bookingId: string,
  emailStatus: EmailStatus,
  emailError?: string,
): Promise<void> {
  return withLock(async () => {
    const data = ensureStoreFile();
    const booking = data.bookings.find((b) => b.id === bookingId);
    if (!booking) return;
    booking.emailStatus = emailStatus;
    booking.emailError = emailError;
    booking.updatedAt = new Date().toISOString();
    saveStoreFile(data);
  });
}

export async function lookupTicketByTokenOrCode(queryValue: string): Promise<{
  ticket: TicketRecord;
  booking: BookingRecord;
  eventConfig: EventConfig;
} | null> {
  const cleaned = queryValue.trim();
  if (!cleaned) return null;

  return withLock(async () => {
    const data = loadCleanStore();
    const ticket = data.tickets.find(
      (t) =>
        t.qrToken === cleaned ||
        t.ticketCode.toUpperCase() === cleaned.toUpperCase() ||
        t.id === cleaned,
    );
    if (!ticket) return null;
    const booking = data.bookings.find((b) => b.id === ticket.bookingId);
    if (!booking) return null;
    return {
      ticket,
      booking,
      eventConfig: data.eventConfig,
    };
  });
}

export async function checkInTicketAtomically(
  ticketIdOrToken: string,
  checkedInByEmail: string,
): Promise<{
  outcome: 'CHECKED_IN' | 'ALREADY_USED' | 'INVALID_STATUS' | 'NOT_FOUND';
  ticket?: TicketRecord;
  booking?: BookingRecord;
}> {
  const cleaned = ticketIdOrToken.trim();
  return withLock(async () => {
    const data = loadCleanStore();
    const ticket = data.tickets.find(
      (t) =>
        t.id === cleaned ||
        t.qrToken === cleaned ||
        t.ticketCode.toUpperCase() === cleaned.toUpperCase(),
    );
    if (!ticket) {
      return { outcome: 'NOT_FOUND' };
    }
    const booking = data.bookings.find((b) => b.id === ticket.bookingId);
    if (!booking || booking.paymentStatus !== 'PAID') {
      return { outcome: 'INVALID_STATUS', ticket, booking };
    }
    if (ticket.status === 'USED') {
      return { outcome: 'ALREADY_USED', ticket, booking };
    }
    if (ticket.status !== 'VALID') {
      return { outcome: 'INVALID_STATUS', ticket, booking };
    }

    ticket.status = 'USED';
    ticket.checkedInAt = new Date().toISOString();
    ticket.checkedInBy = checkedInByEmail;
    saveStoreFile(data);
    return { outcome: 'CHECKED_IN', ticket, booking };
  });
}

export async function updateTicketStatusByAdmin(
  ticketId: string,
  status: TicketStatus,
): Promise<TicketRecord | null> {
  return withLock(async () => {
    const data = loadCleanStore();
    const ticket = data.tickets.find((t) => t.id === ticketId);
    if (!ticket) return null;
    ticket.status = status;
    if (status === 'VALID') {
      delete ticket.checkedInAt;
      delete ticket.checkedInBy;
    }
    saveStoreFile(data);
    return ticket;
  });
}

export async function getAdminOverview(
  paymentReadiness: PaymentReadiness,
): Promise<AdminOverviewPayload> {
  return withLock(async () => {
    const data = loadCleanStore();
    const categories = [...data.ticketCategories]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toPublicCategory);

    const paidBookings = data.bookings.filter((b) => b.paymentStatus === 'PAID');
    const pendingBookings = data.bookings.filter((b) => b.paymentStatus === 'PENDING');
    const failedBookings = data.bookings.filter(
      (b) => b.paymentStatus === 'FAILED' || b.paymentStatus === 'CANCELLED',
    );

    const totalRevenueInr =
      Math.round(paidBookings.reduce((sum, b) => sum + b.totalInr, 0) * 100) / 100;
    const totalTicketsSold = paidBookings.reduce((sum, b) => sum + b.totalQuantity, 0);
    const availableTicketsCount = categories
      .filter((c) => c.enabled)
      .reduce((sum, c) => sum + c.availableCount, 0);
    const soldOutCategoriesCount = categories.filter(
      (c) => c.enabled && c.availableCount === 0,
    ).length;

    return {
      eventConfig: data.eventConfig,
      categories,
      bookings: data.bookings,
      tickets: data.tickets,
      paymentReadiness,
      metrics: {
        totalBookings: data.bookings.length,
        totalTicketsSold,
        totalRevenueInr,
        paidBookingsCount: paidBookings.length,
        pendingBookingsCount: pendingBookings.length,
        failedBookingsCount: failedBookings.length,
        availableTicketsCount,
        soldOutCategoriesCount,
      },
    };
  });
}

export async function updateEventConfigByAdmin(
  partial: Partial<EventConfig>,
): Promise<EventConfig> {
  return withLock(async () => {
    const data = loadCleanStore();
    data.eventConfig = {
      ...data.eventConfig,
      ...partial,
      currency: 'INR',
      updatedAt: new Date().toISOString(),
    };
    saveStoreFile(data);
    return data.eventConfig;
  });
}

export async function createCategoryByAdmin(input: {
  name: string;
  description: string;
  priceInr: number;
  isPlaceholderPrice?: boolean;
  totalInventory: number;
  benefits: string[];
  enabled: boolean;
}): Promise<PublicTicketCategory> {
  return withLock(async () => {
    const data = loadCleanStore();
    const id = `cat_${crypto.randomBytes(4).toString('hex')}`;
    const maxOrder = data.ticketCategories.reduce((m, c) => Math.max(m, c.sortOrder), 0);
    const created: TicketCategory = {
      id,
      name: input.name.trim(),
      description: input.description.trim(),
      priceInr: Math.max(0, Number(input.priceInr)),
      isPlaceholderPrice: Boolean(input.isPlaceholderPrice),
      totalInventory: Math.max(0, Math.floor(Number(input.totalInventory))),
      soldCount: 0,
      reservedCount: 0,
      benefits: input.benefits.filter((b) => b.trim().length > 0).slice(0, 10),
      enabled: Boolean(input.enabled),
      sortOrder: maxOrder + 1,
      updatedAt: new Date().toISOString(),
    };
    data.ticketCategories.push(created);
    saveStoreFile(data);
    return toPublicCategory(created);
  });
}

export async function updateCategoryByAdmin(
  categoryId: string,
  patch: Partial<TicketCategory>,
): Promise<PublicTicketCategory> {
  return withLock(async () => {
    const data = loadCleanStore();
    const cat = data.ticketCategories.find((c) => c.id === categoryId);
    if (!cat) {
      throw new Error('Ticket category not found.');
    }
    const nextTotal =
      patch.totalInventory !== undefined
        ? Math.max(cat.soldCount + cat.reservedCount, Math.floor(Number(patch.totalInventory)))
        : cat.totalInventory;

    if (patch.name !== undefined) cat.name = String(patch.name).trim();
    if (patch.description !== undefined) cat.description = String(patch.description).trim();
    if (patch.priceInr !== undefined) cat.priceInr = Math.max(0, Number(patch.priceInr));
    if (patch.isPlaceholderPrice !== undefined)
      cat.isPlaceholderPrice = Boolean(patch.isPlaceholderPrice);
    cat.totalInventory = nextTotal;
    if (Array.isArray(patch.benefits)) {
      cat.benefits = patch.benefits.map((b) => b.trim()).filter(Boolean).slice(0, 10);
    }
    if (patch.enabled !== undefined) cat.enabled = Boolean(patch.enabled);
    if (patch.sortOrder !== undefined) cat.sortOrder = Number(patch.sortOrder);
    cat.updatedAt = new Date().toISOString();

    saveStoreFile(data);
    return toPublicCategory(cat);
  });
}

export async function deleteCategoryByAdmin(categoryId: string): Promise<void> {
  return withLock(async () => {
    const data = loadCleanStore();
    const cat = data.ticketCategories.find((c) => c.id === categoryId);
    if (!cat) throw new Error('Ticket category not found.');
    if (cat.soldCount > 0 || cat.reservedCount > 0) {
      throw new Error('Cannot delete a category with sold or reserved tickets. Disable it instead.');
    }
    data.ticketCategories = data.ticketCategories.filter((c) => c.id !== categoryId);
    saveStoreFile(data);
  });
}
