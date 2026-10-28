const test = require("node:test");
const assert = require("node:assert/strict");
const { sourceLoader, serverFunctionFramework } = require("./helpers/source-loader.cjs");
const { memoryDatabase, DbError } = require("./helpers/memory-database.cjs");

function handlerFixture() {
  const alice = {
    userId: "user-a",
    name: "Alice",
    email: "a@example.test",
    phone: "",
    role: "user",
  };
  let actor = alice;
  let status;
  let validSignature = true;
  let captureError = false;
  const calls = [];
  const bookings = ["user-a", "user-b"].map((userId, index) => ({
    bookingId: `booking-${index + 1}`,
    userId,
    userEmail: `${index === 0 ? "a" : "b"}@example.test`,
    showId: "show-test",
    status: "PENDING",
    paymentStatus: "PENDING",
    amount: { total: 239 },
    qr: { code: "private-qr", payload: "private-payload", issuedAt: "test" },
  }));
  const favorites = [
    { userId: "user-a", tmdbId: 1, movieId: "tmdb1" },
    { userId: "user-b", tmdbId: 2, movieId: "tmdb2" },
  ];
  const record =
    (name, implementation = () => null) =>
    async (...args) => {
      calls.push({ name, args: structuredClone(args) });
      return implementation(...args);
    };
  const requireUser = async () => {
    if (!actor) throw new DbError("AUTH_REQUIRED", "Sign in to continue.");
    return actor;
  };
  const requireAdmin = async () => {
    const user = await requireUser();
    if (user.role !== "admin") throw new DbError("FORBIDDEN", "Administrator access is required.");
    return user;
  };
  const repository = {
    getUser: record("getUser", () => actor),
    verifyUser: record("verifyUser", () => null),
    updateUser: record("updateUser", (_userId, patch) => ({ ...actor, ...patch })),
    getBooking: record("getBooking", (bookingId) =>
      bookings.find((item) => item.bookingId === bookingId),
    ),
    getUserBookings: record("getUserBookings", ({ userId }) =>
      bookings.filter((item) => item.userId === userId),
    ),
    getFavorites: record("getFavorites", (userId) =>
      favorites.filter((item) => item.userId === userId),
    ),
    addFavorite: record("addFavorite", (input) => [input]),
    removeFavorite: record("removeFavorite", () => []),
    createBooking: record("createBooking", (input) => ({ ...bookings[0], ...input })),
    cancelBooking: record("cancelBooking", (bookingId) => ({
      ...bookings.find((item) => item.bookingId === bookingId),
      status: "CANCELLED",
    })),
    getAdminOverview: record("getAdminOverview", () => ({ kpis: { revenue: 239 } })),
    upsertTheatre: record("upsertTheatre"),
    createShow: record("createShow"),
    upsertOffer: record("upsertOffer"),
    getPaymentForBooking: record("getPaymentForBooking", () => ({ providerOrderId: "order_test" })),
    claimRazorpayOrder: record("claimRazorpayOrder", () => ({
      payment: { providerOrderId: null },
      claim: "claim-test",
    })),
    attachRazorpayOrder: record("attachRazorpayOrder"),
    releaseRazorpayOrderClaim: record("releaseRazorpayOrderClaim"),
    markRazorpayPaid: record("markRazorpayPaid", ({ bookingId }) => ({
      ...bookings.find((item) => item.bookingId === bookingId),
      status: "CONFIRMED",
      paymentStatus: "PAID",
    })),
    markRazorpayFailed: record("markRazorpayFailed"),
  };
  const database = memoryDatabase();
  database.module.toClientError = (error) => ({
    code: error.code ?? (error.name === "ZodError" ? "VALIDATION" : "INTERNAL_ERROR"),
    message: error.code ? error.message : "Invalid request",
  });
  const gateway = {
    isRazorpayConfigured: () => true,
    getKeyId: () => "rzp_test_dummy",
    verifySignature: record("verifySignature", () => validSignature),
    fetchCapturedPayment: record("fetchCapturedPayment", () => {
      if (captureError) throw new DbError("PAYMENT_ERROR", "Capture not confirmed");
      return { status: "captured" };
    }),
    createOrder: record("createOrder", () => ({
      id: "order_test",
      amount: 23900,
      currency: "INR",
    })),
  };
  const loader = sourceLoader(
    {
      "@tanstack/react-start": serverFunctionFramework(),
      "@tanstack/react-start/server": {
        setResponseStatus: (value) => {
          status = value;
        },
      },
      "src/lib/db/mongo.server.ts": database.module,
      "src/lib/db/repositories.server.ts": repository,
      "src/lib/auth.server.ts": {
        requireUser,
        requireAdmin,
        currentUser: () => actor,
        isAdministrator: (user) => user.role === "admin",
        beginSession: record("beginSession", (user) => user),
        endSession: record("endSession", () => {
          actor = null;
        }),
        limitAuthentication: () => {},
      },
      "src/lib/db/seed.server.ts": { seedDatabase: record("seedDatabase", () => ({ ok: true })) },
      "src/lib/razorpay.server.ts": gateway,
    },
    { env: { CINEBOOK_SEED_TOKEN: "test-seed-token" } },
  );
  return {
    api: loader.load("src/lib/cinebook.functions.ts"),
    calls,
    bookings,
    alice,
    setActor: (value) => {
      actor = value;
    },
    getStatus: () => status,
    signature: (value) => {
      validSignature = value;
    },
    failCapture: () => {
      captureError = true;
    },
  };
}

