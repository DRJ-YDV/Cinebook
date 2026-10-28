# Isolated automated regression tests

Run `npm test` with Node.js 24 and the project's installed dependencies.

These tests execute the real application TypeScript using the installed TypeScript compiler. The server-function builder is replaced only at the transport boundary; registered validators and handler bodies still execute. Session storage, the repository boundary for handler tests, and provider HTTP responses are explicitly mocked. Repository tests execute the actual repository with an isolated in-memory collection adapter. Payment signature tests use dummy credentials and real HMAC crypto.

The harness never loads `.env`, never inherits production secrets, and disables network requests by default. It cannot connect to the live MongoDB driver. No live records are created, updated or deleted, and no payment is initiated.

The in-memory adapter supports the MongoDB operators used by these cases and serializes transaction callbacks with snapshot rollback. Passing concurrency tests establish application intent within this model; they do not prove MongoDB replica-set transactions, driver behavior, unique-index deployment, cross-process races, or real provider capture/refund behavior. Those require separate integration checks against a disposable database and provider test environment.

Baseline command results are recorded in `audit/baseline-checks.json`. Live service checks, if performed separately, are not part of `npm test` and must be reported separately.

TMDB transport regressions use mocked HTTP responses against the real loading code. They cover retries restricted to the configured host, concurrent request sharing, optional trailers, partial failures and recovery after a failure cooldown. The persistence case creates a temporary directory under the ignored `.cache/` folder, exercises the actual filesystem cache, and removes its own files. It verifies restoration after a simulated server restart, expiry, malformed snapshots and exclusion of credentials. Request-cancellation cases execute the real middleware/server wrapper with isolated transport boundaries; genuine application errors remain server errors.

## Retained real browser suite

`npm run test:e2e` uses the installed Microsoft Edge channel and an isolated development server at port 4180. Public cases deliberately disable all live DB, payment and TMDB credentials, then test actual rendering and local server-function authorization. They verify that sample data is labeled; they do not prove the live TMDB service.

A separately gated database case uses two distinct Playwright browser contexts. It runs only when `MONGODB_TEST_URI` and `MONGODB_TEST_DB` are explicitly present in the test-process environment, the URI parses, and the database name starts with `cinebook_audit_`. It never uses the normal application URI automatically. Only exact test-owned fixtures are cleaned up; no database is dropped. If the connection prerequisite fails, the test is marked skipped with a reason, not passed.

The retained real-DB browser case uses pending booking fixtures to test ownership/refresh/logout. It does not simulate a real captured gateway payment. Actual checkout, provider capture/refund, replica-set transaction races, real paid-ticket rendering and administrator login require additional service-backed execution after the prerequisites in `audit/REPORT.md` are resolved.

Final individual results and limits are in `audit/TEST-RESULTS.md` and `audit/final-results.json`.

## Administrator dashboard regressions

`admin-analytics.test.cjs` executes the actual server aggregation pipeline with the isolated collection adapter. Its small aggregation interpreter covers the operators used by these cases; it does not substitute for MongoDB behavior or load testing. Cases cover more than 500 bookings, distinct account counts, paid/cancelled/refund states, India-midnight chart boundaries, unlinked legacy bookings, honest empty values and database failures.

`e2e/admin-dashboard.spec.cjs` explicitly replaces RPC responses in Playwright to exercise the real login UI, administrator redirect, metrics, customer rows, search, refresh, desktop/mobile layout and error recovery. Those cases do not authenticate a real administrator, change a database role or initiate a payment. The public browser authorization checks still call the actual server without mocks. A separate read-only application-database aggregation check is recorded in `audit/admin-live-check.json`; current dashboard change evidence is in `audit/ADMIN-DASHBOARD.md`.
