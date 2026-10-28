# CineBook full-stack workflow audit and fixes

> Update, 26 October 2026: read-only MongoDB connectivity and the new all-time admin aggregation now succeed. A dedicated administrator dashboard and role-based login destination were added. See `audit/ADMIN-DASHBOARD.md` for current metrics, tests, account setup and limits; the report below preserves the original 25 October audit snapshot.

Audit date: 25 October 2026. Scope: the existing application in this workspace, safe local browser checks, actual application code executed with isolated database/provider mocks, and read-only external connectivity checks. This report does not certify unexecuted live workflows.

## 1. Executive summary

The application had serious access-control and data-integrity defects. The audit repaired server ownership checks, administrator authorization, plaintext browser-account fallback, shared favorites, false local booking/payment success, seat-hold races, payment order binding and misleading refund states. The existing React/TanStack, MongoDB, TMDB and Razorpay architecture and visual design were preserved.

Final executed results: **47 isolated regression tests passed; 7 real public/guest browser tests passed; 1 real-database browser test was skipped.** TypeScript, the Node production build and lint passed. Lint retains nine nonblocking Fast Refresh warnings. A generated-public-asset scan found no matches for six configured secret values across 34 assets.

**Production readiness remains BLOCKED.** The MongoDB URI initially could not parse because credentials contained an unescaped `@`. URL encoding was corrected while preserving the host and decoded credential values, with an ignored local backup. The subsequent actual driver connection was rejected by Atlas with `MongoServerError` code `8000`. Real registration, persistence, transaction/index behavior and administrator login therefore remain unverified. Actual Razorpay checkout/capture was not performed. Webhook/refund reconciliation and real cinema inventory are still prerequisites for real-money use.

The restarted application was also checked in a fresh guest Edge browser at port 8081: HTTP 200, 53 live TMDB movie cards, no sample fallback notice and no browser errors. Evidence: `audit/running-app-check.json`.

No real accounts, bookings or payment records were modified. No seed, database reset, production deployment, real payment or credential rotation was performed.

## 2. Architecture discovered