test("mocked transport / real handlers: anonymous requests cannot read private data or mutate bookings/favorites", async () => {
  const fixture = handlerFixture();
  fixture.setActor(null);
  for (const [name, data] of [
    ["getUserBookings"],
    ["getFavorites"],
    ["getUserProfile"],
    ["getBooking", { bookingId: "booking-1" }],
    ["createBooking", { showId: "show-test", seats: ["A1"] }],
    ["addFavorite", { tmdbId: 1, movieId: "tmdb1" }],
    ["cancelBooking", { bookingId: "booking-1" }],
    ["createRazorpayOrder", { bookingId: "booking-1" }],
  ]) {
    await assert.rejects(fixture.api[name]({ data }), /^Error: AUTH_REQUIRED:/);
    assert.equal(fixture.getStatus(), 401);
  }
  assert.equal(fixture.calls.length, 0);
});

test("mocked transport / real handlers: normal user cannot call any admin write, analytics or seed endpoint", async () => {
  const fixture = handlerFixture();
  for (const name of [
    "saveTheatre",
    "createShow",
    "saveOffer",
    "seedDatabase",
    "getAdminOverview",
  ]) {
    await assert.rejects(
      fixture.api[name]({ data: { role: "admin", token: "test-seed-token" } }),
      /^Error: FORBIDDEN:/,
    );
    assert.equal(fixture.getStatus(), 403);
  }
  assert.equal(fixture.calls.length, 0);
  assert.equal(await fixture.api.getAdminAccess(), false);
  fixture.setActor({ ...fixture.alice, role: "admin" });
  assert.equal(await fixture.api.getAdminAccess(), true);
  assert.equal((await fixture.api.getAdminOverview()).kpis.revenue, 239);
});

test("mocked transport / real handlers: changing userId or email cannot read or modify another account", async () => {
  const fixture = handlerFixture();
  const profile = await fixture.api.getUserProfile({
    data: { userId: "user-b", email: "b@example.test" },
  });
  assert.equal(profile.userId, "user-a");
  const bookings = await fixture.api.getUserBookings({ data: { userId: "user-b" } });
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].userId, "user-a");
  const favorites = await fixture.api.getFavorites({ data: { userId: "user-b" } });
  assert.equal(favorites.length, 1);
  assert.equal(favorites[0].userId, "user-a");
  await fixture.api.updateUserProfile({
    data: { userId: "user-b", email: "b@example.test", role: "admin", name: "Updated" },
  });
  const update = fixture.calls.find((item) => item.name === "updateUser");
  assert.deepEqual(update.args, ["user-a", { name: "Updated" }]);
  await fixture.api.addFavorite({ data: { userId: "user-b", tmdbId: 42, movieId: "tmdb42" } });
  assert.equal(fixture.calls.find((item) => item.name === "addFavorite").args[0].userId, "user-a");
  await fixture.api.removeFavorite({ data: { userId: "user-b", tmdbId: 42 } });
  assert.deepEqual(fixture.calls.find((item) => item.name === "removeFavorite").args, [
    "user-a",
    42,
  ]);
});

test("mocked transport / real handlers: foreign booking ID blocks ticket, cancel and every payment operation", async () => {
  const fixture = handlerFixture();
  const callback = {
    bookingId: "booking-2",
    userId: "user-a",
    email: "a@example.test",
    razorpayOrderId: "order_test",
    razorpayPaymentId: "pay_test",
    razorpaySignature: "a".repeat(64),
  };
  for (const name of [
    "getBooking",
    "cancelBooking",
    "createRazorpayOrder",
    "verifyRazorpayPayment",
    "failRazorpayPayment",
  ]) {
    await assert.rejects(fixture.api[name]({ data: callback }), /^Error: FORBIDDEN:/);
    assert.equal(fixture.getStatus(), 403);
  }
  assert.ok(fixture.calls.every((item) => item.name === "getBooking"));
});

