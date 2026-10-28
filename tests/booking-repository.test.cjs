const test = require("node:test");
const assert = require("node:assert/strict");
const { repositoryFixture } = require("./helpers/fixtures.cjs");

test("isolated repository: empty persisted seat state never invents sold seats", async () => {
  const { repository, show } = repositoryFixture();
  const seats = await repository.getAvailableSeats(show.showId);
  assert.equal(seats.available, 24);
  assert.equal(seats.unavailable.length, 0);
});

test("isolated repository: repeated checkout key reuses one booking and rejects changed seats", async () => {
  const { repository, show, database } = repositoryFixture();
  const request = {
    showId: show.showId,
    seats: ["A1"],
    userId: "user-a",
    userEmail: "a@example.test",
    idempotencyKey: "checkout-key-a",
  };
  const first = await repository.createBooking(request);
  const repeated = await repository.createBooking(request);
  assert.equal(first.bookingId, repeated.bookingId);
  assert.equal(database.data.bookings.length, 1);
  assert.equal(database.data.payments.length, 1);
  await assert.rejects(
    repository.createBooking({ ...request, seats: ["A2"] }),
    (error) => error.code === "VALIDATION",
  );
});

test("isolated repository: concurrent duplicate favorites stay unique and removal preserves other accounts", async () => {
  const { repository, database } = repositoryFixture();
  const favorite = { userId: "user-a", movieId: "tmdb501", tmdbId: 501 };
  await Promise.all([repository.addFavorite(favorite), repository.addFavorite(favorite)]);
  await repository.addFavorite({ ...favorite, userId: "user-b" });
  assert.equal(database.data.favorites.length, 2);
  await repository.removeFavorite("user-a", 501);
  assert.equal((await repository.getFavorites("user-a")).length, 0);
  assert.equal((await repository.getFavorites("user-b")).length, 1);
});

async function paymentReady(fixture) {
  const booking = await fixture.bookingFor();
  const { claim } = await fixture.repository.claimRazorpayOrder(booking.bookingId);
  await fixture.repository.attachRazorpayOrder({
    bookingId: booking.bookingId,
    orderId: "order_test",
    amount: booking.amount.total,
    claim,
  });
  return {
    booking,
    callback: {
      bookingId: booking.bookingId,
      razorpayOrderId: "order_test",
      razorpayPaymentId: "pay_test",
      razorpaySignature: "a".repeat(64),
    },
  };
}

