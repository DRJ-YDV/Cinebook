/**
 * CineBook MongoDB document models (client-safe types only).
 *
 * TMDB stays the source of truth for movie metadata — CineBook documents only
 * ever keep `tmdbId` plus a small cached title/poster/backdrop for display.
 */

export const COLLECTIONS = {
  users: "users",
  theatres: "theatres",
  screens: "screens",
  shows: "shows",
  showSeats: "show_seats",
  bookings: "bookings",
  payments: "payments",
  favorites: "favorites",
  offers: "offers",
  meta: "meta",
} as const;

export type Format = "2D" | "3D" | "IMAX" | "4DX";
export type SeatCategory = "Regular" | "Premium" | "Recliner";

export type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUND_PENDING" | "REFUNDED";

/** Minimal movie reference — never a copy of the TMDB catalog. */
export type MovieRef = {
  tmdbId: number;
  /** CineBook internal movie id (`tmdb<id>`), kept for routing convenience. */
  movieId?: string;
  title?: string;
  posterPath?: string;
  backdropPath?: string;
};

export type UserDoc = {
  _id?: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  /** PBKDF2 hash — plaintext passwords are never stored. */
  passwordHash: string;
  passwordSalt: string;
  /** Legacy records omit this and retain their original 100,000 iterations. */
  passwordIterations?: number;
  city?: string;
  role: "user" | "admin";
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  city?: string;
  role: "user" | "admin";
};

export type ScreenDoc = {
  _id?: string;
  screenId: string;
  theatreId: string;
  name: string;
  seats: number;
  formats: Format[];
  /** Row letters + seats per row; category is derived from the row bands. */
  seatConfig: SeatConfig;
  createdAt: string;
  updatedAt: string;
};

export type SeatConfig = {
  rows: string[];
  seatsPerRow: number;
  categories: { category: SeatCategory; rows: string[]; multiplier: number }[];
};

export type TheatreDoc = {
  _id?: string;
  theatreId: string;
  name: string;
  city: string;
  address: string;
  rating: number;
  distanceKm?: number;
  formats: Format[];
  amenities: string[];
  screens: { screenId: string; name: string; seats: number }[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ShowDoc = {
  _id?: string;
  showId: string;
  movie: MovieRef;
  theatreId: string;
  screenId: string;
  screenName: string;
  date: string; // yyyy-mm-dd
  time: string; // "07:30 PM"
  startsAt?: string; // ISO
  format: Format;
  language: string;
  price: number; // base regular ticket price
  seatConfig: SeatConfig;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/** One document per show holds the authoritative seat state. */
export type ShowSeatsDoc = {
  _id?: string;
  showId: string;
  /** Permanently sold seats (confirmed bookings). */
  taken: string[];
  /** Temporary locks created while a booking is being paid for. */
  holds: { seat: string; ref: string; expiresAt: string }[];
  updatedAt: string;
};

export type BookedSeat = { code: string; category: SeatCategory; price: number };

export type BookingDoc = {
  _id?: string;
  bookingId: string;
  idempotencyKey?: string;
  userId: string | null;
  userEmail: string;
  movie: MovieRef;
  theatreId: string;
  theatreName: string;
  address: string;
  screenId?: string;
  screenName: string;
  showId: string;
  date: string;
  time: string;
  format: Format;
  seats: BookedSeat[];
  seatCodes: string[];
  quantity: number;
  amount: { tickets: number; fee: number; taxes: number; discount: number; total: number };
  offerCode?: string | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentId?: string | null;
  /** QR payload rendered on the digital ticket. */
  qr: { code: string; payload: string; issuedAt: string };
  holdRef?: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentDoc = {
  _id?: string;
  paymentId: string;
  bookingId: string;
  userId: string | null;
  amount: number;
  currency: "INR";
  method: string;
  /** "mock" today; "razorpay" once the gateway is wired up. */
  provider: "mock" | "razorpay";
  status: PaymentStatus;
  /** Reserved for Razorpay order/payment/signature verification. */
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  providerSignature?: string | null;
  orderClaim?: string | null;
  orderClaimExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FavoriteDoc = {
  _id?: string;
  userId: string;
  tmdbId: number;
  movieId: string;
  title?: string;
  posterPath?: string;
  createdAt: string;
};

export type OfferDoc = {
  _id?: string;
  code: string;
  title: string;
  description: string;
  type: "flat" | "percent";
  value: number;
  max?: number;
  icon: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_SEAT_CONFIG: SeatConfig = {
  rows: ["A", "B", "C", "D", "E", "F", "G", "H", "J"],
  seatsPerRow: 12,
  categories: [
    { category: "Regular", rows: ["A", "B", "C"], multiplier: 1 },
    { category: "Premium", rows: ["D", "E", "F", "G"], multiplier: 1.4 },
    { category: "Recliner", rows: ["H", "J"], multiplier: 2.2 },
  ],
};

export function categoryForRow(
  row: string,
  config: SeatConfig = DEFAULT_SEAT_CONFIG,
): SeatCategory {
  return config.categories.find((c) => c.rows.includes(row))?.category ?? "Regular";
}

export function priceForRow(
  basePrice: number,
  row: string,
  config: SeatConfig = DEFAULT_SEAT_CONFIG,
): number {
  const mult = config.categories.find((c) => c.rows.includes(row))?.multiplier ?? 1;
  return Math.round(basePrice * mult);
}
