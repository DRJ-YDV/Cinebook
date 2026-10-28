const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { sourceLoader } = require("./helpers/source-loader.cjs");
const { memoryDatabase } = require("./helpers/memory-database.cjs");

function providerFixture(options = {}) {
  const database = memoryDatabase();
  return sourceLoader(
    { "src/lib/db/mongo.server.ts": database.module },
    {
      env: {
        RAZORPAY_KEY_ID: "rzp_test_isolated",
        RAZORPAY_KEY_SECRET: "dummy-secret-for-offline-tests",
      },
      ...options,
    },
  ).load("src/lib/razorpay.server.ts");
}

test("offline payment crypto: only the matching order/payment signature is accepted", async () => {
  const gateway = providerFixture();
  const signature = createHmac("sha256", "dummy-secret-for-offline-tests")
    .update("order_test|pay_test")
    .digest("hex");
  assert.equal(
    await gateway.verifySignature({ orderId: "order_test", paymentId: "pay_test", signature }),
    true,
  );
  assert.equal(
    await gateway.verifySignature({ orderId: "order_other", paymentId: "pay_test", signature }),
    false,
  );
  assert.equal(
    await gateway.verifySignature({ orderId: "order_test", paymentId: "pay_other", signature }),
    false,
  );
  for (const invalid of ["", "not-a-signature", "0".repeat(64), signature.slice(1)]) {
    assert.equal(
      await gateway.verifySignature({
        orderId: "order_test",
        paymentId: "pay_test",
        signature: invalid,
      }),
      false,
    );
  }
});

test("mocked gateway transport: order request uses server amount in paise and omits secret from response", async () => {
  let sent;
  const gateway = providerFixture({
    fetch: async (url, request) => {
      sent = { url, request };
      return new Response(
        JSON.stringify({ id: "order_test", amount: 23900, currency: "INR", status: "created" }),
        { status: 200 },
      );
    },
  });
  const order = await gateway.createOrder({ amountInRupees: 239, receipt: "booking-test" });
  assert.equal(order.id, "order_test");
  assert.equal(JSON.parse(sent.request.body).amount, 23900);
  assert.equal(JSON.parse(sent.request.body).currency, "INR");
  assert.ok(!JSON.stringify(order).includes("dummy-secret"));
});

test("mocked gateway transport: capture verification rejects mismatched order, amount, currency and status", async () => {
  const correct = {
    id: "pay_test",
    order_id: "order_test",
    amount: 23900,
    currency: "INR",
    status: "captured",
    captured: true,
  };
  const good = providerFixture({
    fetch: async () => new Response(JSON.stringify(correct), { status: 200 }),
  });
  assert.equal(
    (
      await good.fetchCapturedPayment({
        paymentId: "pay_test",
        orderId: "order_test",
        amountInRupees: 239,
      })
    ).id,
    "pay_test",
  );
  for (const invalid of [
    { order_id: "order_other" },
    { id: "pay_other" },
    { amount: 1 },
    { currency: "USD" },
    { status: "authorized" },
    { captured: false },
  ]) {
    const gateway = providerFixture({
      fetch: async () => new Response(JSON.stringify({ ...correct, ...invalid }), { status: 200 }),
    });
    await assert.rejects(
      gateway.fetchCapturedPayment({
        paymentId: "pay_test",
        orderId: "order_test",
        amountInRupees: 239,
      }),
      (error) => error.code === "PAYMENT_ERROR",
    );
  }
});