test("isolated repository: racing reservations cannot both hold the same seat", async () => {
  const { repository, show, availableSeat, database } = repositoryFixture();
  const seat = await availableSeat();
  const results = await Promise.allSettled([
    repository.reserveSeats(show.showId, [seat]),
    repository.reserveSeats(show.showId, [seat]),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(
    results.filter((item) => item.status === "rejected" && item.reason.code === "SEATS_UNAVAILABLE")
      .length,
    1,
  );
  assert.equal(database.data.show_seats[0].holds.filter((item) => item.seat === seat).length, 1);
});

test("isolated repository: malformed, nonexistent and oversized seat selections fail without writes", async () => {
  for (const seats of [
    ["A0"],
    ["A999"],
    ["Z1"],
    ["A-1"],
    ["A1junk"],
    [],
    Array.from({ length: 11 }, (_, i) => `A${i + 1}`),
  ]) {
    const { repository, show, database } = repositoryFixture();
    await assert.rejects(
      repository.createBooking({
        showId: show.showId,
        seats,
        userId: "user-a",
        userEmail: "a@example.test",
      }),
      (error) => error.code === "VALIDATION",
    );
    assert.equal(database.data.bookings.length, 0);
    assert.equal(database.data.payments.length, 0);
    assert.equal(database.data.show_seats[0].holds.length, 0);
  }
});

test("isolated repository: booking totals come from the persisted show and bind payment to account", async () => {
  const { bookingFor, database } = repositoryFixture();
  const booking = await bookingFor();
  assert.equal(booking.amount.tickets, 200);
  assert.equal(booking.amount.total, 239);
  assert.equal(booking.userId, "user-a");
  assert.equal(booking.status, "PENDING");
  assert.equal(database.data.payments[0].userId, "user-a");
  assert.equal(database.data.payments[0].amount, booking.amount.total);
});

test("isolated repository: failed checkout releases its hold and remains failed on replay", async () => {
  const { repository, bookingFor, database } = repositoryFixture();
  const booking = await bookingFor();
  await repository.markRazorpayFailed({ bookingId: booking.bookingId, reason: "DISMISSED" });
  const replay = await repository.markRazorpayFailed({
    bookingId: booking.bookingId,
    reason: "DISMISSED",
  });
  assert.equal(replay.status, "CANCELLED");
  assert.equal(replay.paymentStatus, "FAILED");
  assert.equal(database.data.show_seats[0].holds.length, 0);
  assert.equal(database.data.show_seats[0].taken.length, 0);
});

test("isolated repository: account A cannot cancel account B's booking", async () => {
  const { repository, bookingFor, database } = repositoryFixture();
  const booking = await bookingFor("user-b");
  await assert.rejects(
    repository.cancelBooking(booking.bookingId, { userId: "user-a", email: "a@example.test" }),
    (error) => error.code === "UNAUTHORIZED",
  );
  assert.equal(database.data.bookings[0].status, "PENDING");
  assert.equal(database.data.show_seats[0].holds.length, 1);
});

test("isolated repository: another provider order cannot confirm a booking", async () => {
  const { repository, bookingFor, database } = repositoryFixture();
  const booking = await bookingFor();
  const { claim } = await repository.claimRazorpayOrder(booking.bookingId);
  await repository.attachRazorpayOrder({
    bookingId: booking.bookingId,
    orderId: "order-correct",
    amount: booking.amount.total,
    claim,
  });
  await assert.rejects(
    repository.markRazorpayPaid({
      bookingId: booking.bookingId,
      razorpayOrderId: "order-other",
      razorpayPaymentId: "pay-other",
      razorpaySignature: "test-signature",
    }),
    (error) => error.code === "PAYMENT_ERROR",
  );
  assert.equal(database.data.bookings[0].status, "PENDING");
  assert.equal(database.data.show_seats[0].taken.length, 0);
});

test("isolated repository: user booking and favorite queries never return another account's records", async () => {
  const { repository, bookingFor, database } = repositoryFixture();
  await bookingFor("user-a");
  await bookingFor("user-b");
  database.data.favorites.push(
    { userId: "user-a", tmdbId: 10, movieId: "tmdb10", createdAt: new Date().toISOString() },
    { userId: "user-b", tmdbId: 20, movieId: "tmdb20", createdAt: new Date().toISOString() },
  );
  const bookings = await repository.getUserBookings({ userId: "user-a" });
  const favorites = await repository.getFavorites("user-a");
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].userId, "user-a");
  assert.deepEqual(JSON.parse(JSON.stringify(favorites.map((item) => item.movieId))), ["tmdb10"]);
});

test("isolated transaction model: failed payment record insertion rolls back booking and seat hold", async () => {
  const fixture = repositoryFixture();
  fixture.database.failNext("payments", "insertOne");
  await assert.rejects(fixture.bookingFor(), (error) => error.code === "DB_UNAVAILABLE");
  assert.equal(fixture.database.data.bookings.length, 0);
  assert.equal(fixture.database.data.payments.length, 0);
  assert.equal(fixture.database.data.show_seats[0].holds.length, 0);
});

