/**
 * CineBook database services. Server-only.
 *
 * Every CineBook-owned entity (users, theatres, screens, shows, seats,
 * bookings, payments, favorites, offers) lives here. Movie metadata is never
 * duplicated — documents only carry `tmdbId` plus a small cached title/poster.
 */

import {
  COLLECTIONS,
  DEFAULT_SEAT_CONFIG,
  categoryForRow,
  priceForRow,
  type BookedSeat,
  type BookingDoc,
  type BookingStatus,
  type FavoriteDoc,
  type Format,
  type MovieRef,
  type OfferDoc,
  type PaymentDoc,
  type PublicUser,
  type ScreenDoc,
  type ShowDoc,
  type ShowSeatsDoc,
  type TheatreDoc,
  type UserDoc,
} from "./models";
import { DbError, collection, isDbConfigured } from "./mongo.server";
import { timingSafeEqual } from "node:crypto";
import { withTransaction } from "./mongo.server";
import { generateShows } from "../shows";
import { showStartsAt, validSeatCodes } from "../booking-rules";
import { MOVIES, type Theatre } from "@/data/catalog";

const users = () => collection<UserDoc>(COLLECTIONS.users);
const theatres = () => collection<TheatreDoc>(COLLECTIONS.theatres);
const screens = () => collection<ScreenDoc>(COLLECTIONS.screens);
const shows = () => collection<ShowDoc>(COLLECTIONS.shows);
const showSeats = () => collection<ShowSeatsDoc>(COLLECTIONS.showSeats);
const bookings = () => collection<BookingDoc>(COLLECTIONS.bookings);
const payments = () => collection<PaymentDoc>(COLLECTIONS.payments);
const favorites = () => collection<FavoriteDoc>(COLLECTIONS.favorites);
const offers = () => collection<OfferDoc>(COLLECTIONS.offers);

export { isDbConfigured };

const now = () => new Date().toISOString();
const HOLD_TTL_MS = 10 * 60 * 1000;
let bookingIndexes: Promise<void> | undefined;
async function ensureBookingIndexes() {
  bookingIndexes ??= import("./seed.server")
    .then((m) => m.ensureIndexes())
    .catch((error) => {
      bookingIndexes = undefined;
      throw error;
    });
  await bookingIndexes;
}

function assertShowOpen(show: ShowDoc) {
  const startsAt = showStartsAt(show.date, show.time);
  if (!show.active || !startsAt || new Date(startsAt).getTime() <= Date.now())
    throw new DbError("INVALID_SHOW", "This showtime has expired or is no longer listed.");
}

function randomId(prefix: string) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let s = prefix;
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) s += chars[b % chars.length];
  return s;
}

/* ------------------------------------------------------------------ users */

