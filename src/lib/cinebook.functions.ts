/** CineBook server boundary: validate inputs and derive all ownership from the session. */
import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import type { Format, MovieRef, BookingDoc } from "./db/models";

const id = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_.:-]+$/, "Invalid identifier.");
const text = z.string().trim().min(1).max(200);
const email = z.string().trim().toLowerCase().email().max(254);
const phone = z
  .string()
  .trim()
  .max(25)
  .regex(/^[+\d\s()-]*$/, "Enter a valid phone number.");
const movieRef = z.object({
  tmdbId: z.number().int().nonnegative(),
  movieId: id.optional(),
  title: text.optional(),
  posterPath: z.string().max(1000).optional(),
  backdropPath: z.string().max(1000).optional(),
});
const format = z.enum(["2D", "3D", "IMAX", "4DX"]);
const hintSchema = z.object({
  movie: movieRef,
  theatreId: id,
  screenName: text,
  screenId: id.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: text,
  format,
  language: text.optional(),
  price: z.number().finite().nonnegative().max(100000),
});
type ShowHintInput = {
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
const bookingKey = z.object({ bookingId: id });
type Defined<T> = T extends (infer U)[]
  ? Defined<U>[]
  : T extends object
    ? { [K in keyof T]: Defined<Exclude<T[K], undefined>> }
    : T;
// Zod optional fields include undefined; repositories expect omitted keys, including nested hints.
function defined<T>(value: T): Defined<T> {
  return value === undefined
    ? (value as Defined<T>)
    : (JSON.parse(JSON.stringify(value)) as Defined<T>);
}
async function repo() {
  return import("./db/repositories.server");
}
async function auth() {
  return import("./auth.server");
}
async function user() {
  return (await auth()).requireUser();
}
async function admin() {
  return (await auth()).requireAdmin();
}
async function reject(
  code: "FORBIDDEN" | "PAYMENT_ERROR" | "VALIDATION",
  message: string,
): Promise<never> {
  const { DbError } = await import("./db/mongo.server");
  throw new DbError(code, message);
}
async function fail(error: unknown): Promise<never> {
  const { toClientError } = await import("./db/mongo.server");
  const { code, message } = toClientError(error);
  setResponseStatus(
    code === "AUTH_REQUIRED"
      ? 401
      : code === "FORBIDDEN" || code === "UNAUTHORIZED"
        ? 403
        : code === "RATE_LIMITED"
          ? 429
          : code === "VALIDATION"
            ? 400
            : code === "DB_UNAVAILABLE" || code === "DB_NOT_CONFIGURED"
              ? 503
              : code === "INTERNAL_ERROR"
                ? 500
                : 409,
  );
  throw new Error(`${code}: ${message}`);
}
async function handle<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    return fail(error);
  }
}
async function ownedBooking(bookingId: string) {
  const actor = await user();
  const booking = await (await repo()).getBooking(bookingId);
  if (!booking.userId || booking.userId !== actor.userId)
    await reject("FORBIDDEN", "You can only access your own bookings.");
  return booking;
}
function ticketSafe(booking: BookingDoc): BookingDoc {
  return booking.status === "CONFIRMED" && booking.paymentStatus === "PAID"
    ? booking
    : { ...booking, qr: { code: "", payload: "", issuedAt: "" } };
}
export const getDbStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { isDbConfigured, getTheatres } = await repo();
  if (!isDbConfigured()) return { configured: false, reachable: false, theatres: 0 };
  try {
    const theatres = await getTheatres();
    return { configured: true, reachable: true, theatres: theatres.length };
  } catch {
    return { configured: true, reachable: false, theatres: 0 };
  }
});
export const getCurrentUser = createServerFn({ method: "GET" }).handler(() =>
  handle(async () => (await auth()).currentUser()),
);
export const signOut = createServerFn({ method: "POST" }).handler(() =>
  handle(async () => {
    await (await auth()).endSession();
    return { ok: true };
  }),
);
export const getAdminAccess = createServerFn({ method: "GET" }).handler(() =>
  handle(async () => {
    const service = await auth();
    const actor = await service.currentUser();
    return Boolean(actor && service.isAdministrator(actor));
  }),
);
export const signUp = createServerFn({ method: "POST" })
  .validator(
    (data: { name: string; email: string; phone?: string; password: string; city?: string }) =>
      data,
  )
  .handler(({ data }) =>
    handle(async () => {
      const input = z
        .object({
          name: text,
          email,
          phone: phone.optional(),
          password: z.string().min(8).max(128),
          city: text.optional(),
        })
        .parse(data);
      const service = await auth();
      service.limitAuthentication(input.email);
      return service.beginSession(await (await repo()).createUser(defined(input)));
    }),
  );