test("isolated repository: competing order creation claims allow one provider order setup", async () => {
  const { repository, bookingFor } = repositoryFixture();
  const booking = await bookingFor();
  const results = await Promise.allSettled([
    repository.claimRazorpayOrder(booking.bookingId),
    repository.claimRazorpayOrder(booking.bookingId),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected").length, 1);
});

test("isolated repository: client-supplied payment totals cannot replace trusted booking amount", async () => {
  const { repository, bookingFor, database } = repositoryFixture();
  const booking = await bookingFor();
  const { claim } = await repository.claimRazorpayOrder(booking.bookingId);
  await assert.rejects(
    repository.attachRazorpayOrder({
      bookingId: booking.bookingId,
      orderId: "order_test",
      amount: 1,
      claim,
    }),
    (error) => error.code === "PAYMENT_ERROR",
  );
  assert.equal(database.data.payments[0].amount, booking.amount.total);
  assert.equal(database.data.payments[0].providerOrderId, null);
});

test("isolated repository: arbitrary mock confirmation cannot mark a reservation paid", async () => {
  const { repository, bookingFor, database } = repositoryFixture();
  const booking = await bookingFor();
  await assert.rejects(
    repository.confirmBooking({ bookingId: booking.bookingId, paymentStatus: "PAID" }),
    (error) => error.code === "PAYMENT_ERROR",
  );
  assert.equal(database.data.bookings[0].status, "PENDING");
  assert.equal(database.data.show_seats[0].taken.length, 0);
});

test("isolated transaction model: duplicate verified callback is idempotent and another payment cannot replay it", async () => {
  const fixture = repositoryFixture();
  const { booking, callback } = await paymentReady(fixture);
  const results = await Promise.all([
    fixture.repository.markRazorpayPaid(callback),
    fixture.repository.markRazorpayPaid(callback),
  ]);
  assert.equal(results[0].status, "CONFIRMED");
  assert.equal(results[1].status, "CONFIRMED");
  assert.deepEqual(
    fixture.database.data.show_seats[0].taken,
    JSON.parse(JSON.stringify(booking.seatCodes)),
  );
  assert.equal(fixture.database.data.show_seats[0].holds.length, 0);
  await assert.rejects(
    fixture.repository.markRazorpayPaid({ ...callback, razorpayPaymentId: "pay_other" }),
    (error) => error.code === "PAYMENT_ERROR",
  );
  await fixture.repository.markRazorpayFailed({ bookingId: booking.bookingId });
  assert.equal(fixture.database.data.bookings[0].status, "CONFIRMED");
});

test("isolated transaction model: expired captured booking cannot steal a renewed seat hold", async () => {
  const fixture = repositoryFixture();
  const { booking, callback } = await paymentReady(fixture);
  const seatState = fixture.database.data.show_seats[0];
  seatState.holds[0].expiresAt = new Date(Date.now() - 1000).toISOString();
  const newer = await fixture.repository.reserveSeats(booking.showId, booking.seatCodes);
  await assert.rejects(
    fixture.repository.markRazorpayPaid(callback),
    (error) => error.code === "PAYMENT_ERROR",
  );
  assert.equal(fixture.database.data.bookings[0].status, "CANCELLED");
  assert.equal(fixture.database.data.bookings[0].paymentStatus, "REFUND_PENDING");
  assert.equal(fixture.database.data.payments[0].status, "REFUND_PENDING");
  assert.equal(seatState.taken.length, 0);
  assert.equal(seatState.holds.filter((hold) => hold.ref === newer.holdRef).length, 1);
});

test("isolated transaction model: paid cancellation records refund pending rather than a completed refund", async () => {
  const fixture = repositoryFixture();
  const { booking, callback } = await paymentReady(fixture);
  await fixture.repository.markRazorpayPaid(callback);
  const actor = { userId: "user-a", email: "a@example.test" };
  const cancelled = await fixture.repository.cancelBooking(booking.bookingId, actor);
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.paymentStatus, "REFUND_PENDING");
  assert.equal(fixture.database.data.payments[0].status, "REFUND_PENDING");
  assert.equal(fixture.database.data.show_seats[0].taken.length, 0);
  const replay = await fixture.repository.cancelBooking(booking.bookingId, actor);
  assert.equal(replay.paymentStatus, "REFUND_PENDING");
});

test("isolated repository: admin revenue excludes pending and failed reservations", async () => {
  const fixture = repositoryFixture();
  const { booking, callback } = await paymentReady(fixture);
  await fixture.repository.markRazorpayPaid(callback);
  await fixture.bookingFor("user-b");
  const failed = await fixture.bookingFor("user-b");
  await fixture.repository.markRazorpayFailed({ bookingId: failed.bookingId });
  const overview = await fixture.repository.getAdminOverview();
  assert.equal(overview.kpis.revenue, booking.amount.total);
  assert.equal(overview.kpis.bookings, 1);
  assert.equal(overview.kpis.seatsSold, 1);
});
