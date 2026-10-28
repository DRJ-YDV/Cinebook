const { test, expect } = require("@playwright/test");
const fs = require("node:fs");

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  const started = Date.now();
  const bootstrap = await browser.newPage();
  try {
    // Vite's HTTP-ready response can precede its client module transforms.
    // Functional assertions start only when the real guest app is hydrated.
    await bootstrap.goto("http://127.0.0.1:4180/login", { waitUntil: "domcontentloaded" });
    await expect(bootstrap.locator('header[aria-busy="false"]')).toBeVisible({ timeout: 150_000 });
    fs.writeFileSync(
      "audit/browser-startup.json",
      JSON.stringify(
        {
          hydrated: true,
          elapsedMs: Date.now() - started,
          scope: "cold local Vite client bootstrap, not production performance",
        },
        null,
        2,
      ),
    );
  } finally {
    await bootstrap.close();
  }
});

test("real browser: unavailable live search reports failure instead of returning sample matches", async ({
  page,
}) => {
  const hydrationErrors = [];
  const recordHydrationError = (message) => {
    if (/hydration failed|hydrated but|didn't match|did not match/i.test(message))
      hydrationErrors.push(message);
  };
  page.on("pageerror", (error) => recordHydrationError(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") recordHydrationError(message.text());
  });
  await page.goto("/movies?q=Neon");
  // A cold Vite server can still be compiling browser dependencies after the
  // server-rendered page arrives. Wait for verified session hydration before
  // asserting a client-side query's outcome.
  await expect(page.locator('header[aria-busy="false"]')).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByText("Movie search is temporarily unavailable. Please try again."),
  ).toBeVisible();
  await expect(page.locator("article h3").filter({ hasText: "Neon Requiem" })).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search movies, actors, genres", exact: true })
    .fill("Neon");
  await expect(page.getByRole("button", { name: "Retry search", exact: true })).toBeVisible();
  expect(hydrationErrors).toEqual([]);
});

test("real browser HTTP: every protected server function denies anonymous calls", async ({
  page,
}) => {
  await page.goto("/login");
  const outcomes = await page.evaluate(async () => {
    const api = await import("/src/lib/cinebook.functions.ts");
    const calls = [
      ["favorites", () => api.getFavorites()],
      ["bookings", () => api.getUserBookings()],
      ["profile", () => api.getUserProfile({ data: {} })],
      ["admin", () => api.getAdminOverview()],
      ["ticket", () => api.getBooking({ data: { bookingId: "foreign-booking" } })],
      ["payment", () => api.createRazorpayOrder({ data: { bookingId: "foreign-booking" } })],
    ];
    const results = [];
    for (const [name, invoke] of calls) {
      try {
        await invoke();
        results.push({ name, denied: false });
      } catch (error) {
        results.push({ name, denied: String(error.message).startsWith("AUTH_REQUIRED:") });
      }
    }
    return results;
  });
  expect(outcomes).toHaveLength(6);
  expect(outcomes.every((outcome) => outcome.denied)).toBe(true);
});