export const signIn = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(({ data }) =>
    handle(async () => {
      const input = z.object({ email, password: z.string().min(1).max(128) }).parse(data);
      const service = await auth();
      service.limitAuthentication(input.email);
      const actor = await (await repo()).verifyUser(input.email, input.password);
      if (!actor) {
        const { DbError } = await import("./db/mongo.server");
        throw new DbError("UNAUTHORIZED", "Invalid email or password.");
      }
      return service.beginSession(actor);
    }),
  );
export const getUserProfile = createServerFn({ method: "POST" })
  .validator((data: { userId?: string; email?: string } | undefined) => data ?? {})
  .handler(() => handle(user));
export const updateUserProfile = createServerFn({ method: "POST" })
  .validator((data: { name?: string; phone?: string; city?: string; userId?: string }) => data)
  .handler(({ data }) =>
    handle(async () => {
      const actor = await user();
      const patch = z
        .object({ name: text.optional(), phone: phone.optional(), city: text.optional() })
        .parse(data);
      return (await repo()).updateUser(actor.userId, defined(patch));
    }),
  );
export const getTheatres = createServerFn({ method: "GET" })
  .validator((data: { city?: string } | undefined) => data ?? {})
  .handler(({ data }) =>
    handle(async () =>
      (await repo()).getTheatres(z.object({ city: text.optional() }).parse(data).city),
    ),
  );
export const saveTheatre = createServerFn({ method: "POST" })
  .validator((data: Record<string, unknown> & { theatreId: string }) => data)
  .handler(({ data }) =>
    handle(async () => {
      await admin();
      const input = z
        .object({
          theatreId: id,
          name: text,
          city: text,
          address: z.string().trim().min(1).max(500),
          rating: z.number().min(0).max(5),
          distanceKm: z.number().nonnegative().optional(),
          formats: z.array(format).min(1),
          amenities: z.array(text).max(25),
          screens: z
            .array(
              z.object({ screenId: id, name: text, seats: z.number().int().positive().max(1000) }),
            )
            .max(50),
          active: z.boolean(),
        })
        .parse(data);
      return (await repo()).upsertTheatre(defined(input));
    }),
  );
export const getScreens = createServerFn({ method: "POST" })
  .validator((data: { theatreId?: string }) => data)
  .handler(({ data }) =>
    handle(async () =>
      (await repo()).getScreens(z.object({ theatreId: id.optional() }).parse(data).theatreId),
    ),
  );
export const getShows = createServerFn({ method: "POST" })
  .validator(
    (data: { movieId?: string; tmdbId?: number; theatreId?: string; date?: string }) => data,
  )
  .handler(({ data }) =>
    handle(async () =>
      (await repo()).getShows(
        defined(
          z
            .object({
              movieId: id.optional(),
              tmdbId: z.number().int().positive().optional(),
              theatreId: id.optional(),
              date: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .optional(),
            })
            .parse(data),
        ),
      ),
    ),
  );
export const getShow = createServerFn({ method: "POST" })
  .validator((data: { showId: string; hint?: ShowHintInput }) => data)
  .handler(({ data }) =>
    handle(async () => {
      const input = z.object({ showId: id, hint: hintSchema.optional() }).parse(data);
      return (await repo()).ensureShow(input.showId, defined(input.hint));
    }),
  );
export const createShow = createServerFn({ method: "POST" })
  .validator((data: ShowHintInput & { showId?: string }) => data)
  .handler(({ data }) =>
    handle(async () => {
      await admin();
      return (await repo()).createShow(
        defined(hintSchema.extend({ showId: id.optional() }).parse(data)),
      );
    }),
  );
export const getAvailableSeats = createServerFn({ method: "POST" })
  .validator((data: { showId: string; hint?: ShowHintInput }) => data)
  .handler(({ data }) =>
    handle(async () => {
      const input = z.object({ showId: id, hint: hintSchema.optional() }).parse(data);
      return (await repo()).getAvailableSeats(input.showId, defined(input.hint));
    }),
  );
// Checkout owns holds; these old endpoints cannot independently establish ownership.
export const reserveSeats = createServerFn({ method: "POST" })
  .validator((data: { showId: string; seats: string[]; hint?: ShowHintInput }) => data)
  .handler(() =>
    handle(async () => {
      await user();
      return reject("FORBIDDEN", "Start checkout to reserve seats.");
    }),
  );
export const releaseSeats = createServerFn({ method: "POST" })
  .validator((data: { showId: string; holdRef: string }) => data)
  .handler(() =>
    handle(async () => {
      await user();
      return reject("FORBIDDEN", "Cancel your booking to release its seats.");
    }),
  );
