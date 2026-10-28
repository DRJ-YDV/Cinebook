# CineBook

CineBook is an existing React / TanStack Start cinema booking demonstration connected to Lovable. Movie metadata comes from TMDB; accounts, favorites, shows, seats, bookings and payments use MongoDB. Checkout integrates with Razorpay test mode.

## Local development

Use Node.js 24 and npm. Configure the server variables in `.env.example` without exposing them through `VITE_*` names. See [deployment and administrator setup](DEPLOYMENT.md) before using the backend.

```powershell
npm ci
npm run dev
```

## TMDB connectivity

Opening TMDB's website does not establish that `api.themoviedb.org` is reachable. The server retries transient API failures and shares duplicate catalogue requests. Trailers load separately after the catalogue is displayed.

Successful catalogues are saved in the ignored `.cache/tmdb-catalogue.json` file. During an API outage, CineBook keeps these real movies for up to seven days and displays a retry notice. A first run without saved data still shows the labeled sample catalogue if TMDB cannot be reached. `TMDB_CACHE_FILE` overrides the cache location; an empty value disables disk caching. The file contains public movie metadata only. Restart Vite after changing `.env`.

## Checks

```powershell
npm test
npm run test:e2e
npx tsc --noEmit
npm run lint
npm run build
```

`npm test` executes isolated regression tests against actual application handlers/repositories with clearly labeled mocks. The Playwright suite uses installed Edge; real database cases require explicit isolated test credentials. These tests never initiate a real payment. See [test scope](tests/README.md), [initial workflow inventory](audit/INITIAL-INVENTORY.md) and the [audit report](audit/REPORT.md).

## Administrator dashboard

Verified administrators sign in through the normal form and land on `/admin`. The dashboard shows all-time paid revenue, unique linked customers, booked seats, registered users, booking/payment states, a 14-day revenue chart, top movies/customers and the latest 20 booking requests. See [administrator setup](DEPLOYMENT.md) and [dashboard implementation and validation](audit/ADMIN-DASHBOARD.md). A configured email alone does not grant the stored administrator role.

## Node production build

```powershell
npm run build:node
npm run start
```

A Node runtime and a transaction-capable MongoDB cluster are required. Complete the documented database authentication, administrator setup and payment reconciliation prerequisites before production use.

## Lovable integration

Continue editing through Lovable or this local source. Commits pushed to the connected branch sync to Lovable. Preserve published Git history; do not force-push, rebase or amend published commits.
