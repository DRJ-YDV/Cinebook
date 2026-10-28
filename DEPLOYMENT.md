# CineBook deployment and administrator setup

## Runtime

Use Node.js 24 with npm. `npm run build` now defaults to Nitro's `node-server` preset, and `npm run build:node` explicitly selects it using a Windows-compatible script. Start with `npm run start`; the entry point is `.output/server/index.mjs`.

MongoDB pooling, sessions and multi-document booking transactions require a Node host and a transaction-capable MongoDB replica set or Atlas cluster. A successful Cloudflare/edge build does not establish compatibility with the official MongoDB driver. Lovable can pin its own build target; host the application on a compatible Node service to use these backend features. Do not restore browser-storage authentication or payment fallback to conceal database failures.

## Environment

Copy `.env.example` to `.env` only for a fresh setup; do not overwrite an existing environment file. Supply these values through a deployment secret manager in production:

- `MONGODB_URI`: Atlas **database user** connection string, including the correct cluster/authSource. URL-encode reserved characters in credentials.
- `MONGODB_DB`: application database, normally `cinebook`.
- `SESSION_SECRET`: at least 32 unpredictable characters. Keep it stable across application instances. Rotating it signs out cookie sessions.
- `CINEBOOK_ADMIN_EMAIL`: normalized designated administrator email; this does not itself grant a role.
- `TMDB_ACCESS_TOKEN` or `TMDB_API_KEY`: TMDB application credentials. Tokens stay on the server.
- `TMDB_CACHE_FILE`: optional public catalogue cache path, default `.cache/tmdb-catalogue.json`. Use a writable persistent path to retain real movies across restarts during API outages. An empty value disables disk caching. Snapshots expire after seven days; read-only deployments retain only the in-memory cache.
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: Razorpay test-mode credentials for the current demonstration checkout. The key ID is intentionally public; the secret is never returned.
- `CINEBOOK_SEED_TOKEN`: optional secondary protection for development seeding. A verified administrator session is also required.
- `NITRO_PRESET`: optional runtime override; the supported default is `node-server`.

The audit corrected URL encoding in the local MongoDB URI while preserving its host and decoded credential values. The original local file is backed up in `.env.before-audit.local`, which is excluded by the existing `*.local` Git ignore rule. The subsequent read-only connection attempt still failed with MongoServerError code 8000. Verify the Atlas database user, password, cluster and authSource locally. Never paste these secret values into a bug report.

## Establish the administrator deliberately

1. Set `CINEBOOK_ADMIN_EMAIL` to the intended account's email on the server.
2. Register that account through `/login` using a private password. All new accounts receive `role: user`, including this email.
3. Verify that the registered account belongs to the intended administrator. This project has no email-verification delivery service, so do not promote an unverified pre-existing claimant.
4. Run `node promote-admins.cjs` to check the designated account without modifying it.
5. After reviewing the account, run `node promote-admins.cjs --apply`. This updates only that registered account's stored role.
6. Sign in through the normal form and open `/admin`.

After promotion, sign out and sign back in. Verified administrator sign-in opens `/admin`; normal users continue to the movie homepage. The dashboard independently requires server-side administrator authorization. It reports all-time confirmed/paid booking totals, registered users and distinct linked customers, with a daily chart by booking date in India time. Only the recent-bookings list is limited to 20 records; totals are not limited to the last 500. Historical paid bookings without a user ID are included in revenue/seats and explicitly excluded from the linked-customer count. The dashboard does not reassign historical records or treat pending refunds as completed.

Existing stored administrator roles remain supported when no designated email is configured. When `CINEBOOK_ADMIN_EMAIL` is present, both the stored admin role and the matching email are required. Legacy `ADMIN_EMAILS` no longer automatically promotes registrations. No publicly known password is created, and the audit did not run the promotion command against real data.

Every administrative server operation checks the current database role. Anonymous private requests receive 401; authenticated users lacking permission receive 403. Editing localStorage cannot grant access.

## Sessions and existing accounts

Sessions use the existing encrypted HttpOnly, SameSite cookie plus a random token whose SHA-256 digest is stored in the new `sessions` collection. The server checks expiry and re-reads the user on each protected request. Logout deletes the session record, so replaying the old cookie fails. Existing userId-only cookies require a fresh sign-in.

New password hashes use PBKDF2-HMAC-SHA256 with 600,000 iterations. Existing database records without `passwordIterations` continue to verify with the prior 100,000 iterations. Plaintext browser accounts are no longer accepted. Legacy browser metadata is retained only as a password-stripped export, never treated as authenticated private data. A local-only account must register normally after database access is restored.

## Indexes and existing data

Required unique indexes are checked lazily before affected writes; index errors now stop the operation. Collections include `users`, `sessions`, `theatres`, `screens`, `shows`, `show_seats`, `bookings`, `payments`, `favorites`, `offers` and `meta`.

The additive indexes include user email/user ID, show ID, booking ID, favorites `(userId, tmdbId)`, payment booking/order/payment references, checkout `(userId, idempotencyKey)` and a partial first-booking-offer constraint. Missing legacy optional fields are excluded from new partial indexes. No records were deleted to resolve duplicates. Review conflicting existing records before creating or reconciling indexes.

Legacy bookings with `userId: null` are preserved but cannot be claimed by supplying an email from the browser. A reviewed migration must link them to verified accounts. Review old client-confirmed/mock payments and old `REFUNDED` labels before relying on historical totals. Do not bulk-convert them into verified paid bookings.

## Seeding

Inspect `src/lib/db/seed.server.ts` before using the admin seed button. It creates indexes and reference data; offers are upserted even without `force`, and `force` can overwrite theatre reference fields. The audit did not seed or reset the live database. Use a separate test database and obtain approval before a destructive production migration or seed.

## Booking and payments

Shows are demonstration schedules generated from trusted movie/theatre records, not real exhibitor inventory. Persisted show price, screen, format and seat layout are authoritative. Seat availability comes from recorded sold seats and active holds; synthetic sold-seat occupancy was removed.

Checkout creates an owned pending booking, holds validated seats and calculates the amount on the server. It uses an idempotency key and a database lease for order creation. An order can be paid only after session ownership, stored order binding, HMAC and provider capture/amount/currency verification. Multi-document transitions use MongoDB transactions. Late captured payments cannot steal expired/reassigned seats.

Paid cancellations and captured payments that cannot receive seats become `REFUND_PENDING`; the application does not claim that a gateway refund has completed. There is no webhook or refund-execution/reconciliation service yet. Finish and test those workflows, merchant policies, real inventory and ticket validation before using real money. No real payment was performed in the audit.

## Commands

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

The browser suite uses installed Microsoft Edge and an isolated server on port 4180. Public checks intentionally disable TMDB credentials, payments and MongoDB and verify the labeled offline experience. Real database browser tests are skipped unless **both** `MONGODB_TEST_URI` and a `MONGODB_TEST_DB` beginning with `cinebook_audit_` are supplied in the test process environment. They never fall back to the live application database. See `tests/README.md` and `audit/REPORT.md` for evidence and remaining prerequisites.