export const createBooking = createServerFn({ method: "POST" })
  .validator(
    (data: {
      showId: string;
      seats: string[];
      userId?: string | null;
      userEmail?: string;
      offerCode?: string | null;
      paymentMethod?: string;
      movie?: MovieRef;
      hint?: ShowHintInput;
      idempotencyKey?: string;
    }) => data,
  )
  .handler(({ data }) =>
    handle(async () => {
      const actor = await user();
      const input = z
        .object({
          showId: id,
          seats: z
            .array(z.string().regex(/^[A-Z]+[1-9]\d{0,2}$/))
            .min(1)
            .max(10)
            .refine((seats) => new Set(seats).size === seats.length, "Choose each seat only once."),
          offerCode: z.string().trim().min(1).max(40).nullable().optional(),
          paymentMethod: text.optional(),
          hint: hintSchema.optional(),
          idempotencyKey: id.optional(),
        })
        .parse(data);
      return ticketSafe(
        await (
          await repo()
        ).createBooking(defined({ ...input, userId: actor.userId, userEmail: actor.email })),
      );
    }),
  );
export const confirmBooking = createServerFn({ method: "POST" })
  .validator(
    (data: { bookingId: string; paymentStatus?: "PAID" | "FAILED"; method?: string }) => data,
  )
  .handler(() =>
    handle(async () => {
      await user();
      return reject("FORBIDDEN", "Bookings are confirmed only after gateway verification.");
    }),
  );
export const getBooking = createServerFn({ method: "POST" })
  .validator((data: { bookingId: string }) => data)
  .handler(({ data }) =>
    handle(async () => ticketSafe(await ownedBooking(bookingKey.parse(data).bookingId))),
  );
export const getUserBookings = createServerFn({ method: "GET" }).handler(() =>
  handle(async () => {
    const actor = await user();
    return (await (await repo()).getUserBookings({ userId: actor.userId })).map(ticketSafe);
  }),
);
export const cancelBooking = createServerFn({ method: "POST" })
  .validator((data: { bookingId: string; userId?: string | null; email?: string }) => data)
  .handler(({ data }) =>
    handle(async () => {
      const actor = await user();
      const { bookingId } = bookingKey.parse(data);
      await ownedBooking(bookingId);
      return ticketSafe(
        await (await repo()).cancelBooking(bookingId, { userId: actor.userId, email: actor.email }),
      );
    }),
  );
export const getFavorites = createServerFn({ method: "GET" }).handler(() =>
  handle(async () => {
    const actor = await user();
    return (await repo()).getFavorites(actor.userId);
  }),
);
export const addFavorite = createServerFn({ method: "POST" })
  .validator(
    (data: { tmdbId: number; movieId: string; title?: string; posterPath?: string }) => data,
  )
  .handler(({ data }) =>
    handle(async () => {
      const actor = await user();
      const input = z
        .object({
          tmdbId: z.number().int().positive(),
          movieId: id,
          title: text.optional(),
          posterPath: z.string().max(1000).optional(),
        })
        .parse(data);
      if (input.movieId !== `tmdb${input.tmdbId}`)
        return reject("VALIDATION", "Movie identifiers do not match.");
      return (await repo()).addFavorite(defined({ ...input, userId: actor.userId }));
    }),
  );
export const removeFavorite = createServerFn({ method: "POST" })
  .validator((data: { tmdbId: number }) => data)
  .handler(({ data }) =>
    handle(async () => {
      const actor = await user();
      const input = z.object({ tmdbId: z.number().int().positive() }).parse(data);
      return (await repo()).removeFavorite(actor.userId, input.tmdbId);
    }),
  );
export const getOffers = createServerFn({ method: "GET" }).handler(() =>
  handle(async () => (await repo()).getOffers()),
);
export const saveOffer = createServerFn({ method: "POST" })
  .validator((data: Record<string, unknown> & { code: string }) => data)
  .handler(({ data }) =>
    handle(async () => {
      await admin();
      const input = z
        .object({
          code: z
            .string()
            .trim()
            .min(1)
            .max(40)
            .regex(/^[\w-]+$/)
            .transform((value) => value.toUpperCase()),
          title: text,
          description: z.string().max(1000),
          type: z.enum(["flat", "percent"]),
          value: z.number().finite().positive().max(100000),
          max: z.number().finite().nonnegative().optional(),
          icon: text,
          active: z.boolean(),
        })
        .refine(
          (offer) => offer.type !== "percent" || offer.value <= 100,
          "Percentage discount cannot exceed 100.",
        )
        .parse(data);
      return (await repo()).upsertOffer(defined(input));
    }),
  );
