const { test, expect } = require("@playwright/test");
const { MongoClient } = require("mongodb");
const { databaseGate } = require("./database-gate.cjs");
const gate = databaseGate();
let client;
let db;
let blocked = gate.enabled ? undefined : gate.reason;
const emails = [];
const userIds = [];

test.beforeAll(async () => {
  if (!gate.enabled) return;
  client = new MongoClient(gate.uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    db = client.db(gate.name);
    await db.command({ ping: 1 });
  } catch (error) {
    blocked = `Isolated database prerequisite failed: ${error.name}${error.code ? ` code ${error.code}` : ""}. Credentials are not printed.`;
  }
});

test.afterAll(async () => {
  // Exact fixture ownership only. Never drop a database or unrelated records.
  if (db && userIds.length) {
    for (const name of ["favorites", "bookings", "payments", "sessions"])
      await db.collection(name).deleteMany({ userId: { $in: userIds } });
    await db.collection("users").deleteMany({ userId: { $in: userIds }, email: { $in: emails } });
  }
  await client?.close();
});

async function signup(page, email, name) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Phone", { exact: true }).fill("9999999999");
  await page.getByLabel("Password", { exact: true }).fill("Audit-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const user = await db.collection("users").findOne({ email });
  expect(user).not.toBeNull();
  userIds.push(user.userId);
  return user;
}

function bookingFixture(user, id, title) {
  const stamp = new Date().toISOString();
  return {
    bookingId: id,
    userId: user.userId,
    userEmail: user.email,
    movie: { tmdbId: 501, movieId: "tmdb501", title },
    theatreId: "audit-theatre",
    theatreName: "Audit fixture theatre",
    address: "Fixture address",
    screenId: "audit-screen",
    screenName: "Screen 1",
    showId: `audit-show-${id}`,
    date: "2099-12-31",
    time: "7:00 PM",
    format: "2D",
    seats: [{ code: "A1", category: "Regular", price: 200 }],
    seatCodes: ["A1"],
    quantity: 1,
    amount: { tickets: 200, fee: 25, taxes: 14, discount: 0, total: 239 },
    status: "PENDING",
    paymentStatus: "PENDING",
    qr: { code: "", payload: "", issuedAt: "" },
    createdAt: stamp,
    updatedAt: stamp,
  };
}

test("isolated real DB and two browser contexts: favorites/bookings survive reload only for their owner; logout revokes replay", async ({
  browser,
}) => {
  test.skip(Boolean(blocked), blocked);
  const run = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const contextA = await browser.newContext({ baseURL: "http://127.0.0.1:4180" });
  const contextB = await browser.newContext({ baseURL: "http://127.0.0.1:4180" });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const emailA = `audit-${run}-a@example.test`,
    emailB = `audit-${run}-b@example.test`;
  emails.push(emailA, emailB);
  try {
    const userA = await signup(pageA, emailA, "Audit Alice");
    const userB = await signup(pageB, emailB, "Audit Bob");
    expect(userA.role).toBe("user");
    expect(userB.role).toBe("user");
    await db
      .collection("bookings")
      .insertMany([
        bookingFixture(userA, `AUDIT-A-${run}`, "Audit Alice private booking"),
        bookingFixture(userB, `AUDIT-B-${run}`, "Audit Bob private booking"),
      ]);
    await pageA.evaluate(async () => {
      const api = await import("/src/lib/cinebook.functions.ts");
      await api.addFavorite({
        data: { tmdbId: 501, movieId: "tmdb501", title: "Audit Alice private favorite" },
      });
    });
    expect(await db.collection("favorites").countDocuments({ userId: userA.userId })).toBe(1);
    await pageA.goto("/favorites");
    await expect(pageA.getByText("Audit Alice private favorite", { exact: true })).toBeVisible();
    await pageA.reload();
    await expect(pageA.getByText("Audit Alice private favorite", { exact: true })).toBeVisible();
    await pageB.goto("/favorites");
    await expect(pageB.getByText(/No favorites yet/)).toBeVisible();
    await expect(pageB.getByText("Audit Alice private favorite")).toHaveCount(0);
    await pageA.goto("/bookings");
    await expect(pageA.getByRole("heading", { name: "Audit Alice private booking" })).toBeVisible();
    await expect(pageA.getByText("Audit Bob private booking")).toHaveCount(0);
    await pageB.goto("/bookings");
    await expect(pageB.getByRole("heading", { name: "Audit Bob private booking" })).toBeVisible();
    await expect(pageB.getByText("Audit Alice private booking")).toHaveCount(0);
    await pageB.goto("/admin");
    await expect(pageB.getByRole("heading", { name: "Access Denied" })).toBeVisible();
    const previous = await contextA.storageState();
    await pageA.goto("/profile");
    await pageA.getByRole("button", { name: /Sign out/i }).click();
    await pageA.goto("/favorites");
    await expect(
      pageA.getByRole("heading", { name: "Sign in to see your favorites" }),
    ).toBeVisible();
    const replay = await browser.newContext({ storageState: previous });
    const replayPage = await replay.newPage();
    await replayPage.goto("http://127.0.0.1:4180/profile");
    await expect(replayPage.getByRole("heading", { name: "You're not signed in" })).toBeVisible();
    await replay.close();
    await pageB.goto("/bookings");
    await expect(pageB.getByRole("heading", { name: "Audit Bob private booking" })).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
