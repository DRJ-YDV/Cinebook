# Dedicated administrator dashboard

Updated 26 October 2026. This change adds the requested business view while preserving CineBook's styling and server-side authorization.

## Behavior

- The normal login form sends the server-verified administrator to `/admin`. A normal account continues to the movie homepage. Dashboard navigation appears only for a verified administrator, including on mobile.
- Six summary metrics show paid revenue, distinct linked customer accounts, seats booked, paid bookings, registered users and average paid booking value.
- Totals use database-side aggregation across all booking history. The previous latest-500 cap is removed. The latest 20 booking requests, top six movies and top six customers have explicit display limits.
- Revenue and seat totals include only `CONFIRMED` plus `PAID` bookings. Pending, failed, cancelled and refund-pending amounts do not inflate revenue. Refunds awaiting action are shown separately.
- Historical paid bookings without a user ID contribute to revenue/seats, but not to the registered-customer count. Their count and unlinked status are visible; no record is reassigned by email.
- Daily revenue uses booking creation dates grouped into India calendar days for the last 14 days. This is a booking report, not a gateway settlement report.
- Recent records show booking ID/date, customer email, movie/theatre, seat codes, amount and booking/payment states. Search filters only those latest 20 records.
- Refresh is available manually and every minute. Database failures show an error/retry state instead of invented zero totals. Empty successful results show honest empty states.
- The existing development seed action remains collapsed under development setup; it was not run.

## Files

- `src/lib/db/admin-analytics.server.ts`: actual MongoDB aggregation/count queries and typed response construction.
- `src/lib/admin-types.ts`: client-safe dashboard response type.
- `src/lib/db/mongo.server.ts`: session-aware `countDocuments` wrapper.
- `src/lib/db/repositories.server.ts`: delegates admin analytics to the dedicated server module. The server-function `requireAdmin` guard is retained.
- `src/components/admin/AdminDashboard.tsx`, `src/routes/admin.tsx`: metrics, charts, tables, empty/error/loading states and responsive layout.
- `src/lib/store.tsx`, `src/routes/login.tsx`: route selection from the role returned by verified server authentication.
- `src/components/Header.tsx`, `MobileNav.tsx`: administrator navigation and a signed-in mobile header that retains city selection.
- `src/lib/cinebook-queries.ts`: automatic refresh while the administrator view is enabled.
- `tests/admin-analytics.test.cjs`, `tests/helpers/aggregate.cjs`: isolated pipeline regression cases.
- `tests/e2e/admin-dashboard.spec.cjs`: actual UI tests with explicitly mocked RPC responses.

## Executed validation

- `npm test`: 52 passed, zero failed. This includes the existing authorization/ownership regressions and five new analytics cases. Evidence: `admin-unit-tests.log`.
- Complete Edge suite: ten passed, one skipped. Seven public/guest checks use actual local server behavior; three admin UI/navigation cases explicitly mock RPC responses. The skipped case requires a separate configured test database. Evidence: `admin-full-browser-tests.log`.
- The three admin UI cases were rerun after adding explicit mobile chart-sizing checks and clean screenshots; all three passed. Evidence: `admin-browser-tests.log`. Screenshots contain synthetic fixture data, not real customer accounts or revenue.
- TypeScript, lint and Node production build passed. Lint retains the same nine Fast Refresh warnings. Evidence: `admin-typecheck.log`, `admin-lint.log`, `admin-build.log`.
- Actual read-only MongoDB aggregation succeeded. The recorded snapshot contains two paid bookings, five seats and ₹1,517 in recorded paid booking value. Both paid bookings have no linked user ID, explaining the zero linked-customer count. Evidence: `admin-live-check.json`.
- The configured administrator email exists, but its stored role was `user` when checked. The administrator setup dry-run succeeded. No real role, booking, payment or other customer record was changed.

## Open the dashboard with the designated account

After reviewing that `CINEBOOK_ADMIN_EMAIL` names your intended account, run the existing deliberate setup command:

```powershell
node promote-admins.cjs --apply
```

Then sign out and sign back in through the normal login form. The application will open `/admin`. The implementation did not automatically promote the account.

Real administrator cookie sign-in was not exercised because the account was not promoted during this change and its application password was not provided. The UI navigation checks use explicit RPC fixtures; the production authorization guard remains active. No gateway payment, refund, migration or production deployment was performed. The earlier full-stack audit remains a dated snapshot; this note supersedes its database-authentication blocker and latest-500 analytics limitation.

Final application check: the running app at port 8081 returned HTTP 200, hydrated successfully, reached MongoDB and denied a fresh guest access to `/admin`, with zero browser errors. Public build output was scanned across 34 assets for six configured secret values: zero matches. Administrator test fixture strings were absent from the public output. Evidence: `admin-app-check.json`, `admin-client-scan.json`, `admin-results.json`. The mobile revenue bars were also visually checked after removing their entrance animation.
