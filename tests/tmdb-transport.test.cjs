const test = require("node:test");
const assert = require("node:assert/strict");
const { sourceLoader } = require("./helpers/source-loader.cjs");
const movie = { id: 101, title: "Fixture live movie", release_date: "2026-01-01", genre_ids: [18] };
function apiWith(fetch, options = {}) {
  return sourceLoader(
    {},
    {
      ...options,
      env: { TMDB_ACCESS_TOKEN: "isolated-dummy-token", TMDB_CACHE_FILE: "", ...options.env },
      fetch,
    },
  ).load("src/lib/tmdb.server.ts");
}

test("mocked TMDB transport: a connection reset retries only the existing authorized host", async () => {
  let count = 0;
  const api = apiWith(async (url, options) => {
    assert.equal(new URL(url).hostname, "api.themoviedb.org");
    assert.ok(options.signal);
    assert.equal(options.redirect, "error");
    if (++count === 1) throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
    return Response.json({ results: [movie] });
  });
  const rows = await api.fetchList("popular");
  assert.equal(count, 2);
  assert.equal(rows[0].id, 101);
});

test("mocked TMDB transport: concurrent requests for the same list share one retry sequence", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const api = apiWith(async () => {
    calls++;
    await gate;
    return Response.json({ results: [movie] });
  });
  const requests = Array.from({ length: 8 }, () => api.fetchList("popular"));
  assert.equal(calls, 1);
  release();
  const results = await Promise.all(requests);
  assert.ok(results.every((rows) => rows[0].id === movie.id));
});

test("mocked TMDB catalogue: concurrent page loads share five list/genre requests without waiting for trailers", async () => {
  const calls = [];
  const api = apiWith(async (url) => {
    const pathname = new URL(url).pathname;
    calls.push(pathname);
    if (/\/movie\/\d+$/.test(pathname)) throw new Error("Catalogue must not load optional details");
    return Response.json(pathname.includes("/genre/") ? { genres: [] } : { results: [movie] });
  });
  const results = await Promise.all(Array.from({ length: 8 }, () => api.loadMovieLists()));
  assert.equal(calls.length, 5);
  assert.ok(results.every((lists) => lists.source === "tmdb" && lists.popular[0].id === "tmdb101"));
});

test("mocked TMDB catalogue: failed batches have a short cooldown and then recover", async () => {
  let now = Date.now();
  let online = false;
  let calls = 0;
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  const api = apiWith(
    async (url) => {
      calls++;
      if (!online) return Response.json({}, { status: 401 });
      return Response.json(
        new URL(url).pathname.includes("/genre/") ? { genres: [] } : { results: [movie] },
      );
    },
    { Date: Clock },
  );
  assert.equal((await api.loadMovieLists()).source, "fallback");
  online = true;
  assert.equal((await api.loadMovieLists()).source, "fallback");
  assert.equal(calls, 5);
  now += 10_001;
  const recovered = await api.loadMovieLists();
  assert.equal(recovered.source, "tmdb");
  assert.equal(recovered.error, undefined);
  assert.equal(calls, 10);
});

test("actual catalogue cache: a fresh server preserves real movies through an API outage without storing credentials", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const cacheDirectory = path.resolve(__dirname, "../.cache");
  fs.mkdirSync(cacheDirectory, { recursive: true });
  const directory = fs.mkdtempSync(path.join(cacheDirectory, "test-tmdb-"));
  const file = path.join(directory, "catalogue.json");
  try {
    const online = apiWith(
      async (url) =>
        Response.json(
          new URL(url).pathname.includes("/genre/") ? { genres: [] } : { results: [movie] },
        ),
      { env: { TMDB_CACHE_FILE: file } },
    );
    assert.equal((await online.loadMovieLists()).source, "tmdb");
    const contents = fs.readFileSync(file, "utf8");
    assert.ok(!contents.includes("isolated-dummy-token"));
    assert.ok(!contents.includes("api_key"));
    const offline = apiWith(async () => Response.json({}, { status: 401 }), {
      env: { TMDB_CACHE_FILE: file },
    });
    const saved = await offline.loadMovieLists();
    assert.equal(saved.source, "tmdb");
    assert.equal(saved.popular[0].id, "tmdb101");
    assert.match(saved.error, /401/);
    assert.equal(
      fs.readFileSync(file, "utf8"),
      contents,
      "failed refresh must not overwrite good data",
    );

    const cache = sourceLoader({}, { env: { TMDB_CACHE_FILE: file } }).load(
      "src/lib/tmdb-catalogue-cache.server.ts",
    );
    const expired = JSON.parse(contents);
    expired.at = Date.now() - 8 * 24 * 60 * 60 * 1000;
    fs.writeFileSync(file, JSON.stringify(expired));
    assert.equal(await cache.readCatalogueCache(), null);
    fs.writeFileSync(file, "broken JSON");
    assert.equal(await cache.readCatalogueCache(), null);
    const invalid = JSON.parse(contents);
    invalid.lists.popular[0].tmdbId = -1;
    fs.writeFileSync(file, JSON.stringify(invalid));
    assert.equal(await cache.readCatalogueCache(), null);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
});

test("mocked TMDB transport: unavailable genre metadata does not discard valid search results", async () => {
  const api = apiWith(async (url) =>
    new URL(url).pathname.includes("/genre/")
      ? Response.json({}, { status: 503 })
      : Response.json({ results: [movie] }),
  );
  const rows = await api.loadSearch("Fixture");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "tmdb101");
  assert.equal(rows[0].genre[0], "Unspecified");
});

test("mocked TMDB transport: failed live search throws an explicit error instead of dummy matches", async () => {
  const api = apiWith(async (url) =>
    new URL(url).pathname.includes("/genre/")
      ? Response.json({ genres: [] })
      : Response.json({}, { status: 503 }),
  );
  await assert.rejects(api.loadSearch("Neon"), /TMDB request failed \(503\)/);
});

test("mocked TMDB transport: one failed movie list preserves the other real lists", async () => {
  const api = apiWith(async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname.includes("/genre/")) return Response.json({ genres: [{ id: 18, name: "Drama" }] });
    if (pathname.endsWith("/upcoming")) return Response.json({}, { status: 503 });
    return Response.json(/\/movie\/\d+$/.test(pathname) ? movie : { results: [movie] });
  });
  const lists = await api.loadMovieLists();
  assert.equal(lists.source, "tmdb");
  assert.equal(lists.nowPlaying[0].id, "tmdb101");
  assert.equal(lists.popular.length, 1);
  assert.equal(lists.topRated.length, 1);
  assert.equal(lists.upcoming.length, 0);
  assert.match(lists.error, /503/);
});
