const test = require("node:test");
const assert = require("node:assert/strict");
const { sourceLoader } = require("./helpers/source-loader.cjs");
const { repositoryFixture } = require("./helpers/fixtures.cjs");

test("pure TMDB mapping: missing runtime and certification stay unknown rather than invented", () => {
  const { toMovie } = sourceLoader().load("src/lib/tmdb-map.ts");
  const unknown = toMovie({ id: 12345, title: "Fixture", release_date: "2026-01-01" });
  assert.equal(unknown.duration, 0);
  assert.equal(unknown.certification, "NR");
  const known = toMovie({
    id: 12345,
    runtime: 132,
    release_dates: {
      results: [{ iso_3166_1: "IN", release_dates: [{ certification: "UA 13+" }] }],
    },
  });
  assert.equal(known.duration, 132);
  assert.equal(known.certification, "UA 13+");
});

test("pure rules: showtimes use India time and reject malformed dates and calendar rollover", () => {
  const { showStartsAt } = sourceLoader().load("src/lib/booking-rules.ts");
  assert.equal(showStartsAt("2026-10-25", "07:30 PM"), "2026-10-25T14:00:00.000Z");
  assert.equal(showStartsAt("2026-02-31", "07:30 PM"), null);
  assert.equal(showStartsAt("2026-10-25", "25:30 PM"), null);
  assert.equal(showStartsAt("not-a-date", "07:30 PM"), null);
});

test("pure rules: seat validation rejects duplicate, invalid and oversized selections", () => {
  const { validSeatCodes } = sourceLoader().load("src/lib/booking-rules.ts");
  const config = { rows: ["A", "B"], seatsPerRow: 12, categories: [] };
  assert.equal(validSeatCodes(["A1", "B12"], config), true);
  for (const seats of [
    ["A1", "A1"],
    ["A0"],
    ["A01"],
    ["A13"],
    ["C1"],
    [],
    Array.from({ length: 11 }, (_, i) => `A${i + 1}`),
  ])
    assert.equal(validSeatCodes(seats, config), false);
});

test("pure pricing: client preview matches server fees, taxes, discount caps and ticket subtotal", () => {
  const { computePrice } = sourceLoader().load("src/lib/pricing.ts");
  const { repository } = repositoryFixture();
  const capped = {
    code: "AUDIT",
    title: "Fixture",
    description: "Fixture",
    icon: "ticket",
    active: true,
    type: "percent",
    value: 50,
    max: 80,
  };
  const flat = { ...capped, type: "flat", value: 500 };
  for (const offer of [null, capped, flat]) {
    const preview = computePrice([100, 200], offer);
    const authoritative = repository.priceBreakdown([100, 200], offer);
    assert.deepEqual(
      JSON.parse(JSON.stringify(preview)),
      JSON.parse(JSON.stringify(authoritative)),
    );
  }
  const discounted = computePrice([100, 200], capped);
  assert.equal(discounted.tickets, 300);
  assert.equal(discounted.fee, 50);
  assert.equal(discounted.taxes, 21);
  assert.equal(discounted.discount, 80);
  assert.equal(discounted.total, 291);
  assert.equal(computePrice([100, 200], flat).total, 71);
});
