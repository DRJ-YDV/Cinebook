const test = require("node:test");
const assert = require("node:assert/strict");
const { sourceLoader } = require("./helpers/source-loader.cjs");
const { memoryDatabase } = require("./helpers/memory-database.cjs");

const fixed = Date.parse("2026-10-26T07:00:00Z");
class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [fixed]));
  }
  static now() {
    return fixed;
  }
}
function booking(id, patch = {}) {
  return {
    bookingId: `B-${id}`,
    userId: "user-a",
    userEmail: "a@example.test",
    movie: { tmdbId: 1, title: "Test film" },
    theatreName: "Test theatre",
    quantity: 2,
    seatCodes: ["A1", "A2"],
    amount: { total: 250 },
    status: "CONFIRMED",
    paymentStatus: "PAID",
    createdAt: "2026-10-26T05:00:00Z",
    ...patch,
  };
}
function fixture(bookings = [], extra = {}) {
  const database = memoryDatabase({
    bookings,
    users: [{ userId: "user-a" }, { userId: "user-b" }],
    ...extra,
  });
  const loader = sourceLoader(
    { "src/lib/db/mongo.server.ts": database.module },
    { Date: FixedDate },
  );
  const analytics = loader.load("src/lib/db/admin-analytics.server.ts");
  return { database, analytics };
}

test("isolated admin analytics: all-time totals include more than 500 bookings while recent records stay bounded", async () => {
  const rows = Array.from({ length: 505 }, (_, index) =>
    booking(index, { userId: `user-${index % 10}`, userEmail: `user-${index % 10}@example.test` }),
  );
  const { analytics, database } = fixture(rows);
  const result = await analytics.getAdminOverview();
  assert.equal(result.kpis.bookings, 505);
  assert.equal(result.kpis.revenue, 126250);
  assert.equal(result.kpis.seatsSold, 1010);
  assert.equal(result.kpis.customers, 10);
  assert.equal(result.kpis.avgBookingValue, 250);
  assert.equal(result.recent.length, 20);
  assert.equal(
    database.operations.filter((op) => op.name === "bookings" && op.method === "find").length,
    0,
  );
});

test("isolated admin analytics: customer counts are distinct and unpaid, cancelled and refund-pending amounts cannot inflate revenue", async () => {
  const { analytics } = fixture([
    booking(1),
    booking(2),
    booking(3, { userId: "user-b", userEmail: "b@example.test" }),
    booking(4, { userId: null }),
    booking(5, { status: "PENDING", paymentStatus: "PENDING" }),
    booking(6, { status: "CANCELLED", paymentStatus: "PAID" }),
    booking(7, { status: "CANCELLED", paymentStatus: "FAILED" }),
    booking(8, { status: "CANCELLED", paymentStatus: "REFUND_PENDING" }),
  ]);
  const result = await analytics.getAdminOverview();
  assert.equal(result.kpis.revenue, 1000);
  assert.equal(result.kpis.bookings, 4);
  assert.equal(result.kpis.customers, 2);
  assert.equal(result.kpis.unlinkedBookings, 1);
  assert.equal(result.kpis.seatsSold, 8);
  assert.equal(result.kpis.pending, 1);
  assert.equal(result.kpis.cancelled, 3);
  assert.equal(result.kpis.failed, 1);
  assert.equal(result.kpis.refundPending, 1);
  assert.equal(result.kpis.refundPendingAmount, 250);
  assert.equal(result.topCustomers[0].userId, "user-a");
  assert.equal(result.topCustomers[0].bookings, 2);
  assert.equal(result.counts.users, 2);
});

test("isolated admin analytics: daily revenue uses India midnight and invalid legacy dates do not break totals", async () => {
  const { analytics } = fixture([
    booking(1, { createdAt: "2026-10-25T18:29:59Z" }),
    booking(2, { createdAt: "2026-10-25T18:30:00Z" }),
    booking(3, { createdAt: "2026-10-26T01:00:00Z" }),
    booking(4, { createdAt: "2026-09-01T01:00:00Z" }),
    booking(5, { createdAt: "invalid legacy date" }),
  ]);
  const result = await analytics.getAdminOverview();
  assert.equal(result.kpis.revenue, 1250);
  assert.equal(result.dailyRevenue.length, 14);
  assert.equal(result.dailyRevenue[0].date, "2026-10-13");
  assert.equal(result.dailyRevenue.at(-1).date, "2026-10-26");
  assert.equal(result.dailyRevenue.find((row) => row.date === "2026-10-25").revenue, 250);
  assert.equal(result.dailyRevenue.find((row) => row.date === "2026-10-26").revenue, 500);
});

test("isolated admin analytics: empty database returns honest zero totals and exact inventory counts", async () => {
  const { analytics } = fixture([], {
    users: [],
    theatres: [{ active: true }, { active: false }],
    screens: [{}, {}],
    shows: [{ active: true }, { active: false }],
    offers: [{ active: true }, { active: false }],
  });
  const result = await analytics.getAdminOverview();
  assert.equal(result.kpis.revenue, 0);
  assert.equal(result.kpis.customers, 0);
  assert.equal(result.kpis.avgBookingValue, 0);
  assert.equal(result.counts.users, 0);
  assert.equal(result.counts.theatres, 1);
  assert.equal(result.counts.screens, 2);
  assert.equal(result.counts.shows, 1);
  assert.equal(result.counts.offers, 1);
  assert.equal(result.topMovies.length, 0);
  assert.equal(result.topCustomers.length, 0);
  assert.equal(result.recent.length, 0);
  assert.equal(result.dailyRevenue.filter((row) => row.revenue !== 0).length, 0);
});

test("isolated admin analytics: database errors propagate instead of being displayed as zero revenue", async () => {
  const { analytics, database } = fixture([booking(1)]);
  database.failNext("bookings", "aggregate");
  await assert.rejects(analytics.getAdminOverview(), /Injected isolated storage failure/);
});
