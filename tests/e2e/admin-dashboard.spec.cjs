const { test, expect } = require("@playwright/test");
const { sourceLoader } = require("../helpers/source-loader.cjs");
const { memoryDatabase } = require("../helpers/memory-database.cjs");

// Only these browser tests replace RPC responses. They verify actual UI and
// navigation, not live administrator authentication or MongoDB persistence.
const admin = {
  userId: "admin-ui-test",
  name: "Test Administrator",
  email: "admin@example.test",
  phone: "",
  role: "admin",
};
const member = {
  ...admin,
  userId: "member-ui-test",
  name: "Test Member",
  email: "member@example.test",
  role: "user",
};
let endpoints;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await browser.newPage();
  try {
    await page.goto("http://127.0.0.1:4180/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator('header[aria-busy="false"]')).toBeVisible({ timeout: 150_000 });
    endpoints = await page.evaluate(async () => {
      const api = await import("/src/lib/cinebook.functions.ts");
      return Object.fromEntries(
        [
          "getCurrentUser",
          "signIn",
          "getAdminOverview",
          "getFavorites",
          "getUserBookings",
          "signOut",
        ].map((name) => [name, new URL(api[name].url, location.origin).pathname]),
      );
    });
  } finally {
    await page.close();
  }
});

function booking(id, userId, userEmail, quantity, total, extra = {}) {
  return {
    bookingId: id,
    userId,
    userEmail,
    movie: { tmdbId: 101, title: "The Test Screening" },
    theatreName: "CineBook Test Theatre",
    quantity,
    seatCodes: Array.from({ length: quantity }, (_, index) => `A${index + 1}`),
    amount: { total },
    status: "CONFIRMED",
    paymentStatus: "PAID",
    createdAt: new Date().toISOString(),
    ...extra,
  };
}
async function model() {
  const database = memoryDatabase({
    users: [admin, { userId: "alice" }, { userId: "bob" }],
    bookings: [
      booking("UI-ALICE-1", "alice", "alice@example.test", 4, 900),
      booking("UI-ALICE-2", "alice", "alice@example.test", 2, 600),
      booking("UI-BOB", "bob", "bob@example.test", 1, 300),
      booking("UI-PENDING", "pending", "pending@example.test", 1, 200, {
        status: "PENDING",
        paymentStatus: "PENDING",
      }),
      booking("UI-REFUND", "refund", "refund@example.test", 1, 400, {
        status: "CANCELLED",
        paymentStatus: "REFUND_PENDING",
      }),
    ],
    theatres: [{ active: true }],
    screens: [{}, {}],
    shows: [{ active: true }],
    offers: [{ active: true }],
  });
  const analytics = sourceLoader({ "src/lib/db/mongo.server.ts": database.module }).load(
    "src/lib/db/admin-analytics.server.ts",
  );
  return {
    database,
    overview: await analytics.getAdminOverview(),
    reload: () => analytics.getAdminOverview(),
  };
}
async function mockRpc(page, fixture, initialActor = null) {
  const state = { actor: initialActor, failure: false, overviewRequests: 0 };
  await page.route("**/_serverFn/**", async (route) => {
    const name = Object.keys(endpoints).find(
      (name) => endpoints[name] === new URL(route.request().url()).pathname,
    );
    if (!name) return route.continue();
    let result;
    if (name === "getCurrentUser") result = state.actor;
    if (name === "signIn") result = state.actor = fixture.loginAs ?? admin;
    if (name === "signOut") {
      state.actor = null;
      result = { ok: true };
    }
    if (name === "getFavorites" || name === "getUserBookings") result = [];
    if (name === "getAdminOverview") {
      state.overviewRequests++;
      if (state.failure)
        return route.fulfill({
          status: 503,
          contentType: "text/plain",
          body: "DB_UNAVAILABLE: The database request could not be completed.",
        });
      result = fixture.overview;
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result, context: {} }),
    });
  });
  return state;
}

test("mocked RPC / actual admin UI: administrator sign-in opens business analytics, customer seats, search and refresh on desktop/mobile", async ({
  page,
}) => {
  const fixture = await model();
  await mockRpc(page, fixture);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/login");
  await expect(page.locator('header[aria-busy="false"]')).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(admin.email);
  await page.getByLabel("Password", { exact: true }).fill("dummy-browser-test-password");
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Admin dashboard", exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Paid revenue", exact: true })
      .getByText("₹1,800", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Customers booked", exact: true })
      .getByText("2", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Seats booked", exact: true }).getByText("7", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Registered users", exact: true })
      .getByText("3", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Customers who booked seats", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByText("alice@example.test", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("table").getByText("Refund pending", { exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search recent bookings" }).fill("bob@example.test");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  await expect(
    page.getByRole("table").getByText("bob@example.test", { exact: true }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search recent bookings" }).fill("");
  fixture.database.data.bookings.push(booking("UI-NEW", "bob", "bob@example.test", 2, 600));
  fixture.overview = await fixture.reload();
  await page.getByRole("button", { name: "Refresh analytics", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Paid revenue", exact: true })
      .getByText("₹2,400", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Welcome back!", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "audit/admin-dashboard-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page
      .getByRole("navigation", { name: "Bottom navigation" })
      .getByRole("link", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  // ResponsiveContainer updates through ResizeObserver after the viewport changes.
  await expect
    .poll(async () => {
      const layout = await page.evaluate(() => ({
        width: window.innerWidth,
        scroll: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll("body *")]
          .map((element) => ({
            tag: element.tagName,
            classes: typeof element.className === "string" ? element.className : "",
            right: Math.round(element.getBoundingClientRect().right),
          }))
          .filter((element) => element.right > window.innerWidth + 1)
          .slice(0, 16),
      }));
      if (layout.scroll > layout.width)
        require("node:fs").writeFileSync(
          "audit/admin-mobile-layout.json",
          JSON.stringify(layout, null, 2),
        );
      return layout.scroll <= layout.width;
    })
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator("svg.recharts-surface")
        .evaluate(
          (svg) =>
            Math.ceil(svg.getBoundingClientRect().width) <=
            Math.ceil(svg.closest(".recharts-responsive-container").getBoundingClientRect().width),
        ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator(".recharts-bar-rectangle path")
        .evaluateAll((bars) => bars.filter((bar) => bar.getBoundingClientRect().height > 1).length),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("region", { name: "Revenue over time", exact: true })
    .screenshot({ path: "audit/admin-dashboard-mobile-chart.png" });
  await page.screenshot({ path: "audit/admin-dashboard-mobile.png", fullPage: true });
  expect(pageErrors).toEqual([]);
});

test("mocked RPC / actual navigation: ordinary sign-in stays in the movie app and cannot see admin analytics", async ({
  page,
}) => {
  const fixture = await model();
  fixture.loginAs = member;
  const state = await mockRpc(page, fixture);
  await page.goto("/login");
  await expect(page.locator('header[aria-busy="false"]')).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(member.email);
  await page.getByLabel("Password", { exact: true }).fill("dummy-browser-test-password");
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4180/");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Access Denied" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Paid revenue", exact: true })).toHaveCount(0);
  expect(state.overviewRequests).toBe(0);
});

test("mocked RPC / actual admin UI: unavailable analytics show an error and retry instead of false zero totals", async ({
  page,
}) => {
  const fixture = await model();
  const state = await mockRpc(page, fixture, admin);
  state.failure = true;
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Analytics unavailable", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Paid revenue", exact: true })).toHaveCount(0);
  state.failure = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Paid revenue", exact: true })
      .getByText("₹1,800", { exact: true }),
  ).toBeVisible();
});