export const getAdminOverview = createServerFn({ method: "GET" }).handler(() =>
  handle(async () => {
    await admin();
    return (await repo()).getAdminOverview();
  }),
);
export const getPaymentConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { isRazorpayConfigured, getKeyId } = await import("./razorpay.server");
  return { enabled: isRazorpayConfigured(), keyId: isRazorpayConfigured() ? getKeyId() : null };
});
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .validator((data: { bookingId: string }) => data)
  .handler(({ data }) =>
    handle(async () => {
      const booking = await ownedBooking(bookingKey.parse(data).bookingId);
      const db = await repo();
      const gateway = await import("./razorpay.server");
      if (booking.status === "CANCELLED")
        return reject("PAYMENT_ERROR", "This booking was cancelled.");
      const keyId = gateway.getKeyId();
      if (booking.status === "CONFIRMED" && booking.paymentStatus === "PAID")
        return {
          alreadyPaid: true as const,
          keyId,
          orderId: "",
          amount: booking.amount.total * 100,
          currency: "INR",
          bookingId: booking.bookingId,
        };
      const { payment, claim } = await db.claimRazorpayOrder(booking.bookingId);
      let orderId = payment.providerOrderId ?? "";
      if (claim) {
        try {
          const order = await gateway.createOrder({
            amountInRupees: booking.amount.total,
            receipt: booking.bookingId,
            notes: { bookingId: booking.bookingId, showId: booking.showId },
          });
          if (order.amount !== Math.round(booking.amount.total * 100) || order.currency !== "INR")
            await reject("PAYMENT_ERROR", "The gateway order does not match this booking.");
          await db.attachRazorpayOrder({
            bookingId: booking.bookingId,
            orderId: order.id,
            amount: booking.amount.total,
            claim,
          });
          orderId = order.id;
        } catch (error) {
          await db.releaseRazorpayOrderClaim(booking.bookingId, claim);
          throw error;
        }
      }
      return {
        alreadyPaid: false as const,
        keyId,
        orderId,
        amount: Math.round(booking.amount.total * 100),
        currency: "INR",
        bookingId: booking.bookingId,
      };
    }),
  );
export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .validator(
    (data: {
      bookingId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }) => data,
  )
  .handler(({ data }) =>
    handle(async () => {
      const input = bookingKey
        .extend({
          razorpayOrderId: id,
          razorpayPaymentId: id,
          razorpaySignature: z.string().regex(/^[a-fA-F0-9]{64}$/),
        })
        .parse(data);
      const booking = await ownedBooking(input.bookingId);
      const db = await repo();
      const payment = await db.getPaymentForBooking(booking.bookingId);
      if (!payment?.providerOrderId || payment.providerOrderId !== input.razorpayOrderId)
        return reject("PAYMENT_ERROR", "This payment order does not belong to the booking.");
      const gateway = await import("./razorpay.server");
      const verified = await gateway.verifySignature({
        orderId: payment.providerOrderId,
        paymentId: input.razorpayPaymentId,
        signature: input.razorpaySignature,
      });
      if (!verified) return { verified: false as const, booking: null };
      await gateway.fetchCapturedPayment({
        paymentId: input.razorpayPaymentId,
        orderId: payment.providerOrderId,
        amountInRupees: booking.amount.total,
      });
      return { verified: true as const, booking: ticketSafe(await db.markRazorpayPaid(input)) };
    }),
  );
export const failRazorpayPayment = createServerFn({ method: "POST" })
  .validator(
    (data: { bookingId: string; reason?: string; razorpayPaymentId?: string | null }) => data,
  )
  .handler(({ data }) =>
    handle(async () => {
      const input = bookingKey.extend({ reason: z.string().max(200).optional() }).parse(data);
      await ownedBooking(input.bookingId);
      await (await repo()).markRazorpayFailed(defined(input));
      return { ok: true as const };
    }),
  );
export const seedDatabase = createServerFn({ method: "POST" })
  .validator(
    (data: { tmdbIds?: number[]; force?: boolean; token?: string } | undefined) => data ?? {},
  )
  .handler(({ data }) =>
    handle(async () => {
      await admin();
      const input = z
        .object({
          tmdbIds: z.array(z.number().int().positive()).max(50).optional(),
          force: z.boolean().optional(),
          token: z.string().max(500).optional(),
        })
        .parse(data);
      const expected = process.env["CINEBOOK_SEED_TOKEN"];
      if (!expected || input.token !== expected)
        return reject("FORBIDDEN", "The seed token is not configured or is incorrect.");
      const { token: _token, ...options } = input;
      return {
        ok: true as const,
        result: await (await import("./db/seed.server")).seedDatabase(defined(options)),
      };
    }),
  );
export const createStandaloneRazorpayOrder = createServerFn({ method: "POST" })
  .validator((data: { amount: number; receipt: string }) => data)
  .handler(() =>
    handle(async () => {
      await user();
      return reject("FORBIDDEN", "Payments require a persisted, owned booking.");
    }),
  );
export const verifyStandaloneRazorpayPayment = createServerFn({ method: "POST" })
  .validator(
    (data: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
      data,
  )
  .handler(() =>
    handle(async () => {
      await user();
      return reject("FORBIDDEN", "Payments require a persisted, owned booking.");
    }),
  );