test("mocked transport / real handlers: booking ownership and pending ticket QR are server controlled", async () => {
  const fixture = handlerFixture();
  const created = await fixture.api.createBooking({
    data: {
      showId: "show-test",
      seats: ["A1"],
      userId: "user-b",
      userEmail: "b@example.test",
      amount: 1,
      movie: { tmdbId: 777 },
    },
  });
  const input = fixture.calls.find((item) => item.name === "createBooking").args[0];
  assert.equal(input.userId, "user-a");
  assert.equal(input.userEmail, "a@example.test");
  assert.equal(input.amount, undefined);
  assert.equal(input.movie, undefined);
  assert.equal(created.qr.payload, "");
  assert.equal((await fixture.api.getBooking({ data: { bookingId: "booking-1" } })).qr.code, "");
  fixture.bookings[0].status = "CONFIRMED";
  fixture.bookings[0].paymentStatus = "PAID";
  assert.equal(
    (await fixture.api.getBooking({ data: { bookingId: "booking-1" } })).qr.payload,
    "private-payload",
  );
});

test("mocked transport / real handlers: malformed input is rejected before any repository write", async () => {
  const fixture = handlerFixture();
  for (const [name, data] of [
    ["addFavorite", { tmdbId: { $ne: null }, movieId: "tmdb1" }],
    ["addFavorite", { tmdbId: 1, movieId: "tmdb2" }],
    ["createBooking", { showId: "show-test", seats: ["A0"] }],
    ["createBooking", { showId: "show-test", seats: Array(9).fill("A1") }],
    ["updateUserProfile", { name: "a".repeat(201) }],
    ["signUp", { name: "A", email: "not-email", password: "short" }],
  ]) {
    await assert.rejects(fixture.api[name]({ data }), /^Error: VALIDATION:/);
    assert.equal(fixture.getStatus(), 400);
  }
  assert.equal(fixture.calls.length, 0);
});

test("mocked transport / real handlers: legacy mock, standalone and detached seat endpoints cannot bypass checkout", async () => {
  const fixture = handlerFixture();
  for (const name of [
    "confirmBooking",
    "createStandaloneRazorpayOrder",
    "verifyStandaloneRazorpayPayment",
    "reserveSeats",
    "releaseSeats",
  ]) {
    await assert.rejects(
      fixture.api[name]({
        data: {
          bookingId: "booking-1",
          paymentStatus: "PAID",
          amount: 1,
          showId: "show-test",
          seats: ["A1"],
        },
      }),
      /^Error: FORBIDDEN:/,
    );
  }
  assert.equal(fixture.calls.length, 0);
});

test("mocked transport / real handlers: provider order derives amount from owned persisted booking", async () => {
  const fixture = handlerFixture();
  const order = await fixture.api.createRazorpayOrder({
    data: { bookingId: "booking-1", amount: 1 },
  });
  assert.equal(order.amount, 23900);
  assert.equal(
    fixture.calls.find((item) => item.name === "createOrder").args[0].amountInRupees,
    239,
  );
  assert.equal(
    fixture.calls.find((item) => item.name === "attachRazorpayOrder").args[0].amount,
    239,
  );
});

test("mocked transport / real handlers: confirmation requires stored order, valid HMAC and captured provider payment", async () => {
  const fixture = handlerFixture();
  const callback = {
    bookingId: "booking-1",
    razorpayOrderId: "order_test",
    razorpayPaymentId: "pay_test",
    razorpaySignature: "a".repeat(64),
  };
  await assert.rejects(
    fixture.api.verifyRazorpayPayment({ data: { ...callback, razorpayOrderId: "order_other" } }),
    /^Error: PAYMENT_ERROR:/,
  );
  assert.equal(
    fixture.calls.some((item) => item.name === "verifySignature"),
    false,
  );
  fixture.signature(false);
  assert.equal((await fixture.api.verifyRazorpayPayment({ data: callback })).verified, false);
  assert.equal(
    fixture.calls.some(
      (item) => item.name === "markRazorpayPaid" || item.name === "markRazorpayFailed",
    ),
    false,
  );
  fixture.signature(true);
  const result = await fixture.api.verifyRazorpayPayment({ data: callback });
  assert.equal(result.verified, true);
  const names = fixture.calls.map((item) => item.name);
  assert.ok(names.indexOf("fetchCapturedPayment") < names.indexOf("markRazorpayPaid"));
  const failed = handlerFixture();
  failed.failCapture();
  await assert.rejects(
    failed.api.verifyRazorpayPayment({ data: callback }),
    /^Error: PAYMENT_ERROR:/,
  );
  assert.equal(
    failed.calls.some((item) => item.name === "markRazorpayPaid"),
    false,
  );
});
