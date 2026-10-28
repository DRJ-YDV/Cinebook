import { collection } from "./mongo.server";
import { COLLECTIONS, type BookingDoc } from "./models";
import type { AdminOverview } from "../admin-types";

const paidMatch = { status: "CONFIRMED", paymentStatus: "PAID" };
const paid = { $and: [{ $eq: ["$status", "CONFIRMED"] }, { $eq: ["$paymentStatus", "PAID"] }] };
const sumWhen = (condition: object, value: string | number = 1) => ({
  $sum: { $cond: [condition, value, 0] },
});

type Aggregated = {
  summary: Omit<AdminOverview["kpis"], "customers" | "avgBookingValue">[];
  customers: { count: number }[];
  dailyRevenue: { _id: string; revenue: number; bookings: number; seats: number }[];
  topMovies: {
    _id: number | null;
    title?: string;
    seats: number;
    revenue: number;
    bookings: number;
  }[];
  topCustomers: { _id: string; email: string; seats: number; revenue: number; bookings: number }[];
  recent: BookingDoc[];
};

/** Database-side totals cover all history; only detail lists have display limits. */
export async function getAdminOverview(): Promise<AdminOverview> {
  const dayMs = 86_400_000;
  const indiaToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const calendarToday = Date.parse(`${indiaToday}T00:00:00Z`);
  const dates = Array.from({ length: 14 }, (_, index) =>
    new Date(calendarToday - (13 - index) * dayMs).toISOString().slice(0, 10),
  );
  const since = new Date(`${dates[0]}T00:00:00+05:30`);
  const count = (name: string, filter = {}) => collection(name).countDocuments(filter);
  const [results, registeredUsers, theatreCount, screenCount, showCount, offerCount] =
    await Promise.all([
      collection<BookingDoc>(COLLECTIONS.bookings).aggregate<Aggregated>([
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  revenue: sumWhen(paid, "$amount.total"),
                  bookings: sumWhen(paid),
                  seatsSold: sumWhen(paid, "$quantity"),
                  unlinkedBookings: sumWhen({
                    $and: [paid, { $eq: [{ $ifNull: ["$userId", ""] }, ""] }],
                  }),
                  totalBookings: { $sum: 1 },
                  pending: sumWhen({
                    $and: [{ $eq: ["$status", "PENDING"] }, { $eq: ["$paymentStatus", "PENDING"] }],
                  }),
                  cancelled: sumWhen({ $eq: ["$status", "CANCELLED"] }),
                  failed: sumWhen({ $eq: ["$paymentStatus", "FAILED"] }),
                  refundPending: sumWhen({ $eq: ["$paymentStatus", "REFUND_PENDING"] }),
                  refundPendingAmount: sumWhen(
                    { $eq: ["$paymentStatus", "REFUND_PENDING"] },
                    "$amount.total",
                  ),
                },
              },
            ],
            customers: [
              { $match: { ...paidMatch, userId: { $type: "string", $ne: "" } } },
              { $group: { _id: "$userId" } },
              { $count: "count" },
            ],
            dailyRevenue: [
              { $match: paidMatch },
              {
                $addFields: {
                  bookedAt: {
                    $convert: { input: "$createdAt", to: "date", onError: null, onNull: null },
                  },
                },
              },
              { $match: { bookedAt: { $gte: since } } },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      date: "$bookedAt",
                      format: "%Y-%m-%d",
                      timezone: "Asia/Kolkata",
                    },
                  },
                  revenue: { $sum: "$amount.total" },
                  bookings: { $sum: 1 },
                  seats: { $sum: "$quantity" },
                },
              },
              { $sort: { _id: 1 } },
            ],
            topMovies: [
              { $match: paidMatch },
              {
                $group: {
                  _id: "$movie.tmdbId",
                  title: { $first: "$movie.title" },
                  revenue: { $sum: "$amount.total" },
                  seats: { $sum: "$quantity" },
                  bookings: { $sum: 1 },
                },
              },
              { $sort: { revenue: -1, _id: 1 } },
              { $limit: 6 },
            ],
            topCustomers: [
              { $match: { ...paidMatch, userId: { $type: "string", $ne: "" } } },
              {
                $group: {
                  _id: "$userId",
                  email: { $first: "$userEmail" },
                  revenue: { $sum: "$amount.total" },
                  seats: { $sum: "$quantity" },
                  bookings: { $sum: 1 },
                },
              },
              { $sort: { revenue: -1, _id: 1 } },
              { $limit: 6 },
            ],
            recent: [
              { $sort: { createdAt: -1, bookingId: -1 } },
              { $limit: 20 },
              {
                $project: {
                  _id: 0,
                  bookingId: 1,
                  userEmail: 1,
                  userId: 1,
                  movie: 1,
                  theatreName: 1,
                  seatCodes: 1,
                  quantity: 1,
                  amount: 1,
                  status: 1,
                  paymentStatus: 1,
                  createdAt: 1,
                },
              },
            ],
          },
        },
      ]),
      count(COLLECTIONS.users),
      count(COLLECTIONS.theatres, { active: true }),
      count(COLLECTIONS.screens),
      count(COLLECTIONS.shows, { active: true }),
      count(COLLECTIONS.offers, { active: true }),
    ]);
  const data = results[0];
  const totals = data?.summary[0];
  const revenue = totals?.revenue ?? 0;
  const paidBookings = totals?.bookings ?? 0;
  const byDate = new Map(data?.dailyRevenue.map((row) => [row._id, row]));
  return {
    generatedAt: new Date().toISOString(),
    kpis: {
      revenue,
      bookings: paidBookings,
      seatsSold: totals?.seatsSold ?? 0,
      customers: data?.customers[0]?.count ?? 0,
      unlinkedBookings: totals?.unlinkedBookings ?? 0,
      avgBookingValue: paidBookings ? Math.round(revenue / paidBookings) : 0,
      totalBookings: totals?.totalBookings ?? 0,
      pending: totals?.pending ?? 0,
      cancelled: totals?.cancelled ?? 0,
      failed: totals?.failed ?? 0,
      refundPending: totals?.refundPending ?? 0,
      refundPendingAmount: totals?.refundPendingAmount ?? 0,
    },
    counts: {
      users: registeredUsers,
      theatres: theatreCount,
      screens: screenCount,
      shows: showCount,
      offers: offerCount,
    },
    dailyRevenue: dates.map((date) => ({
      date,
      revenue: byDate.get(date)?.revenue ?? 0,
      bookings: byDate.get(date)?.bookings ?? 0,
      seats: byDate.get(date)?.seats ?? 0,
    })),
    topMovies: (data?.topMovies ?? []).map((row) => ({
      movieId: String(row._id ?? "unknown"),
      title: row.title || (row._id ? `TMDB #${row._id}` : "Unknown movie"),
      seats: row.seats,
      revenue: row.revenue,
      bookings: row.bookings,
    })),
    topCustomers: (data?.topCustomers ?? []).map((row) => ({
      userId: row._id,
      email: row.email,
      seats: row.seats,
      revenue: row.revenue,
      bookings: row.bookings,
    })),
    recent: (data?.recent ?? []).map((booking) => ({
      bookingId: booking.bookingId,
      userEmail: booking.userEmail,
      accountLinked: typeof booking.userId === "string" && booking.userId.length > 0,
      title: booking.movie.title ?? `TMDB #${booking.movie.tmdbId}`,
      theatreName: booking.theatreName,
      seatCodes: booking.seatCodes ?? [],
      seats: booking.quantity,
      amount: booking.amount.total,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      createdAt: booking.createdAt,
    })),
  };
}