async function hashPassword(password: string, saltHex?: string, iterations = 600_000) {
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  const hex = (buf: ArrayBuffer | Uint8Array) =>
    [...new Uint8Array(buf as ArrayBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { hash: hex(bits), salt: saltHex ?? hex(salt) };
}

function publicUser(u: UserDoc): PublicUser {
  return {
    userId: u.userId,
    name: u.name,
    email: u.email,
    phone: u.phone ?? "",
    ...(u.city ? { city: u.city } : {}),
    role: u.role,
  };
}

export async function createUser(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  city?: string;
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new DbError("VALIDATION", "Enter a valid email address.");
  if (!input.name.trim() || input.password.length < 8 || input.password.length > 128)
    throw new DbError("VALIDATION", "Enter your name and a password between 8 and 128 characters.");
  await users().ensureIndex({ email: 1 }, { unique: true });
  await users().ensureIndex({ userId: 1 }, { unique: true });
  const existing = await users().findOne({ email });
  if (existing) throw new DbError("VALIDATION", "An account with this email already exists.");
  const { hash, salt } = await hashPassword(input.password);

  const doc: UserDoc = {
    userId: randomId("U"),
    name: input.name.trim(),
    email,
    ...(input.phone ? { phone: input.phone } : {}),
    passwordHash: hash,
    passwordSalt: salt,
    ...(input.city ? { city: input.city } : {}),
    role: "user",
    passwordIterations: 600_000,
    createdAt: now(),
    updatedAt: now(),
  };
  await users().insertOne(doc);
  return publicUser(doc);
}

export async function getUser(query: {
  userId?: string;
  email?: string;
}): Promise<PublicUser | null> {
  const filter = query.userId
    ? { userId: query.userId }
    : { email: (query.email ?? "").trim().toLowerCase() };
  const doc = await users().findOne(filter);
  return doc ? publicUser(doc) : null;
}

export async function verifyUser(email: string, password: string): Promise<PublicUser | null> {
  const doc = await users().findOne({ email: email.trim().toLowerCase() });
  const { hash } = await hashPassword(
    password,
    doc?.passwordSalt ?? "00000000000000000000000000000000",
    doc?.passwordIterations ?? (doc ? 100_000 : 600_000),
  );
  if (!doc || !/^[a-f0-9]{64}$/i.test(doc.passwordHash)) return null;
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(doc.passwordHash, "hex"))
    ? publicUser(doc)
    : null;
}

export async function updateUser(
  userId: string,
  patch: { name?: string; phone?: string; city?: string },
): Promise<PublicUser | null> {
  const set: Record<string, unknown> = { updatedAt: now() };
  if (patch.name !== undefined) set["name"] = patch.name;
  if (patch.phone !== undefined) set["phone"] = patch.phone;
  if (patch.city !== undefined) set["city"] = patch.city;
  await users().updateOne({ userId }, { $set: set });
  return getUser({ userId });
}

/* --------------------------------------------------------------- theatres */

export async function getTheatres(city?: string): Promise<TheatreDoc[]> {
  const filter: Record<string, unknown> = { active: true };
  if (city) filter["city"] = city;
  return theatres().find(filter, { sort: { name: 1 }, limit: 200 });
}

export async function getTheatre(theatreId: string): Promise<TheatreDoc> {
  const doc = await theatres().findOne({ theatreId });
  if (!doc || !doc.active)
    throw new DbError("INVALID_THEATRE", "That theatre is no longer listed.");
  return doc;
}

export async function upsertTheatre(input: Partial<TheatreDoc> & { theatreId: string }) {
  await theatres().updateOne(
    { theatreId: input.theatreId },
    { $set: { ...input, updatedAt: now() }, $setOnInsert: { createdAt: now() } },
    { upsert: true },
  );
  return theatres().findOne({ theatreId: input.theatreId });
}

/* ---------------------------------------------------------------- screens */

export async function getScreens(theatreId?: string): Promise<ScreenDoc[]> {
  return screens().find(theatreId ? { theatreId } : {}, { limit: 300 });
}

export async function upsertScreen(
  input: Partial<ScreenDoc> & { screenId: string; theatreId: string },
) {
  // seatConfig must not appear in both $set and $setOnInsert — Mongo rejects
  // an update that would "create a conflict" for the same path.
  const { seatConfig, ...rest } = input;
  await screens().updateOne(
    { screenId: input.screenId },
    {
      $set: { ...rest, seatConfig: seatConfig ?? DEFAULT_SEAT_CONFIG, updatedAt: now() },
      $setOnInsert: { createdAt: now() },
    },
    { upsert: true },
  );
  return screens().findOne({ screenId: input.screenId });
}

/* ------------------------------------------------------------------ shows */

export type ShowHint = {
  movie: MovieRef;
  theatreId: string;
  screenName: string;
  screenId?: string;
  date: string;
  time: string;
  format: Format;
  language?: string;
  price: number;
};

export async function getShows(query: {
  movieId?: string;
  tmdbId?: number;
  theatreId?: string;
  date?: string;
}): Promise<ShowDoc[]> {
  const filter: Record<string, unknown> = { active: true };
  if (query.tmdbId !== undefined) filter["movie.tmdbId"] = query.tmdbId;
  if (query.movieId) filter["movie.movieId"] = query.movieId;
  if (query.theatreId) filter["theatreId"] = query.theatreId;
  if (query.date) filter["date"] = query.date;
  const listed = await shows().find(filter, { sort: { date: 1, time: 1 }, limit: 300 });
  return listed.filter((show) => {
    const startsAt = showStartsAt(show.date, show.time);
    return !!startsAt && new Date(startsAt).getTime() > Date.now();
  });
}

export async function getShow(showId: string): Promise<ShowDoc> {
  const doc = await shows().findOne({ showId });
  if (!doc) throw new DbError("INVALID_SHOW", "This showtime has expired or is no longer listed.");
  return doc;
}

export async function createShow(
  input: ShowHint & { showId?: string },
  opts: { insertOnly?: boolean } = {},
): Promise<ShowDoc> {
  const theatre = await getTheatre(input.theatreId);
  const startsAt = showStartsAt(input.date, input.time);
  if (!startsAt || new Date(startsAt).getTime() <= Date.now())
    throw new DbError("INVALID_SHOW", "Choose a valid future showtime.");
  if (!Number.isFinite(input.price) || input.price < 50 || input.price > 5000)
    throw new DbError("VALIDATION", "Ticket price is out of range.");
  const screen = theatre.screens.find((s) =>
    input.screenId ? s.screenId === input.screenId : s.name === input.screenName,
  );
  if (!screen || !theatre.formats.includes(input.format))
    throw new DbError("VALIDATION", "The screen or format is not available at this theatre.");
  const screenDoc = await screens().findOne({
    screenId: screen.screenId,
    theatreId: theatre.theatreId,
  });
  if (!screenDoc || !screenDoc.formats.includes(input.format))
    throw new DbError("VALIDATION", "This screen does not support the requested show.");
  const showId =
    input.showId ??
    `${input.movie.movieId ?? `tmdb${input.movie.tmdbId}`}_${input.theatreId}_${input.date}_${input.time.replace(/[: ]/g, "")}`;
  const doc: ShowDoc = {
    showId,
    movie: input.movie,
    theatreId: input.theatreId,
    screenId: screen.screenId,
    screenName: screen.name,
    date: input.date,
    time: input.time,
    startsAt,
    format: input.format,
    language: input.language ?? "Hindi",
    price: Math.round(input.price),
    seatConfig: screenDoc.seatConfig,
    active: true,
    createdAt: now(),
    updatedAt: now(),
  };
  const existing = await shows().findOne({ showId });
  if (existing) {
    if (opts.insertOnly) return existing;
    if (
      existing.price !== doc.price ||
      existing.screenId !== doc.screenId ||
      existing.date !== doc.date ||
      existing.time !== doc.time ||
      existing.format !== doc.format ||
      JSON.stringify(existing.movie) !== JSON.stringify(doc.movie) ||
      JSON.stringify(existing.seatConfig) !== JSON.stringify(doc.seatConfig)
    )
      throw new DbError(
        "VALIDATION",
        "Published showtimes cannot be changed. Create a new showtime instead.",
      );
    return existing;
  }
  await ensureBookingIndexes();
  // Materialising the same deterministic show concurrently must not overwrite its price/configuration.
  if (opts.insertOnly) await shows().updateOne({ showId }, { $setOnInsert: doc }, { upsert: true });
  else {
    const { createdAt: _createdAt, ...setDoc } = doc;
    await shows().updateOne(
      { showId },
      { $set: setDoc, $setOnInsert: { createdAt: now() } },
      { upsert: true },
    );
  }
  return getShow(showId);
}

/**
 * Materialises a show the visitor navigated to. CineBook generates showtimes
 * deterministically from the TMDB movie + theatre, so the first person to open
 * a showtime persists it; everyone after that reads the stored document.
 */
export async function ensureShow(showId: string, hint?: ShowHint): Promise<ShowDoc> {
  const existing = await shows().findOne({ showId });
  if (existing) {
    assertShowOpen(existing);
    return existing;
  }
  const [movieId, theatreId, date] = showId.split("_");
  if (!movieId || !theatreId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new DbError("INVALID_SHOW", "This showtime is no longer available.");
  const dateStamp = new Date(`${date}T00:00:00+05:30`).getTime();
  if (!Number.isFinite(dateStamp) || dateStamp > Date.now() + 31 * 86400_000)
    throw new DbError("INVALID_SHOW", "This showtime is outside the booking window.");
  const theatreDoc = await getTheatre(theatreId);
  const tmdbMatch = /^tmdb(\d+)$/.exec(movieId);
  const detail = tmdbMatch
    ? await (await import("../tmdb.server")).loadDetail(Number(tmdbMatch[1]))
    : null;
  const movie = tmdbMatch ? detail?.movie : MOVIES.find((m) => m.id === movieId);
  if (!movie)
    throw new DbError("INVALID_SHOW", "We could not verify this movie. Please try again.");
  const theatre: Theatre = {
    id: theatreDoc.theatreId,
    name: theatreDoc.name,
    city: theatreDoc.city,
    address: theatreDoc.address,
    rating: theatreDoc.rating,
    distanceKm: theatreDoc.distanceKm ?? 0,
    formats: theatreDoc.formats,
    screens: theatreDoc.screens.map((s) => ({ id: s.screenId, name: s.name, seats: s.seats })),
  };
  const generated = generateShows(movie, theatre, date).find((show) => show.id === showId);
  if (!generated) throw new DbError("INVALID_SHOW", "This showtime is no longer available.");
  // All price, screen, time, format and display fields come from trusted server records.
  return createShow(
    {
      showId,
      movie: {
        tmdbId: movie.tmdbId ?? 0,
        movieId: movie.id,
        title: movie.title,
        posterPath: movie.poster,
        backdropPath: movie.backdrop,
      },
      theatreId,
      screenName: generated.screen,
      date,
      time: generated.time,
      format: generated.format,
      language: movie.language[0] ?? "Hindi",
      price: generated.price,
    },
    { insertOnly: true },
  );
}

/* ------------------------------------------------------------------ seats */

async function seatDoc(showId: string): Promise<ShowSeatsDoc> {
  await ensureBookingIndexes();
  const existing = await showSeats().findOne({ showId });
  if (existing) {
    await showSeats().updateOne({ showId }, { $pull: { holds: { expiresAt: { $lte: now() } } } });
    return { ...existing, holds: (existing.holds ?? []).filter((hold) => hold.expiresAt > now()) };
  }
  const fresh: ShowSeatsDoc = { showId, taken: [], holds: [], updatedAt: now() };
  await showSeats().updateOne(
    { showId },
    { $setOnInsert: { showId, taken: [], holds: [], updatedAt: now() } },
    { upsert: true },
  );
  return fresh;
}

export async function getAvailableSeats(showId: string, hint?: ShowHint) {
  const show = await ensureShow(showId, hint);
  const doc = await seatDoc(showId);
  const t = Date.now();
  const held = (doc.holds ?? [])
    .filter((h) => new Date(h.expiresAt).getTime() > t)
    .map((h) => h.seat);
  const config = show.seatConfig ?? DEFAULT_SEAT_CONFIG;
  const unavailable = [...new Set([...(doc.taken ?? []), ...held])];
  const total = config.rows.length * config.seatsPerRow;
  return {
    show,
    showId,
    price: show.price,
    seatConfig: config,
    unavailable,
    sold: doc.taken ?? [],
    held,
    total,
    available: total - unavailable.length,
  };
}

/** Atomically locks seats for a show. Throws when any seat is already gone. */
export async function reserveSeats(
  showId: string,
  seats: string[],
  opts: { ttlMs?: number; hint?: ShowHint } = {},
): Promise<{ holdRef: string; expiresAt: string }> {
  if (!Array.isArray(seats) || seats.length === 0)
    throw new DbError("VALIDATION", "Select at least one seat.");
  if (seats.length > 10) throw new DbError("VALIDATION", "You can book up to 10 seats at a time.");
  const state = await getAvailableSeats(showId, opts.hint);
  if (!validSeatCodes(seats, state.seatConfig))
    throw new DbError("VALIDATION", "Choose distinct, valid seats from this screen.");
  await ensureBookingIndexes();
  const clash = seats.filter((s) => state.unavailable.includes(s));
  if (clash.length)
    throw new DbError(
      "SEATS_UNAVAILABLE",
      `Seat${clash.length > 1 ? "s" : ""} ${clash.join(", ")} just got taken.`,
    );

  const holdRef = randomId("H");
  const ttl = opts.ttlMs ?? HOLD_TTL_MS;
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > HOLD_TTL_MS)
    throw new DbError("VALIDATION", "The seat hold duration is invalid.");
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  const nowIso = now();
  // Single-document conditional update = no double booking, even under a race.
  const res = await showSeats().updateOne(
    {
      showId,
      taken: { $nin: seats },
      holds: { $not: { $elemMatch: { seat: { $in: seats }, expiresAt: { $gt: nowIso } } } },
    },
    {
      $push: { holds: { $each: seats.map((seat) => ({ seat, ref: holdRef, expiresAt })) } },
      $set: { updatedAt: nowIso },
    },
  );
  if (res.matchedCount === 0)
    throw new DbError("SEATS_UNAVAILABLE", "Those seats were just booked by someone else.");
  return { holdRef, expiresAt };
}

export async function releaseSeats(showId: string, holdRef: string) {
  await showSeats().updateOne(
    { showId },
    { $pull: { holds: { ref: holdRef } }, $set: { updatedAt: now() } },
  );
}

async function commitSeats(showId: string, seats: string[], holdRef?: string) {
  if (!holdRef) throw new DbError("SEATS_UNAVAILABLE", "The seat reservation has expired.");
  const stamp = now();
  const result = await showSeats().updateOne(
    {
      showId,
      taken: { $nin: seats },
      $and: seats.map((seat) => ({
        holds: { $elemMatch: { seat, ref: holdRef, expiresAt: { $gt: stamp } } },
      })),
    },
    {
      $addToSet: { taken: { $each: seats } },
      ...(holdRef ? { $pull: { holds: { ref: holdRef } } } : {}),
      $set: { updatedAt: now() },
    },
  );
  if (result.matchedCount !== 1)
    throw new DbError(
      "SEATS_UNAVAILABLE",
      "Your seat reservation has expired. Please select seats again.",
    );
}

/* --------------------------------------------------------------- bookings */

export type CreateBookingInput = {
  showId: string;
  seats: string[];
  userId?: string | null;
  userEmail?: string;
  offerCode?: string | null;
  paymentMethod?: string;
  idempotencyKey?: string;
  hint?: ShowHint;
  /** Cached TMDB display info so My Bookings renders without a TMDB round-trip. */
  movie?: MovieRef;
};

export function priceBreakdown(seatPrices: number[], offer: OfferDoc | null) {
  const tickets = seatPrices.reduce((a, b) => a + b, 0);
  const fee = seatPrices.length * 25;
  const taxes = Math.round((tickets + fee) * 0.06);
  let discount = 0;
  if (offer && tickets > 0) {
    discount =
      offer.type === "flat"
        ? offer.value
        : Math.min(Math.round((tickets * offer.value) / 100), offer.max ?? Number.MAX_SAFE_INTEGER);
    discount = Math.min(discount, tickets);
  }
  return { tickets, fee, taxes, discount, total: tickets + fee + taxes - discount };
}

export async function createBooking(input: CreateBookingInput): Promise<BookingDoc> {
  if (!input.userId || !input.userEmail)
    throw new DbError("UNAUTHORIZED", "Sign in before creating a booking.");
  const show = await ensureShow(input.showId, input.hint);
  const theatre = await getTheatre(show.theatreId);
  const config = show.seatConfig ?? DEFAULT_SEAT_CONFIG;
  if (!validSeatCodes(input.seats, config))
    throw new DbError("VALIDATION", "Choose distinct, valid seats from this screen.");
  const seats = [...input.seats].sort();
  if (input.idempotencyKey) {
    const previous = await bookings().findOne({
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
    });
    if (previous) {
      if (
        previous.showId !== show.showId ||
        JSON.stringify([...previous.seatCodes].sort()) !== JSON.stringify(seats) ||
        (previous.offerCode ?? null) !== (input.offerCode?.trim().toUpperCase() || null)
      )
        throw new DbError(
          "VALIDATION",
          "This booking request has already been used with different details.",
        );
      if (previous.status === "CANCELLED")
        throw new DbError("BOOKING_CANCELLED", "This reservation is closed. Start a new booking.");
      if (previous.status === "PENDING" && !(await hasActiveHold(previous))) {
        await markRazorpayFailed({ bookingId: previous.bookingId, reason: "HOLD_EXPIRED" });
        throw new DbError("BOOKING_CANCELLED", "This reservation expired. Start a new booking.");
      }
      return previous;
    }
  }

  const dupe = await bookings().findOne({
    showId: show.showId,
    userId: input.userId,
    seatCodes: { $all: seats },
    status: { $ne: "CANCELLED" },
  });
  if (dupe && dupe.seatCodes.length === seats.length) {
    if (dupe.status === "PENDING" && !(await hasActiveHold(dupe))) {
      await markRazorpayFailed({ bookingId: dupe.bookingId, reason: "HOLD_EXPIRED" });
    } else {
      if ((dupe.offerCode ?? null) !== (input.offerCode?.trim().toUpperCase() || null))
        throw new DbError(
          "DUPLICATE_BOOKING",
          "You already have a reservation for these seats with a different offer.",
        );
      return dupe;
    }
  }

  const { holdRef } = await reserveSeats(
    show.showId,
    seats,
    input.hint ? { hint: input.hint } : {},
  );

  try {
    return await withTransaction(async () => {
      const offer = input.offerCode
        ? await offers().findOne({ code: input.offerCode.trim().toUpperCase(), active: true })
        : null;
      if (input.offerCode && !offer)
        throw new DbError("VALIDATION", "This offer is not available.");
      if (
        offer &&
        (!(offer.value > 0) ||
          !Number.isFinite(offer.value) ||
          (offer.type === "percent" && offer.value > 100) ||
          (offer.max !== undefined && (!Number.isFinite(offer.max) || offer.max < 0)))
      )
        throw new DbError("VALIDATION", "This offer is not configured correctly.");
      if (
        offer?.code === "FIRST100" &&
        (await bookings().findOne({ userId: input.userId, status: { $ne: "CANCELLED" } }))
      )
        throw new DbError("VALIDATION", "FIRST100 is available only on your first booking.");
      if (
        offer?.code === "WEEKDAY50" &&
        [0, 6].includes(new Date(`${show.date}T12:00:00+05:30`).getUTCDay())
      )
        throw new DbError("VALIDATION", "WEEKDAY50 is available only for weekday shows.");
      if (offer?.code === "MOVIE10")
        throw new DbError(
          "VALIDATION",
          "The card-specific offer is unavailable until card eligibility is configured.",
        );
      const bookedSeats: BookedSeat[] = seats.map((code) => ({
        code,
        category: categoryForRow(code[0]!, config),
        price: priceForRow(show.price, code[0]!, config),
      }));
      const amount = priceBreakdown(
        bookedSeats.map((s) => s.price),
        offer,
      );
      const bookingId = randomId("CB");
      const movie = show.movie;
      const doc: BookingDoc = {
        bookingId,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        userId: input.userId!,
        userEmail: input.userEmail!.trim().toLowerCase(),
        movie,
        theatreId: theatre.theatreId,
        theatreName: theatre.name,
        address: theatre.address,
        screenId: show.screenId,
        screenName: show.screenName,
        showId: show.showId,
        date: show.date,
        time: show.time,
        format: show.format,
        seats: bookedSeats,
        seatCodes: seats,
        quantity: seats.length,
        amount,
        offerCode: offer?.code ?? null,
        status: "PENDING",
        paymentStatus: "PENDING",
        qr: {
          code: bookingId,
          payload: JSON.stringify({
            id: bookingId,
            show: show.showId,
            seats,
            tmdbId: movie.tmdbId,
            amount: amount.total,
          }),
          issuedAt: now(),
        },
        holdRef,
        createdAt: now(),
        updatedAt: now(),
      };
      await bookings().insertOne(doc);

      const payment: PaymentDoc = {
        paymentId: randomId("PAY"),
        bookingId,
        userId: doc.userId,
        amount: amount.total,
        currency: "INR",
        method: input.paymentMethod ?? "UPI",
        provider: "razorpay",
        status: "PENDING",
        providerOrderId: null,
        providerPaymentId: null,
        providerSignature: null,
        createdAt: now(),
        updatedAt: now(),
      };
      await payments().insertOne(payment);
      await bookings().updateOne({ bookingId }, { $set: { paymentId: payment.paymentId } });
      return { ...doc, paymentId: payment.paymentId };
    });
  } catch (err) {
    await releaseSeats(show.showId, holdRef);
    throw err;
  }
}

/**
 * Marks the mock payment as paid and confirms the booking. The same entry point
 * will later be called after a Razorpay signature check.
 */
export async function confirmBooking(input: {
  bookingId: string;
  paymentStatus?: "PAID" | "FAILED";
  method?: string;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
}): Promise<BookingDoc> {
  throw new DbError("PAYMENT_ERROR", "A verified payment is required to confirm a booking.");
}

export async function getBooking(bookingId: string): Promise<BookingDoc> {
  const doc = await bookings().findOne({ bookingId });
  if (!doc) throw new DbError("INVALID_BOOKING", "We couldn't find that booking.");
  return doc;
}

export async function getUserBookings(query: {
  userId?: string | null;
  email?: string;
  limit?: number;
}): Promise<BookingDoc[]> {
  const filter: Record<string, unknown> = {};
  if (query.userId) filter["userId"] = query.userId;
  else if (query.email) filter["userEmail"] = query.email.toLowerCase();
  else return [];
  return bookings().find(filter, { sort: { createdAt: -1 }, limit: query.limit ?? 100 });
}

export async function cancelBooking(
  bookingId: string,
  actor?: { userId?: string | null; email?: string },
) {
  return withTransaction(async () => {
    const booking = await getBooking(bookingId);
    if (!actor?.userId || booking.userId !== actor.userId)
      throw new DbError("UNAUTHORIZED", "You can only cancel your own bookings.");
    if (booking.status === "CANCELLED") return booking;
    const startsAt = showStartsAt(booking.date, booking.time);
    if (booking.status === "CONFIRMED" && (!startsAt || new Date(startsAt).getTime() <= Date.now()))
      throw new DbError("VALIDATION", "A show that has started cannot be cancelled.");
    const refund = booking.paymentStatus === "PAID";
    if (booking.holdRef) await releaseSeats(booking.showId, booking.holdRef);
    const changed = await bookings().updateOne(
      { bookingId, status: booking.status, paymentStatus: booking.paymentStatus },
      {
        $set: {
          status: "CANCELLED" as BookingStatus,
          paymentStatus: refund ? "REFUND_PENDING" : "FAILED",
          updatedAt: now(),
        },
      },
    );
    if (changed.matchedCount !== 1)
      throw new DbError("VALIDATION", "The booking changed. Please refresh and try again.");
    if (booking.status === "CONFIRMED")
      await showSeats().updateOne(
        { showId: booking.showId },
        { $pull: { taken: { $in: booking.seatCodes } }, $set: { updatedAt: now() } },
      );
    if (booking.paymentId)
      await payments().updateOne(
        { paymentId: booking.paymentId },
        { $set: { status: refund ? "REFUND_PENDING" : "FAILED", updatedAt: now() } },
      );
    return getBooking(bookingId);
  });
}

/* -------------------------------------------------------------- favorites */

export async function getFavorites(userId: string): Promise<FavoriteDoc[]> {
  return favorites().find({ userId }, { sort: { createdAt: -1 }, limit: 300 });
}

export async function addFavorite(input: {
  userId: string;
  tmdbId: number;
  movieId: string;
  title?: string;
  posterPath?: string;
}) {
  await ensureBookingIndexes();
  try {
    await favorites().updateOne(
      { userId: input.userId, tmdbId: input.tmdbId },
      { $set: input, $setOnInsert: { createdAt: now() } },
      { upsert: true },
    );
  } catch (error) {
    // Two concurrent initial upserts can collide on the required compound index.
    if (
      !(error instanceof DbError) ||
      error.code !== "VALIDATION" ||
      !(await favorites().findOne({ userId: input.userId, tmdbId: input.tmdbId }))
    )
      throw error;
  }
  return getFavorites(input.userId);
}

export async function removeFavorite(userId: string, tmdbId: number) {
  await favorites().deleteOne({ userId, tmdbId });
  return getFavorites(userId);
}

/* ----------------------------------------------------------------- offers */

export async function getOffers(): Promise<OfferDoc[]> {
  return offers().find({ active: true }, { limit: 50 });
}

export async function upsertOffer(input: Partial<OfferDoc> & { code: string }) {
  await offers().updateOne(
    { code: input.code.toUpperCase() },
    {
      $set: { ...input, code: input.code.toUpperCase(), updatedAt: now() },
      $setOnInsert: { createdAt: now() },
    },
    { upsert: true },
  );
  return getOffers();
}

/* ------------------------------------------------------------------ admin */

export async function getAdminOverview() {
  return (await import("./admin-analytics.server")).getAdminOverview();
}

/* -------------------------------------------------------------- razorpay */

async function hasActiveHold(booking: BookingDoc): Promise<boolean> {
  if (!booking.holdRef || !booking.seatCodes.length) return false;
  const state = await showSeats().findOne({ showId: booking.showId });
  const stamp = now();
  return (
    !!state &&
    booking.seatCodes.every(
      (seat) =>
        !state.taken.includes(seat) &&
        state.holds.some(
          (h) => h.seat === seat && h.ref === booking.holdRef && h.expiresAt > stamp,
        ),
    )
  );
}

/** A database lease serializes order creation across processes; completed orders are reused. */
export async function claimRazorpayOrder(
  bookingId: string,
): Promise<{ payment: PaymentDoc; claim: string | null }> {
  const booking = await getBooking(bookingId);
  if (booking.status !== "PENDING" || booking.paymentStatus !== "PENDING")
    throw new DbError("PAYMENT_ERROR", "This booking is no longer awaiting payment.");
  if (!(await hasActiveHold(booking)))
    throw new DbError(
      "SEATS_UNAVAILABLE",
      "Your seat reservation expired. Choose your seats again.",
    );
  const payment = await getPaymentForBooking(bookingId);
  if (!payment) throw new DbError("INVALID_BOOKING", "This booking has no payment record.");
  if (payment.providerOrderId) return { payment, claim: null };
  const claim = randomId("ORDER");
  const changed = await payments().updateOne(
    {
      paymentId: payment.paymentId,
      status: "PENDING",
      providerOrderId: null,
      $or: [{ orderClaim: null }, { orderClaimExpiresAt: { $lte: now() } }],
    },
    {
      $set: {
        orderClaim: claim,
        orderClaimExpiresAt: new Date(Date.now() + 30_000).toISOString(),
        updatedAt: now(),
      },
    },
  );
  if (changed.matchedCount !== 1)
    throw new DbError(
      "PAYMENT_ERROR",
      "Payment setup is already in progress. Please try again shortly.",
    );
  return { payment, claim };
}

export async function releaseRazorpayOrderClaim(bookingId: string, claim: string) {
  await payments().updateOne(
    { bookingId, orderClaim: claim },
    { $set: { orderClaim: null, orderClaimExpiresAt: null, updatedAt: now() } },
  );
}

/** Stores the server-created Razorpay order id on the booking's payment row. */
export async function attachRazorpayOrder(input: {
  bookingId: string;
  orderId: string;
  amount: number;
  claim: string;
}) {
  return withTransaction(async () => {
    const booking = await getBooking(input.bookingId);
    if (booking.status !== "PENDING" || !(await hasActiveHold(booking)))
      throw new DbError("BOOKING_CANCELLED", "This booking was cancelled.");
    if (input.amount !== booking.amount.total)
      throw new DbError("PAYMENT_ERROR", "Payment amount does not match the booking.");
    const paymentId = booking.paymentId;
    if (!paymentId) throw new DbError("INVALID_BOOKING", "This booking has no payment record.");
    const changed = await payments().updateOne(
      { paymentId, orderClaim: input.claim, status: "PENDING", providerOrderId: null },
      {
        $set: {
          provider: "razorpay",
          method: "Razorpay",
          status: "PENDING",
          providerOrderId: input.orderId,
          orderClaim: null,
          orderClaimExpiresAt: null,
          updatedAt: now(),
        },
      },
    );
    if (changed.matchedCount !== 1)
      throw new DbError(
        "PAYMENT_ERROR",
        "Payment order creation conflicted. Please refresh the booking.",
      );
    return { paymentId };
  });
}

export async function getPaymentForBooking(bookingId: string): Promise<PaymentDoc | null> {
  return payments().findOne({ bookingId });
}

/**
 * Idempotently confirms a booking after a verified Razorpay signature.
 * Repeating the success callback returns the already-confirmed booking.
 */
export async function markRazorpayPaid(input: {
  bookingId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<BookingDoc> {
  const result = await withTransaction(async () => {
    const booking = await getBooking(input.bookingId);
    const payment = await payments().findOne({ bookingId: booking.bookingId });
    if (!payment?.providerOrderId)
      throw new DbError("PAYMENT_ERROR", "No payment order found for this booking.");
    if (payment.providerOrderId !== input.razorpayOrderId)
      throw new DbError("PAYMENT_ERROR", "Payment order mismatch.");
    if (payment.currency !== "INR" || payment.amount !== booking.amount.total)
      throw new DbError("PAYMENT_ERROR", "Payment amount does not match the booking.");
    if (payment.providerPaymentId && payment.providerPaymentId !== input.razorpayPaymentId)
      throw new DbError("PAYMENT_ERROR", "A different payment has already been processed.");
    if (booking.status === "CONFIRMED" && booking.paymentStatus === "PAID")
      return { booking, expired: false };
    const pendingRefund = async () => {
      await bookings().updateOne(
        { bookingId: booking.bookingId },
        { $set: { status: "CANCELLED", paymentStatus: "REFUND_PENDING", updatedAt: now() } },
      );
      await payments().updateOne(
        { paymentId: payment.paymentId },
        {
          $set: {
            status: "REFUND_PENDING",
            providerPaymentId: input.razorpayPaymentId,
            updatedAt: now(),
          },
        },
      );
      if (booking.holdRef) await releaseSeats(booking.showId, booking.holdRef);
      return { booking: await getBooking(booking.bookingId), expired: true };
    };
    if (booking.status === "CANCELLED" || !(await hasActiveHold(booking))) return pendingRefund();

    // Seats become permanent only now, after verification.
    try {
      await commitSeats(booking.showId, booking.seatCodes, booking.holdRef);
    } catch (error) {
      if (error instanceof DbError && error.code === "SEATS_UNAVAILABLE") return pendingRefund();
      throw error;
    }
    const changed = await bookings().updateOne(
      { bookingId: booking.bookingId, status: "PENDING", paymentStatus: "PENDING" },
      { $set: { status: "CONFIRMED", paymentStatus: "PAID", updatedAt: now() } },
    );
    if (changed.matchedCount !== 1)
      throw new DbError("PAYMENT_ERROR", "This booking changed during payment verification.");
    await payments().updateOne(
      { paymentId: payment.paymentId },
      {
        $set: {
          status: "PAID",
          provider: "razorpay",
          providerPaymentId: input.razorpayPaymentId,
          providerSignature: input.razorpaySignature,
          updatedAt: now(),
        },
      },
    );
    return { booking: await getBooking(booking.bookingId), expired: false };
  });
  if (result.expired)
    throw new DbError(
      "PAYMENT_ERROR",
      "Payment could not be applied to the reservation. A refund requires review.",
    );
  return result.booking;
}

/** Payment cancelled, failed or failed verification — release the seat hold. */
export async function markRazorpayFailed(input: {
  bookingId: string;
  reason?: string;
  razorpayPaymentId?: string | null;
}): Promise<BookingDoc> {
  return withTransaction(async () => {
    const booking = await getBooking(input.bookingId);
    if (booking.status !== "PENDING") return booking; // never undo a paid or cancelled booking
    if (booking.holdRef) await releaseSeats(booking.showId, booking.holdRef);
    await bookings().updateOne(
      { bookingId: booking.bookingId, status: "PENDING", paymentStatus: "PENDING" },
      { $set: { status: "CANCELLED", paymentStatus: "FAILED", updatedAt: now() } },
    );
    await payments().updateOne(
      { bookingId: booking.bookingId },
      {
        $set: {
          status: "FAILED",
          updatedAt: now(),
        },
      },
    );
    return getBooking(booking.bookingId);
  });
}