test("real browser: offline catalogue is labeled and a movie card opens its detail page", async ({
  page,
}) => {
  await page.goto("/movies");
  await expect(page.getByText(/sample|demonstration/i).first()).toBeVisible();
  const card = page.locator('article a[href^="/movie/"]').first();
  await expect(card).toBeVisible();
  const title = await card.locator("h3").innerText();
  await card.click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(
    page.getByText("This is a sample movie from the demonstration catalog."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Watch Trailer" })).toBeVisible();
});

test("mocked TMDB RPC / actual UI: movie cards render while the active hero trailer is still loading", async ({
  page,
}) => {
  const { sourceLoader } = require("../helpers/source-loader.cjs");
  const { toMovie } = sourceLoader().load("src/lib/tmdb-map.ts");
  const first = toMovie({ id: 101, title: "Lazy trailer fixture", release_date: "2026-01-01" });
  const second = toMovie({ id: 102, title: "Second trailer fixture", release_date: "2026-01-01" });
  const lists = {
    nowPlaying: [first, second],
    popular: [first, second],
    topRated: [first],
    upcoming: [],
    source: "tmdb",
  };
  let release;
  const detailGate = new Promise((resolve) => {
    release = resolve;
  });
  let detailsRequested = 0;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await expect(page.locator('header[aria-busy="false"]')).toBeVisible();
  const endpoints = await page.evaluate(async () => {
    const api = await import("/src/lib/tmdb.functions.ts");
    return {
      lists: new URL(api.getMovieLists.url, location.origin).pathname,
      detail: new URL(api.getMovieDetail.url, location.origin).pathname,
    };
  });
  await page.route("https://www.youtube.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
  await page.route("**/_serverFn/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let result;
    if (path === endpoints.lists) result = lists;
    else if (path === endpoints.detail) {
      detailsRequested++;
      await detailGate;
      result = {
        movie: { ...first, trailer: "https://www.youtube.com/embed/fixture123" },
        cast: [],
        source: "tmdb",
      };
    } else return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result, context: {} }),
    });
  });
  try {
    await page.goto("/");
    await expect(page.locator('header[aria-busy="false"]')).toBeVisible();
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: first.title, exact: true }),
    ).toBeVisible();
    await expect(page.locator('article a[href="/movie/tmdb101"]').first()).toBeVisible();
    await expect.poll(() => detailsRequested).toBe(1);
    await page.getByRole("button", { name: "Watch Trailer", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `${first.title} trailer`, exact: true });
    await expect(dialog.getByText("Loading trailer…", { exact: true })).toBeVisible();
    // Keeping the modal open must stop the hero carousel changing its movie.
    await page.waitForTimeout(6500);
    await expect(dialog).toBeVisible();
    expect(detailsRequested).toBe(1);
    release();
    await expect(dialog.locator("iframe")).toHaveAttribute("src", /embed\/fixture123\?/);
    await dialog.getByRole("button", { name: "Close trailer" }).click();
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});

test("real browser: guest is denied admin dashboard and sees no private analytics", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Access Denied" })).toBeVisible();
  await expect(page.getByText("Recent bookings", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Admin Dashboard", exact: true })).toHaveCount(0);
});

test("real browser: legacy local-storage admin, favorites and bookings cannot authenticate a guest", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "cinebook:v1",
      JSON.stringify({
        user: {
          userId: "forged-admin",
          name: "Forged",
          email: "forged@example.test",
          role: "admin",
        },
        favorites: ["m1"],
        bookings: [{ id: "secret-legacy-booking", movieTitle: "Private legacy title" }],
        notifications: [{ id: "private-notification", title: "Private legacy notification" }],
      }),
    );
  });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Access Denied" })).toBeVisible();
  await page.goto("/favorites");
  await expect(page.getByRole("heading", { name: "Sign in to see your favorites" })).toBeVisible();
  await page.goto("/bookings");
  await expect(page.getByRole("heading", { name: "Sign in to see your bookings" })).toBeVisible();
  await expect(page.getByText("Private legacy title")).toHaveCount(0);
});

test("real browser: guest favorite action requests sign-in and never persists a favorite", async ({
  page,
}) => {
  await page.goto("/movies");
  const favorite = page.getByRole("button", { name: /^Add .+ to favorites$/ }).first();
  await expect(favorite).toBeVisible();
  await favorite.click();
  await expect(page.getByText(/sign in.*favorite/i).first()).toBeVisible();
  await page.goto("/favorites");
  await expect(page.getByRole("heading", { name: "Sign in to see your favorites" })).toBeVisible();
});

test("real browser and HTTP: sign-out endpoint is idempotent for a guest and profile remains private", async ({
  page,
}) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "You're not signed in" })).toBeVisible();
  const result = await page.evaluate(async () => {
    const api = await import("/src/lib/cinebook.functions.ts");
    await api.signOut();
    return api.signOut();
  });
  expect(result.ok).toBe(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "You're not signed in" })).toBeVisible();
});
