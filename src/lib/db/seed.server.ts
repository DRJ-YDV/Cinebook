/**
 * Safe development seeding: CineBook theatres, screens, seat configuration,
 * a handful of showtimes and the offer catalog.
 *
 * No TMDB movie metadata is seeded — shows reference movies by `tmdbId` only,
 * and demo shows are only created for tmdbIds the caller passes in.
 */

import { THEATRES, OFFERS } from "@/data/catalog";
import { COLLECTIONS } from "./models";
import { collection } from "./mongo.server";
import { DEFAULT_SEAT_CONFIG, type Format } from "./models";
import { showStartsAt } from "../booking-rules";
import {
  createShow,
  getTheatres,
  isDbConfigured,
  upsertOffer,
  upsertScreen,
  upsertTheatre,
} from "./repositories.server";

const AMENITIES = ["Dolby Atmos", "Recliners", "Parking", "Food Court", "Wheelchair Access"];
const TIMES = ["10:30 AM", "01:15 PM", "06:15 PM", "09:00 PM"];

function dateKey(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Unique/lookup indexes. Uniqueness on shows + bookings is what makes
 * server-side seat availability safe under concurrency. */
export async function ensureIndexes() {
  const c = (name: string) => collection<Record<string, unknown>>(name);
  await Promise.all([
    c(COLLECTIONS.users).ensureIndex({ email: 1 }, { unique: true }),
    c(COLLECTIONS.users).ensureIndex({ userId: 1 }, { unique: true }),
    c(COLLECTIONS.theatres).ensureIndex({ theatreId: 1 }, { unique: true }),
    c(COLLECTIONS.theatres).ensureIndex({ city: 1 }),
    c(COLLECTIONS.screens).ensureIndex({ screenId: 1 }, { unique: true }),
    c(COLLECTIONS.shows).ensureIndex({ showId: 1 }, { unique: true }),
    c(COLLECTIONS.shows).ensureIndex({ "movie.tmdbId": 1, date: 1, theatreId: 1 }),
    c(COLLECTIONS.showSeats).ensureIndex({ showId: 1 }, { unique: true }),
    c(COLLECTIONS.bookings).ensureIndex({ bookingId: 1 }, { unique: true }),
    c(COLLECTIONS.bookings).ensureIndex({ userId: 1, createdAt: -1 }),
    c(COLLECTIONS.bookings).ensureIndex({ showId: 1 }),
    c(COLLECTIONS.bookings).ensureIndex(
      { userId: 1, idempotencyKey: 1 },
      { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
    ),
    c(COLLECTIONS.bookings).ensureIndex(
      { userId: 1, offerCode: 1 },
      {
        unique: true,
        partialFilterExpression: {
          offerCode: "FIRST100",
          status: { $in: ["PENDING", "CONFIRMED"] },
        },
      },
    ),
    c(COLLECTIONS.payments).ensureIndex({ paymentId: 1 }, { unique: true }),
    c(COLLECTIONS.payments).ensureIndex({ bookingId: 1 }, { unique: true }),
    c(COLLECTIONS.payments).ensureIndex(
      { providerOrderId: 1 },
      { unique: true, partialFilterExpression: { providerOrderId: { $type: "string" } } },
    ),
    c(COLLECTIONS.payments).ensureIndex(
      { providerPaymentId: 1 },
      { unique: true, partialFilterExpression: { providerPaymentId: { $type: "string" } } },
    ),
    c(COLLECTIONS.favorites).ensureIndex({ userId: 1, tmdbId: 1 }, { unique: true }),
    c(COLLECTIONS.offers).ensureIndex({ code: 1 }, { unique: true }),
  ]);
}

export async function seedDatabase(opts: { tmdbIds?: number[]; force?: boolean } = {}) {
  if (!isDbConfigured()) throw new Error("MongoDB is not configured.");

  await ensureIndexes();

  const existing = await getTheatres();
  const seeded: string[] = [];

  if (existing.length === 0 || opts.force) {
    for (const [i, t] of THEATRES.entries()) {
      await upsertTheatre({
        theatreId: t.id,
        name: t.name,
        city: t.city,
        address: t.address,
        rating: t.rating,
        distanceKm: t.distanceKm,
        formats: t.formats as Format[],
        amenities: AMENITIES.slice(0, 3 + (i % 3)),
        screens: t.screens.map((s) => ({ screenId: s.id, name: s.name, seats: s.seats })),
        active: true,
      });
      for (const s of t.screens) {
        await upsertScreen({
          screenId: s.id,
          theatreId: t.id,
          name: s.name,
          seats: s.seats,
          formats: t.formats as Format[],
          seatConfig: DEFAULT_SEAT_CONFIG,
        });
      }
      seeded.push(t.id);
    }
  }

  for (const o of OFFERS) {
    await upsertOffer({
      code: o.code,
      title: o.title,
      description: o.description,
      type: o.type,
      value: o.value,
      ...("max" in o ? { max: o.max as number } : {}),
      icon: o.icon,
      active: true,
    });
  }

  let showCount = 0;
  for (const tmdbId of opts.tmdbIds ?? []) {
    for (const theatre of THEATRES.slice(0, 3)) {
      for (const offset of [0, 1]) {
        for (const [i, time] of TIMES.entries()) {
          const startsAt = showStartsAt(dateKey(offset), time);
          if (!startsAt || new Date(startsAt).getTime() <= Date.now()) continue;
          await createShow({
            movie: { tmdbId, movieId: `tmdb${tmdbId}` },
            theatreId: theatre.id,
            screenName: theatre.screens[i % theatre.screens.length]!.name,
            screenId: theatre.screens[i % theatre.screens.length]!.id,
            date: dateKey(offset),
            time,
            format: (theatre.formats[0] ?? "2D") as Format,
            language: "Hindi",
            price: 180 + i * 20,
          });
          showCount++;
        }
      }
    }
  }

  return { theatres: seeded.length || existing.length, offers: OFFERS.length, shows: showCount };
}
