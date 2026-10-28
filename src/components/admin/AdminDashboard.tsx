import { Link } from "@tanstack/react-router";
import { useState, type ComponentType } from "react";
import {
  Armchair,
  ArrowUpRight,
  IndianRupee,
  RefreshCw,
  Ticket,
  Users,
  UserRoundCheck,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import type { AdminOverview } from "@/lib/admin-types";
import { inr } from "@/lib/pricing";
import { friendlyError } from "@/lib/cinebook-queries";
import { seedDatabase } from "@/lib/cinebook.functions";

const number = (value: number) => value.toLocaleString("en-IN");
const shortMoney = (value: number) =>
  `₹${Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      });
};

export function AdminDashboard({
  data,
  refreshing,
  onRefresh,
}: {
  data: AdminOverview;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const kpis = data.kpis;
  const maxRevenue = Math.max(1, ...data.topMovies.map((movie) => movie.revenue));
  const recent = data.recent.filter((booking) =>
    `${booking.bookingId} ${booking.userEmail} ${booking.title} ${booking.theatreName}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const hasDailyRevenue = data.dailyRevenue.some((day) => day.bookings > 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 pb-24 sm:px-6 lg:pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">
            CineBook / Administration
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Admin dashboard
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            A complete view of your customers, booked seats and paid booking revenue.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/movies"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
          >
            Browse movies <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold transition hover:bg-surface-2 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {refreshing ? "Refreshing…" : "Refresh analytics"}
          </button>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>All-time totals · Confirmed, paid bookings only</p>
        <p role="status">Updated {dateLabel(data.generatedAt)} IST</p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          icon={IndianRupee}
          label="Paid revenue"
          value={inr(kpis.revenue)}
          detail="Includes booking fees and taxes"
          prominent
        />
        <Kpi
          icon={UserRoundCheck}
          label="Customers booked"
          value={number(kpis.customers)}
          detail="Unique linked accounts with a paid booking"
        />
        <Kpi
          icon={Armchair}
          label="Seats booked"
          value={number(kpis.seatsSold)}
          detail="Seats in confirmed, paid bookings"
        />
        <Kpi
          icon={Ticket}
          label="Paid bookings"
          value={number(kpis.bookings)}
          detail={`${number(kpis.totalBookings)} booking requests in total`}
        />
        <Kpi
          icon={Users}
          label="Registered users"
          value={number(data.counts.users)}
          detail="Accounts registered in CineBook"
        />
        <Kpi
          icon={Wallet}
          label="Average booking value"
          value={inr(kpis.avgBookingValue)}
          detail="Paid revenue divided by paid bookings"
        />
      </div>

      <section
        aria-label="Booking and payment status"
        className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-y border-border py-4 text-sm"
      >
        <StatusCount label="Pending bookings" value={kpis.pending} />
        <StatusCount label="Cancelled bookings" value={kpis.cancelled} />
        <StatusCount label="Failed payments" value={kpis.failed} />
        <div>
          <span className="font-semibold tabular-nums text-accent">
            {number(kpis.refundPending)}
          </span>{" "}
          <span className="text-muted-foreground">
            {kpis.refundPending === 1 ? "refund pending" : "refunds pending"}
          </span>
          {kpis.refundPending > 0 && (
            <span className="ml-2 text-accent">{inr(kpis.refundPendingAmount)}</span>
          )}
        </div>
      </section>
      <p className="mt-2 text-xs text-muted-foreground">
        Pending, failed and cancelled bookings are excluded from paid revenue. A pending refund has
        not been completed.
      </p>
      {kpis.unlinkedBookings > 0 && (
        <p className="mt-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
          {number(kpis.unlinkedBookings)} historical paid{" "}
          {kpis.unlinkedBookings === 1 ? "booking is" : "bookings are"} not linked to registered
          accounts. These bookings contribute to revenue and seats, but are excluded from the
          customer count.
        </p>
      )}

      <div className="mt-7 grid gap-5 lg:grid-cols-5">
        <section
          className="min-w-0 rounded-2xl border border-border bg-surface p-5 lg:col-span-3 sm:p-6"
          aria-labelledby="revenue-heading"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="revenue-heading" className="font-display text-xl font-semibold">
              Revenue over time
            </h2>
            <p className="text-xs text-muted-foreground">Last 14 days · Booking date, IST</p>
          </div>
          {hasDailyRevenue ? (
            <div
              className="mt-6 h-56 w-full overflow-hidden"
              role="img"
              aria-label="Daily paid booking revenue in Indian rupees over the last fourteen days"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.dailyRevenue}
                  margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={dayLabel}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={26}
                  />
                  <YAxis
                    tickFormatter={shortMoney}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={62}
                  />
                  <Tooltip
                    labelFormatter={(date) => dayLabel(String(date))}
                    formatter={(value) => [inr(Number(value)), "Paid revenue"]}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.75rem",
                      color: "var(--foreground)",
                    }}
                    cursor={{ fill: "var(--surface-2)" }}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="var(--primary)"
                    isAnimationActive={false}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No paid bookings in this period"
              description="Daily revenue will appear after customers complete verified payments."
            />
          )}
        </section>

        <section
          className="min-w-0 rounded-2xl border border-border bg-surface p-5 lg:col-span-2 sm:p-6"
          aria-labelledby="movies-heading"
        >
          <h2 id="movies-heading" className="font-display text-xl font-semibold">
            Top movies
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Ranked by all-time paid revenue</p>
          {data.topMovies.length ? (
            <ol className="mt-5 space-y-4">
              {data.topMovies.map((movie) => (
                <li key={movie.movieId}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{movie.title}</span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {inr(movie.revenue)}
                    </span>
                  </div>
                  <progress
                    value={movie.revenue}
                    max={maxRevenue}
                    aria-label={`${movie.title}: ${inr(movie.revenue)} paid revenue`}
                    className="mt-2 block h-1.5 w-full overflow-hidden rounded-full accent-primary [&::-webkit-progress-bar]:bg-surface-2 [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {number(movie.seats)} seats · {number(movie.bookings)} bookings
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              title="No paid movie bookings yet"
              description="Your most-booked movies will appear here as payments are confirmed."
            />
          )}
        </section>
      </div>

      <section
        id="recent-bookings"
        className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface"
        aria-labelledby="bookings-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div>
            <h2 id="bookings-heading" className="font-display text-xl font-semibold">
              Recent bookings
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The latest 20 booking requests from all customers
            </p>
          </div>
          <label className="w-full sm:w-72">
            <span className="sr-only">Search recent bookings</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Booking, customer or movie…"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <caption className="sr-only">
              Recent customer bookings, seats, amounts and payment states
            </caption>
            <thead className="border-y border-border bg-surface-2/50 text-xs text-muted-foreground">
              <tr>
                {["Booking", "Customer", "Movie / theatre", "Seats", "Amount", "Status"].map(
                  (label) => (
                    <th key={label} scope="col" className="px-5 py-3 font-medium">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recent.map((booking) => (
                <tr key={booking.bookingId} className="transition hover:bg-surface-2/30">
                  <td className="px-5 py-4">
                    <p className="font-mono text-xs">{booking.bookingId}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dateLabel(booking.createdAt)}
                    </p>
                  </td>
                  <td className="max-w-56 px-5 py-4">
                    <p className="truncate" title={booking.userEmail}>
                      {booking.userEmail || "Unlinked account"}
                    </p>
                    {!booking.accountLinked && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Legacy · unlinked account
                      </p>
                    )}
                  </td>
                  <td className="max-w-64 px-5 py-4">
                    <p className="truncate font-medium" title={booking.title}>
                      {booking.title}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {booking.theatreName}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-semibold tabular-nums">{number(booking.seats)}</p>
                    <p className="mt-1 max-w-36 text-xs text-muted-foreground">
                      {booking.seatCodes.join(", ") || "Seat details unavailable"}
                    </p>
                  </td>
                  <td className="px-5 py-4 font-semibold whitespace-nowrap tabular-nums">
                    {inr(booking.amount)}
                  </td>
                  <td className="px-5 py-4">
                    <BookingState booking={booking} />
                  </td>
                </tr>
              ))}
              {!recent.length && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    {search ? "No recent bookings match your search." : "No bookings recorded yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <section
          className="min-w-0 rounded-2xl border border-border bg-surface p-5 sm:p-6 lg:col-span-2"
          aria-labelledby="customers-heading"
        >
          <h2 id="customers-heading" className="font-display text-xl font-semibold">
            Customers who booked seats
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Top customers by paid booking value</p>
          {data.topCustomers.length ? (
            <ul className="mt-4 divide-y divide-border">
              {data.topCustomers.map((customer) => (
                <li key={customer.userId} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {customer.email || customer.userId}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {number(customer.bookings)} bookings · {number(customer.seats)} seats
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {inr(customer.revenue)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={
                kpis.unlinkedBookings
                  ? "No linked customer accounts"
                  : "No paid customer bookings yet"
              }
              description={
                kpis.unlinkedBookings
                  ? "Historical bookings without an account are excluded from this list."
                  : "Customers appear after a registered account completes a booking."
              }
            />
          )}
        </section>
        <section
          className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
          aria-labelledby="inventory-heading"
        >
          <h2 id="inventory-heading" className="font-display text-xl font-semibold">
            Cinema inventory
          </h2>
          <dl className="mt-4 divide-y divide-border">
            {[
              ["Active theatres", data.counts.theatres],
              ["Screens", data.counts.screens],
              ["Active shows", data.counts.shows],
              ["Active offers", data.counts.offers],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">{number(Number(value))}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <SeedPanel onComplete={onRefresh} />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  prominent = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  prominent?: boolean;
}) {
  return (
    <section
      aria-label={label}
      className={`rounded-2xl border p-5 sm:p-6 ${prominent ? "border-primary/30 bg-primary/5" : "border-border bg-surface"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </section>
  );
}
function StatusCount({ label, value }: { label: string; value: number }) {
  return (
    <p>
      <span className="font-semibold tabular-nums">{number(value)}</span>{" "}
      <span className="text-muted-foreground">{label.toLowerCase()}</span>
    </p>
  );
}
function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-48 flex-col justify-center py-6">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
function BookingState({ booking }: { booking: AdminOverview["recent"][number] }) {
  const paid = booking.status === "CONFIRMED" && booking.paymentStatus === "PAID";
  const label =
    booking.paymentStatus === "REFUND_PENDING"
      ? "Refund pending"
      : paid
        ? "Paid"
        : booking.paymentStatus === "FAILED"
          ? "Failed"
          : booking.paymentStatus === "REFUNDED"
            ? "Refunded"
            : "Pending";
  return (
    <div>
      <span
        className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${paid ? "bg-primary/10 text-primary" : booking.paymentStatus === "FAILED" ? "bg-destructive/10 text-destructive" : "bg-surface-2 text-accent"}`}
      >
        {label}
      </span>
      <p className="mt-1 text-xs text-muted-foreground">
        {booking.status === "CANCELLED"
          ? "Cancelled"
          : booking.status === "CONFIRMED"
            ? "Confirmed"
            : "Awaiting confirmation"}
      </p>
    </div>
  );
}
function SeedPanel({ onComplete }: { onComplete: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="mt-8 rounded-2xl border border-border p-5">
      <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
        Development setup
      </summary>
      <p className="mt-3 text-sm text-muted-foreground">
        Load demonstration theatres, screens and offers into the database. This changes catalogue
        records and requires the server seed token.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="min-w-48 flex-1">
          <span className="sr-only">Seed token</span>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            placeholder="Seed token"
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <button
          type="button"
          disabled={busy || !token}
          onClick={() => {
            setBusy(true);
            void seedDatabase({ data: { token } })
              .then(() => {
                toast.success("Database seeded");
                onComplete();
              })
              .catch((error: unknown) => toast.error(friendlyError(error)))
              .finally(() => setBusy(false));
          }}
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Seeding…" : "Run seed"}
        </button>
      </div>
    </details>
  );
}