- Frontend: React 19, TypeScript, Tailwind/Radix components and TanStack Router file routes. React Query owns server-data caching. The official Router/Query SSR integration now transfers each request's query snapshot to the client; no process-global private query cache is introduced. Fallback catalogue retries start on the existing interval rather than changing the retry notice during initial hydration.
- Backend: TanStack Start server functions in `src/lib/cinebook.functions.ts` and `tmdb.functions.ts`. Inputs are parsed on the server; protected functions derive identity from session storage.
- Authentication: the existing encrypted HttpOnly/SameSite cookie is retained. It now carries a random session token whose SHA-256 digest, owner and expiration are stored in a new `sessions` collection. Every private request checks the record and current database user/role. Cookie clearing plus record deletion revokes logout replay.
- Passwords: new database accounts use salted PBKDF2-HMAC-SHA256, 600,000 iterations, with timing-safe comparison. Legacy records without the iteration field retain the old 100,000-iteration verification path. New registrations always receive the normal user role. This work factor follows [OWASP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- MongoDB: the official Node driver, global connection pool, typed repository helpers and required indexes. AsyncLocalStorage propagates a driver session through repository operations inside multi-document transactions.
- TMDB: server credentials, bounded request retries, cache, movie mapping, lists/details/search and labeled sample fallback. Movie metadata remains TMDB-owned.
- Razorpay: server-created order, owned persisted pending booking, stored order binding, server HMAC verification and a provider read requiring captured status, exact INR amount and matching payment/order IDs.
- Ticket: owner-checked server booking, confirmed-and-paid eligibility and server-provided QR payload. The existing design and downloadable ticket remain demonstration assets, not real cinema admission credentials.
- Deployment: default production output is now `node-server`; the explicit Node build command is PowerShell-compatible. Lovable may pin its own edge preset; that does not make the Node MongoDB driver compatible with edge hosting.

## 3. Workflow inventory and actual paths

The pre-change inventory, route/function/collection mapping and initial problems are preserved in `audit/INITIAL-INVENTORY.md`. Current classifications below include the scope of evidence.

- **Registration/login — WORKING WITH LIMITATIONS.** `/login` form → server validation → authentication limiter → normalized user lookup/password hash → database user → rotated server session → verified client user. Actual user/password logic passes isolated tests; real MongoDB registration/login is BLOCKED by database authentication.
- **Session refresh/new tab/logout — WORKING WITH LIMITATIONS.** AppProvider calls `getCurrentUser`, clears private caches when identity changes and listens for focus/cross-tab changes. Server session expiry/rotation/revocation tests pass. Guest refresh/logout is browser-tested; real authenticated new-tab behavior awaits a valid test database.
- **Administrator setup — WORKING WITH LIMITATIONS.** Normal registration → deliberate local setup script → stored admin role plus optional designated-email restriction → normal login. No real administrator was promoted or logged in during the audit.
- **Admin dashboard and mutations — WORKING WITH LIMITATIONS.** Verified client session controls navigation; each administrative server function independently runs `requireAdmin`. Real guest dashboard/HTTP denial and isolated normal-user denial pass. Real administrator access is BLOCKED by MongoDB/setup prerequisites.
- **Profile — WORKING WITH LIMITATIONS.** `/profile` → awaited `updateUserProfile` → current session ID → allowed name/phone/city patch → users → UI update. Forged IDs/roles are ignored; isolated tests pass. Live persistence is BLOCKED.
- **Favorites — WORKING WITH LIMITATIONS.** Movie heart → validated identity-aware action → `addFavorite`/`removeFavorite` → unique user/movie record → server response → scoped query cache. No local success fallback remains. Isolated persistence/duplicate/removal tests and real guest denial pass; actual MongoDB persistence is BLOCKED.
- **My Bookings — WORKING WITH LIMITATIONS.** Server identity → `getUserBookings` database filter → state-aware booking DTO → page. No shared device mirror is merged. Owner boundaries and statuses pass isolated tests; live history/new-device verification is BLOCKED.
- **Ticket/QR — WORKING WITH LIMITATIONS.** `/ticket/$bookingId` → owner-checked `getBooking` → only CONFIRMED/PAID data may supply a QR → ticket view. Pending/failed records cannot become confirmed tickets from localStorage. Isolated ownership/QR gating passes. Real paid-ticket/browser QR verification is BLOCKED; QR failure now has a retry state.
- **Movie browse/details — WORKING WITH LIMITATIONS.** A live TMDB loader check returned 20 now-playing, popular, top-rated and upcoming movies with real IDs. A separate browser run with credentials intentionally disabled verified labeled sample browsing and detail navigation. Missing runtime, language/genre metadata and certification now remain explicitly unknown instead of receiving invented values. An intermittent reset was observed again during final live checks; three lists and detail metadata still loaded. After fixing search to run independently of genre metadata, a repeat live check returned 12 real search matches and 20 upcoming movies. Other filters/media rendering were source-inspected; not every live trailer, release/certification or cast image was manually checked.
- **Theatres/screens/showtimes — WORKING WITH LIMITATIONS.** Database theatres/screens → shared deterministic schedule → server materialization from trusted records → immutable show. Browser hints cannot set price/screen/format. Empty/error results no longer silently show bundled theatres. Actual database relationships and persisted schedule behavior are BLOCKED; generated schedules remain demonstration inventory.
- **Seats — WORKING WITH LIMITATIONS.** Authoritative show layout → database taken seats/active holds → conditional atomic reservation → validated conditional commitment in a transaction. Invented 26% occupancy was removed. Application race/expiry/validation tests pass in the isolated model; actual replica-set/cross-process behavior is BLOCKED.
- **Checkout/booking — WORKING WITH LIMITATIONS.** User-owned checkout → server amount and offer eligibility → temporary hold → pending booking/payment transaction → idempotency key → order lease. No database outage can produce a local confirmed ticket. Isolated pricing/idempotency/rollback tests pass; real booking end to end is BLOCKED.
- **Razorpay — WORKING WITH LIMITATIONS.** HMAC uses the stored order; provider capture/amount/currency are checked before confirmation. Offline real crypto and explicitly mocked provider transport tests pass. Actual provider order/checkout/capture is NOT YET TESTED.
- **Cancellation/refunds — WORKING WITH LIMITATIONS.** Owner authorization → conditional transaction → seat release → CANCELLED plus FAILED or REFUND_PENDING. Paid cancellation never claims a completed refund. The gateway refund execution/reconciliation feature is NOT IMPLEMENTED.
- **Offers — WORKING WITH LIMITATIONS.** Database-listed code → server-side amount/eligibility validation. FIRST100/weekday rules are enforced; the card-specific MOVIE10 offer is rejected until card eligibility is configured. No client code can set authoritative discount/payment amount. Live offer persistence is BLOCKED.
- **Notifications/preferences — WORKING WITH LIMITATIONS.** City remains a device preference; reminder notices explicitly last for the current sign-in session and clear on identity change. There is no real notification scheduling or delivery service. No previous account's personal reminders remain visible after logout.
- **Reviews/ratings — WORKING WITH LIMITATIONS.** TMDB headline ratings are used when available; the existing review examples/distribution are labeled illustrative. No review-submission backend exists.
- **Full CRUD management/scanner/password reset — NOT IMPLEMENTED where absent.** No new full user/movie/screen CRUD dashboard, real cinema scanner, email verification/reset delivery or webhook handler was invented and then labeled broken.

## 4. Critical bugs fixed and evidence

1. **Browser-selected private identity.** Profile/favorites/ticket/payment endpoints accepted user IDs or lacked owner checks. The boundary now verifies the current session, strips untrusted fields and checks booking.userId before reads or mutations. Tests execute the real handlers against forged A/B IDs and assert no foreign side effects. Relevant files: auth.server.ts, cinebook.functions.ts, store.tsx and private routes.
2. **Incomplete admin protection/role escalation.** Administrative writes lacked a shared guard and allowlisted registration could auto-promote. All existing admin operations now require the current database admin role; signup ignores submitted roles and always creates a normal user. Controlled one-account promotion replaces the broken dotenv-dependent script. Normal-user/anonymous tests cover writes, analytics and seeding; browser tests reject forged localStorage admin state.
3. **Plaintext local accounts and shared private state.** Database outages previously authenticated local plaintext accounts; favorites/bookings/notifications survived identity changes. Authentication now fails visibly when persistence fails. Legacy passwords are stripped from browser metadata, and private state/cache is cleared at identity transitions. The browser test injects legacy administrator/favorite/booking data and verifies no access.
4. **Favorites heart without persistence.** Writes were ignored on failure and MongoDB state was never loaded. Favorites now read the current account's collection, await writes, preserve uniqueness and update the UI only after a server response. Concurrent duplicate add and cross-user removal tests pass using the actual repository with isolated storage. Guest clicks require sign-in. Buttons wait for session/favorite hydration to prevent inert clicks and inaccurate initial hearts.
5. **False payment/booking success.** Mock confirmation and standalone client-amount endpoints could bypass persisted checkout; outages created local confirmed tickets. Those legacy endpoints now fail closed. Checkout requires an owned pending booking, server amount, provider order and verified payment. Handler tests reject every bypass and assert trusted amount/order/capture sequencing.
6. **Seat price and expired-hold races.** Arbitrary hints could set price and expired holds could commit over newer reservations. Server show generation ignores untrusted prices, validates full seats and rechecks active ownership during conditional commitment. Cross-document changes are transactional; expired captured payments enter refund review. Isolated competing reservation/rollback/late-capture tests pass.
7. **Payment replay/order mismatch and fake refunds.** A database lease prevents competing order creation; stored IDs and exact amount/currency bind verification. Duplicate callbacks are idempotent and conflicting payment IDs are rejected. Paid cancellation records REFUND_PENDING instead of unperformed REFUNDED. Provider transport remains mocked in these tests.
8. **Misleading fallback/loading states.** Unpaid bookings were rendered confirmed, DB errors were disguised as local success, empty theatre/offer results became bundled records and the first guest admin visit could remain blank. Status-aware rendering, visible errors, session-based admin gating, explicit sample labels and guarded favorite hydration fix these paths. The seven public browser checks pass, including explicit search-failure feedback and a hydration-error assertion.
9. **Ignored uniqueness errors and deployment mismatch.** Index failures were swallowed and the Windows Node build command used shell syntax that did not work in PowerShell. Required-index failures now stop unsafe writes; a cross-platform build script and Node preset produce the correct server artifact. No live indexes were created because database authentication is blocked.
10. **Vulnerable validation dependency.** The dependency audit identified the high-severity constrained-array memory-exhaustion advisory [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Zod was updated to 4.6.7 and all installed consumers deduplicate to the patched version. The actual validation/handler regression suite and TypeScript check pass after the update. The refreshed npm advisory scan reports zero known vulnerabilities; it is not a guarantee that no undisclosed vulnerability exists.
11. **Initial client startup and header-search feedback.** Browser traces showed requests waiting for Vite's dependency crawl, even though the HTTP page was ready. The dev configuration now releases optimized modules without waiting for the complete crawl and explicitly includes the query integration dependencies. This uses Vite's documented [dependency optimization options](https://vite.dev/config/dep-optimization-options#optimizedeps-holduntilcrawlend); it does not change production bundling. The browser harness separately waits for actual guest hydration and records its duration. Header search now distinguishes short input, no matches and service failure, includes retry, and uses unique accessible IDs for its two responsive instances. The focused browser check passed after these changes, including an assertion against hydration errors.

## 5. Authentication and admin configuration

Required session configuration is `SESSION_SECRET`; admin designation is `CINEBOOK_ADMIN_EMAIL`. Role and email are checked server-side. The email alone cannot promote an account. New accounts receive `user`; the setup command only promotes the reviewed, already-registered designated account when `--apply` is explicitly supplied.

Follow `DEPLOYMENT.md`: restore Atlas database authentication, set the designated email, register normally, confirm account ownership, run `node promote-admins.cjs` (dry-run), then deliberately run `node promote-admins.cjs --apply`. Do not promote an unknown claimant: email verification delivery is not implemented. Existing legitimate database admin roles remain supported if no designated email is configured. When the variable is present, the stored role and matching email are both necessary.

No source file contains a hardcoded administrator password. Authenticated sessions have a seven-day maximum, store only token hashes in MongoDB, rotate on login and revoke on logout. The limiter covers account/IP attempts within one process; a shared upstream limiter is still required for a multi-instance deployment.

## 6. Data-isolation results

**PASS, isolated actual-code tests:** session identity replaces forged userId/email on profile, favorites and booking creation; user B cannot fetch/cancel/pay/fail user A's booking; only current-user queries are used; nonconfirmed QR fields are suppressed; a deleted or expired session cannot authenticate; changing a database role immediately changes authorization; replay after logout fails.

**PASS, real guest browser/HTTP:** injected localStorage admin/favorites/bookings do not authenticate; private pages show sign-in/access denial; protected server-function calls reject guests; same-origin direct HTTP reads return 200 for currentUser(null) and 401 for favorites/bookings/admin analytics. Cross-origin metadata is rejected with 403 by the retained CSRF middleware.

**BLOCKED, real two-account persistence:** the retained Playwright test creates separate browser contexts, registers separate accounts, verifies persisted favorites and private booking fixtures across reload, checks denied admin access and replays a logged-out cookie. It was skipped because explicit isolated test DB credentials were not supplied and the read-only application DB check was rejected. It must be executed against a working `cinebook_audit_` database; the isolated-model results do not substitute for it.

## 7. Favorites audit

The actual path is MovieCard/movie detail → store.toggleFavorite → authenticated add/remove function → repository using session user ID → `favorites` upsert/delete → returned list → account-scoped React Query cache. Reads use getFavorites with no client ownership ID. A compound unique `(userId, tmdbId)` index prevents duplicates. Client and server movie IDs must agree.

A failed request leaves the heart unchanged and displays an error. Logging out clears private query state; another session loads its own list. Unknown cached movies are resolved through TMDB on the favorites page; stored title/poster metadata provides an unavailable-details fallback with a working remove action. Add/remove are disabled while the relevant state is loading or that movie's request is pending.

The actual repository passed isolated add/read/remove/concurrent-duplicate and user A/B query tests. **The live collection is not claimed to contain a successfully persisted favorite from this audit.** Atlas authentication must be fixed before that acceptance criterion can pass.

## 8. Booking, seats, payments and tickets

The browser selects a show and seats but cannot establish identity or total. The server validates the current user, loads/materializes a trusted show, validates future India-time scheduling and screen/format relationships, checks distinct configured seats and calculates tickets/fees/taxes/discounts. A repeated matching checkout key reuses one pending reservation; a different payload with that key is rejected.

Holds are conditional single-document updates, and booking/payment writes and final transitions use MongoDB transactions. Expired/reassigned holds cannot be committed by an old payment. A captured payment that cannot receive seats is recorded for refund review rather than producing a ticket or stealing another customer's seats. A fresh empty seat record shows all seats free; no synthetic occupancy is added.

Razorpay order creation uses the persisted total in paise, INR, a booking association and a database order-creation lease. Verification requires the session owner, stored order, HMAC-SHA256 signature and a read of the provider's captured payment with matching amount/currency/order/payment IDs. Invalid signatures do not mutate unrelated bookings. The design follows the [official Standard Checkout verification flow](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/).

The ticket route fetches the owner's database booking and renders a QR only after CONFIRMED/PAID. It no longer trusts a locally fabricated ticket or the `new=true` URL flag to establish success. QR content contains booking/show/seats/movie/amount metadata, not passwords, contact information or payment secrets. It is not a signed offline admission system; no real scanner backend exists. QR-generation failure presents a retry instead of an infinite placeholder.

**Actual provider checkout/capture, live MongoDB transactions, real ticket scanning, webhook delivery and gateway refunds are unverified or absent.** No real payment was made, and no mocked response is represented as live-provider evidence.

## 9. MongoDB audit and migration safety

Collections and ownership:

- `users`: normalized email, generated userId, password hash/salt/iteration count and trusted stored role. Unique email/userId indexes are required.
- `sessions`: hashed token ID, userId and expiration. New collection; old cookie-only sessions require reauthentication. Expired rows are denied even if a cleanup job has not removed them.
- `theatres`/`screens`/`shows`: validated IDs/relationships, supported formats, future India-time starts, authoritative price/layout and immutable published show definitions.
- `show_seats`: one unique showId document with sold seats and expiring hold references; no generated sold-seat baseline.
- `bookings`: authenticated userId, cached movie label, trusted show/seat/amount fields, idempotency key, booking/payment status and QR metadata.
- `payments`: one booking association, trusted amount/INR, stored provider IDs, order-creation lease and truthful status. Unique string order/payment references exclude missing legacy fields.
- `favorites`: authenticated userId plus tmdbId/movieId and small display cache; compound uniqueness matches actual queries.
- `offers`: admin-controlled configuration; server eligibility/price validation.
- `meta`: existing metadata namespace, not a substitute for authentication.

A pooled MongoClient is reused. Transaction sessions flow through repository reads and writes. Driver transaction retries preserve transient transaction errors; errors shown to clients are sanitized. Duplicate/index conflicts do not become fake success. Required indexes are checked before affected writes; failures stop the operation instead of being ignored.

MongoDB documents that single-document conditional writes are atomic and multi-document consistency requires transactions: [atomicity and transactions](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/). **These changes were tested in a serialized in-memory transaction model, not against an authenticated live replica set.** Restore a valid database connection and verify transaction support, indexes and cross-process races before release.

No destructive migration was executed. Existing duplicate records must be inspected and reconciled without arbitrary deletion. New partial indexes omit missing legacy optional fields. Legacy `userId: null` bookings remain preserved but inaccessible until a reviewed migration associates them with verified accounts; the server will not accept browser email claims. Historical mock/locally confirmed payments and old REFUNDED labels require review before financial reporting. No data was retroactively marked paid.

## 10. Executed test results

Individual test names and outcomes are recorded in `audit/TEST-RESULTS.md`; assertions live in `tests/` and full command logs in `audit/`.

- **PASS — TypeScript:** `npx tsc --noEmit`, exit 0.
- **PASS — Production build:** `npm run build`, exit 0, Nitro `node-server` artifact `.output/server/index.mjs` exists. The cross-platform explicit `npm run build:node` also passed during the audit. Existing module-directive/chunk/plugin-timing warnings remain nonfatal.
- **PASS — Lint:** `npm run lint`, exit 0, zero errors and nine nonblocking Fast Refresh export warnings. Baseline was 114 errors and nine warnings; formatting, the server-session alias and a redundant nullish expression were corrected.
- **PASS — Isolated automated suite:** `npm test`, 47 executed, 47 passed, zero skipped/failed. These execute actual source handlers/repositories; transport/session/database/provider boundaries are explicitly mocked. Real HMAC crypto is used with dummy credentials.
- **PASS — Dependency advisory scan:** `npm audit --json`, zero known vulnerabilities after updating Zod to 4.6.7; all installed consumers use that patched version. Evidence: `audit/npm-audit.json`.
- **PASS — Real Edge browser:** seven executed public/guest tests passed, including actual local server-function calls, sample labels/detail navigation, admin denial, forged legacy localStorage, guest favorites feedback and guest logout/profile protection. The test server intentionally has no live database/payment/TMDB credentials; these are not live-provider/persistence checks.
- **BLOCKED — Real DB browser isolation:** one retained test skipped because a deliberately isolated test DB was not configured. The read-only application DB probe returned MongoServerError 8000 after URI parsing was repaired. No live test fixture or real customer record was written.
- **PASS — Actual local HTTP status check:** same-origin unauthenticated `getCurrentUser` returned 200/null; favorites, bookings and admin analytics returned 401 with AUTH_REQUIRED. A request carrying cross-origin metadata returned 403. These results are recorded separately from mocked-handler tests.
- **PASS — Client secret scan:** 34 generated public assets checked for six configured secret values; zero matches. This checks the current output, not unavailable Git history or arbitrary past publications.
- **PASS with service limitation — Live TMDB checks:** an earlier actual loader returned 20 records in each of four lists. A later run encountered ECONNRESET and retained three successful lists plus detail metadata (148-minute runtime, 10 cast members and trailer/poster metadata). After search was decoupled from genre metadata, the recorded repeat returned 12 live search matches and 20 upcoming movies. Files: `audit/live-tmdb-check.json` and `audit/live-tmdb-recheck.json`. Actual media playback was not tested.
- **NOT YET TESTED — Actual Razorpay capture/refund:** no real checkout/payment, provider capture callback, webhook or refund was run. Test credentials being present is not proof of a completed provider transaction.
- **PASS — Restarted application with configured TMDB:** actual guest browser at port 8081 hydrated and displayed 53 live movie cards, with no sample notice or browser errors. This verifies current live catalogue rendering, not authenticated MongoDB persistence or media playback. Evidence: `audit/running-app-check.json`.
- **PASS — Production-build Edge smoke:** actual Node output returned HTTP 200, hydrated and showed the correct search failure without unrelated samples or browser errors (1757 ms). Credentials were disabled, and the temporary server was stopped. Evidence: `audit/production-browser-smoke.json`.
- **PASS — Audit overview type check:** the standalone audit overview compiled against the installed canvas SDK with zero TypeScript errors.

Browser checks exposed a blank first guest admin visit, a favorite click before hydration, a fallback retry-notice hydration mismatch and an initial development dependency-crawl stall. The failures were inspected and fixed, then the relevant checks were rerun. Functional checks explicitly wait for the real client to hydrate; cold development startup duration is separate evidence in `audit/browser-startup.json`, not a production-performance result. Earlier failed runs are not counted as passes.

### Acceptance criteria with evidence scope

- Normal users register/login: **BLOCKED live**, PASS isolated password/role/input tests.
- Configured admin authenticates/accesses features: **BLOCKED live**, setup variable/account and valid DB required.
- Admin setup documented: **PASS**, DEPLOYMENT.md and reviewed dry-run script.
- Ordinary users denied admin routes: **PASS isolated normal-user guard**, PASS real guest browser; authenticated normal-user browser remains BLOCKED.
- Ordinary users denied admin functions: **PASS isolated real handlers**, live normal-user HTTP awaits DB.
- Browser role manipulation cannot grant privilege: **PASS**, real legacy-localStorage browser test plus server role checks.
- Logout protects subsequent requests: **PASS isolated token-replay tests**, PASS real guest logout; real authenticated browser replay remains BLOCKED.
- Each user sees only own bookings/favorites: **PASS isolated queries/handlers**, BLOCKED live two-user persistence test.
- Booking detail/ticket/QR ownership: **PASS isolated real handler assertions**, BLOCKED real paid-ticket browser test.
- User identity derived from session: **PASS**, forged IDs stripped in executed boundary tests.
- Favorites add/remove persist to MongoDB: **BLOCKED live**; actual repository behavior passes mocked persistence assertions.
- Favorites survive new sessions/refresh: **BLOCKED live**; retained separate-context test is ready.
- Duplicate favorites prevented: **PASS isolated concurrent upsert test**, BLOCKED actual unique-index deployment.
- Another account cannot alter favorites: **PASS isolated owner-derived handlers/removal**.
- Movie/theatre/show/seat validation: **PASS isolated rules/repository tests and source tracing**, BLOCKED persisted real-DB relationship checks.
- Price is server-controlled: **PASS**, executed client-price injection, pure pricing and authoritative-total tests.
- Double booking prevented: **PASS isolated atomic/transaction model**, BLOCKED live cross-process replica-set proof.
- Booking ownership/status consistency: **PASS isolated state-transition tests**, BLOCKED live persistence.
- Server order creation/verification works: **PASS mocked transport with actual server logic/real HMAC**, BLOCKED completed provider integration.
- Failed payment cannot confirm seats/ticket: **PASS isolated failure/expiry/replay tests**.
- Repeated payment processing is safe: **PASS isolated order lease/callback replay tests**, BLOCKED live provider race test.
- Secrets stay server-side: **PASS current public-build scan**, Git-history audit unavailable because this workspace has no `.git` metadata.
- Production build/relevant executed tests pass: **PASS**, logs recorded.
- Critical workflows retested: **PASS for isolated/guest scope; BLOCKED for authenticated live DB/provider scope**.
- No unresolved critical security issue before release: **BLOCKED release acceptance**, because the complete live persistence/payment/inventory chain is not yet verified and production reconciliation is absent.
- Known limits documented: **PASS**, this report and DEPLOYMENT.md.

## 11. Remaining problems and prerequisites

1. **Release blocker: Atlas database authentication.** The driver rejects the configured connection (8000). Check the Atlas **database user** credentials, intended cluster and authSource locally. Atlas login credentials and database-user credentials are different. See [official Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/). Do not share the URI/password in chat.
2. **Release blocker: live transaction/index and two-account proof.** Use a separate authenticated database named `cinebook_audit_...`, run the retained suite, then verify driver transactions and true simultaneous clients. Passing the in-memory model cannot establish those properties.
3. **Release blocker: administrator setup.** CINEBOOK_ADMIN_EMAIL was not configured in the inspected environment. Complete the documented reviewed setup once DB authentication works; legacy ADMIN_EMAILS no longer grants registration privileges.
4. **Release blocker for real money: payment reconciliation.** Add/test authenticated provider webhooks or a reliable reconciliation mechanism for callbacks lost during network/browser failure, with duplicate delivery handling. Refund execution is absent; REFUND_PENDING requires merchant review. Real provider capture and the complete test checkout must be exercised.
5. **Demonstration inventory/ticketing.** Schedules are generated demonstrations, not verified cinema inventory. QR metadata is not a signed offline admission/scanner system. Merchant cancellation/refund/tax policies require review before actual sales.
6. **Migration review.** Preserve and reconcile orphaned userId-null bookings, duplicate historical favorites/index conflicts, old mock confirmations and old false refund labels. The audit deliberately did not delete or reassign them.
7. **Legacy local metadata.** Password-stripped legacy browser metadata is preserved in `cinebook:legacy-export` only for review/export, not trusted for authentication or shown as current account data. It may still contain old booking/profile metadata on that device. Transfer it to an appropriate secure archive and remove the legacy browser copy deliberately before sharing the device; do not treat it as server-verified history.
8. **Operational limits.** Rate limiting is per process; multi-instance hosts need a shared limiter. Expired session rows need a retention/cleanup policy. Admin analytics currently cover up to the latest 500 bookings and bounded catalogue queries; large deployments need paginated/aggregate reporting rather than treating these as all-time totals. These limits were not load-tested.
9. **Absent noncritical features.** Email verification/password reset delivery, scheduled notification delivery, full administrative CRUD UIs and real review submission are not implemented. Current reminders/reviews are explicitly labeled, not silently presented as completed backend features.
10. **Verification limits.** Mobile layouts/media playback, every filter/cast/certification image, real DB disconnection recovery, issuer card eligibility and every export/QR failure branch were not all manually exercised. Nine Fast Refresh warnings remain. A source-only/isolated audit is not an external penetration-test certification.

## 12. Environment setup

Names and sources only; no current secret values are included:

- `TMDB_ACCESS_TOKEN` or `TMDB_API_KEY`: TMDB account's API settings. Server-only.
- `TMDB_IMAGE_BASE_URL`: documented image-service base in `.env.example`; the existing image helper currently uses the standard TMDB image base directly.
- `MONGODB_URI`: Atlas Connect/Drivers database-user URI, reserved credential characters URL-encoded.
- `MONGODB_DB`: chosen application database (default cinebook).
- `SESSION_SECRET`: unpredictable server secret, at least 32 characters, stable across instances.
- `CINEBOOK_ADMIN_EMAIL`: intended reviewed administrator account email, server configuration only.
- `CINEBOOK_SEED_TOKEN`: optional secondary development-seed secret; not a substitute for administrator authentication.
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: Razorpay test-mode dashboard credentials. Only key ID reaches checkout.
- `NITRO_PRESET`: optional supported Node deployment preset override.
- `MONGODB_TEST_URI` and `MONGODB_TEST_DB`: separately provided test-process settings. DB name must begin `cinebook_audit_`; tests never default to the real application database.

`.env` was not replaced wholesale. URL-encoding repair preserved other settings and created `.env.before-audit.local`. No secret was rotated or printed. An optional alternate-host fallback was rejected by automatic approval review because it would forward the credential to an additional hostname; it was abandoned. Requests remain on the existing host with bounded retries, retained partial results and visible errors. See DEPLOYMENT.md for exact administrator and deployment instructions.

## 13. Production-readiness assessment

**Not ready for real sales yet.** The code now enforces key trust boundaries and honest state transitions, and the executed checks pass. Release still requires an authenticated transaction-capable MongoDB deployment, actual indexes/migration review, real two-user browser persistence, deliberate admin setup and a completed Razorpay test checkout with reliable capture/refund reconciliation.

Use a Node host. A green edge build does not establish MongoDB driver compatibility. Keep demonstration schedules/tickets labeled until real inventory and admission validation exist. Do not promote the isolated tests into claims about production service availability.

## 14. Files changed

- `src/lib/auth.server.ts` (new): reusable server authentication, persistent revocable sessions, role policy and authentication limiter.
- `src/lib/cinebook.functions.ts`: validated boundaries, current-user endpoint, owner checks, admin guards, safe status/error mapping, stored payment binding and disabled bypass endpoints.
- `src/lib/db/mongo.server.ts`: implicit driver transaction sessions, sanitized errors, duplicate/index failures that stop unsafe writes.
- `src/lib/db/repositories.server.ts`: normal-role account creation, compatible stronger password hashes, trusted show definitions, valid seats, idempotency, transaction/state fixes, favorites uniqueness and paid-only revenue.
- `src/lib/db/models.ts`: password-iteration compatibility, booking idempotency/order-lease fields and REFUND_PENDING status.
- `src/lib/db/seed.server.ts`: additive required query/unique/partial indexes; seed code inspected but not run against live data.
- `src/lib/booking-rules.ts` (new), `src/lib/shows.ts`: strict seat/date rules and shared trusted schedule generation.
- `src/lib/razorpay.server.ts`: bounded provider requests, validated order response and captured-payment lookup with exact order/amount/currency checks.
- `src/lib/store.tsx`, `cinebook-queries.ts`: verified session hydration, account-scoped DB queries, private-cache clearing, no plaintext/local-auth/fake booking fallback, accurate async mutations.
- Private routes (`admin`, `login`, `profile`, `favorites`, `bookings`, `book.$showId`, `checkout.$showId`, `ticket.$bookingId`): persisted scoped flows, loading/error/status fixes and safe checkout/tickets.
- Other routes/components (`movie.$movieId`, `theatres`, `offers`, `upcoming`, `Header`, `Footer`, `MovieCard`, `TicketCard`): honest labels, guarded actions, server data and QR failure handling while preserving styling.
- `src/lib/tmdb.server.ts`, `tmdb.functions.ts`, `movie-queries.ts`, the movies route and transport regressions: search does not depend on a successful genre request or return silent sample matches on failure; cache size is bounded and primary-host retries are tested.
- `src/lib/tmdb-map.ts`, movie cards and movie pages: missing runtime/certification stay unknown instead of invented; an executed mapping regression protects known and missing metadata.
- `src/router.tsx`, `movie-queries.ts` and Header: per-request SSR query hydration, consistent initial fallback retry state and explicit session-loading accessibility state.
- `src/components/SearchBar.tsx`: distinct service-error feedback/retry, minimum query guidance and unique responsive input IDs.
- Existing source formatting fixes: removed the baseline Prettier errors without redesigning interfaces or changing the working TMDB transport.
- `promote-admins.cjs`: explicit one-account dry-run/apply setup using built-in Node environment loading, no automatic public password or arbitrary promotion.
- `vite.config.ts`, `scripts/build-node.mjs`, `package.json`, `package-lock.json`: Node build target, Windows-compatible command, retained Playwright/test tooling, official SSR query integration and patched Zod 4.6.7.
- `tests/*.test.cjs`, `tests/helpers/*`, `tests/e2e/*`, `playwright.config.cjs`: actual-source isolated regressions and safe separately gated real browser/database checks.
- `.env.example`, `.gitignore`, `.prettierignore`, `eslint.config.js`, README.md, DEPLOYMENT.md: documented environment/setup/test scope and generated-test-output exclusions.
- `.env`: URL encoding only; ignored local backup retained. No actual credential values appear in this report.
- `audit/*`: initial inventory, baseline/final evidence, individual test results and this report. A separate managed audit overview summarizes the evidence.

There is no Git repository metadata in this checkout, so no commit/diff/history or force-push operation was performed. No unrelated published history was rewritten.

## 15. Exact commands and next safe run

CineBook was restarted at `http://127.0.0.1:8081/` for the existing in-app browser. The stale prior dev process was stopped; the audit test servers were shut down.

These commands match the installed npm scripts and Windows PowerShell environment:

```powershell
npm ci
npm run dev
npm test
npm run test:e2e
npx tsc --noEmit
npm run lint
npm run build
npm run build:node
npm run start
```

- `npm run test:e2e` uses installed Microsoft Edge and isolated port 4180. It intentionally verifies the offline sample experience in its public suite.
- Supply MONGODB_TEST_URI and an approved `cinebook_audit_...` test DB **in the test process environment** before rerunning the gated real database test. Never point it at the application database.
- Once Atlas authentication is corrected, follow DEPLOYMENT.md to register/review the intended admin. `node promote-admins.cjs` is a read-only dry-run; `node promote-admins.cjs --apply` is the deliberate privileged write and was not executed by the audit.
- Review seed/migration effects before any real-data change. Nothing in these test commands requires a live payment, production deployment or database reset.
