const test = require("node:test");
const assert = require("node:assert/strict");
const { sourceLoader } = require("./helpers/source-loader.cjs");

function middlewareHarness() {
  let middleware;
  const errors = [];
  sourceLoader(
    {
      "@tanstack/react-start": {
        createMiddleware: () => ({
          server: (handler) => {
            middleware = handler;
            return handler;
          },
        }),
        createCsrfMiddleware: () => ({}),
        createStart: (configure) => configure(),
      },
    },
    { console: { ...console, error: (...args) => errors.push(args) } },
  ).load("src/start.ts");
  return {
    run: (request, error, beforeThrow = () => {}) =>
      middleware({
        request,
        next: async () => {
          beforeThrow();
          throw error;
        },
      }),
    errors,
  };
}

test("actual request middleware: a disconnected client's aborted request is 499 and not logged as an app failure", async () => {
  const harness = middlewareHarness();
  const controller = new AbortController();
  const request = new Request("http://localhost/", { signal: controller.signal });
  const aborted = Object.assign(new Error("aborted"), { code: "ECONNRESET" });
  // Simulate a disconnect during downstream work, not an already aborted request.
  const { isCancelledRequest } = sourceLoader().load("src/lib/request-cancelled.ts");
  assert.equal(isCancelledRequest(request, aborted), false);
  assert.equal((await harness.run(request, aborted, () => controller.abort(aborted))).status, 499);
  assert.equal(isCancelledRequest(request, new Error("HTTPError", { cause: aborted })), true);
  assert.equal(harness.errors.length, 0);
});

test("actual request middleware: upstream resets and genuine failures remain 500 even after a client disconnects", async () => {
  const harness = middlewareHarness();
  const controller = new AbortController();
  const request = new Request("http://localhost/", { signal: controller.signal });
  assert.equal((await harness.run(request, new Error("aborted"))).status, 500);
  assert.equal(
    (await harness.run(request, new Error("Database failed"), () => controller.abort())).status,
    500,
  );
  assert.equal(harness.errors.length, 2);
});

test("actual server wrapper: disconnect aborts do not become internal errors", async () => {
  const errors = [];
  const controller = new AbortController();
  const request = new Request("http://localhost/", { signal: controller.signal });
  const aborted = new Error("aborted");
  const loader = sourceLoader(
    {
      "src/lib/error-capture.ts": { consumeLastCapturedError: () => null },
      "@tanstack/react-start/server-entry": {
        __esModule: true,
        default: {
          fetch: async () => {
            controller.abort(aborted);
            throw aborted;
          },
        },
      },
    },
    { console: { ...console, error: (...args) => errors.push(args) } },
  );
  const server = loader.load("src/server.ts").default;
  assert.equal((await server.fetch(request)).status, 499);
  assert.equal(errors.length, 0);
});

test("actual request middleware: Node body aborts are handled before srvx updates the Web Request signal", async () => {
  const harness = middlewareHarness();
  const request = new Request("http://localhost/");
  const incoming = { aborted: false, errored: null };
  request.runtime = { node: { req: incoming } };
  const error = Object.assign(new Error("aborted"), { code: "ECONNRESET" });
  const response = await harness.run(request, error, () => {
    incoming.aborted = true;
    incoming.errored = error;
  });
  assert.equal(request.signal.aborted, false);
  assert.equal(response.status, 499);
  assert.equal(harness.errors.length, 0);
});

test("actual error logger: only a cancelled request's framework abort is suppressed, including concurrent requests", async () => {
  const logs = [];
  const isolatedConsole = { ...console, error: (...args) => logs.push(args) };
  const loader = sourceLoader({}, { console: isolatedConsole });
  const { withRequest } = loader.load("src/lib/request-context.server.ts");
  loader.load("src/lib/error-capture.ts");
  const controller = new AbortController();
  const cancelled = new Request("http://localhost/cancelled", { signal: controller.signal });
  const active = new Request("http://localhost/active");
  const aborted = new Error("aborted");
  await Promise.all([
    withRequest(cancelled, async () => {
      await Promise.resolve();
      controller.abort(aborted);
      isolatedConsole.error("Server Fn Error!", aborted);
      isolatedConsole.error(new Error("Database failed"));
    }),
    withRequest(active, async () => {
      await Promise.resolve();
      isolatedConsole.error(aborted);
    }),
  ]);
  isolatedConsole.error(aborted);
  assert.equal(logs.length, 3);
  assert.match(logs[0][0], /Database failed/);
  assert.match(logs[1][0], /aborted/);
  assert.match(logs[2][0], /aborted/);
});
