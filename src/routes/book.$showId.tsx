import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookingSteps } from "@/components/BookingSteps";
import { computePrice, inr } from "@/lib/pricing";
import { useApp } from "@/lib/store";
import { friendlyError, loadShowContext, seatsQuery } from "@/lib/cinebook-queries";
import { categoryForRow, priceForRow } from "@/lib/db/models";

export const Route = createFileRoute("/book/$showId")({
  loader: async ({ params, context }) => {
    return loadShowContext(context.queryClient, params.showId);
  },
  head: () => ({
    meta: [
      { title: "Select Your Seats — CineBook" },
      {
        name: "description",
        content: "Pick regular, premium or recliner seats on an interactive cinema layout.",
      },
      { property: "og:title", content: "Select Your Seats — CineBook" },
      { property: "og:description", content: "Interactive seat selection for your show." },
    ],
  }),
  component: SeatSelection,
});

const MAX_SEATS = 10;

function SeatSelection() {
  const { showId } = Route.useParams();
  const { movie, show, theatre, seatConfig } = Route.useLoaderData();
  const navigate = useNavigate();
  const { user, hydrated } = useApp();
  const [selected, setSelected] = useState<string[]>([]);

  // Availability and layout are authoritative server data; no fake seat fallback.
  const seatState = useQuery({
    ...seatsQuery(show?.id ?? "none"),
    enabled: Boolean(show),
    refetchInterval: 10_000,
  });

  if (!show || !movie || !theatre) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Show unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This showtime has expired or is no longer listed.
        </p>
        <Link
          to="/movies"
          className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Find another show
        </Link>
      </div>
    );
  }

  const taken = new Set(seatState.data?.unavailable ?? []);
  const prices = selected.map((s) => priceForRow(show.price, s[0]!, seatConfig));
  const breakdown = computePrice(prices);

  const toggleSeat = (seat: string) => {
    if (taken.has(seat) || !seatState.data || seatState.isError) return;
    setSelected((cur) => {
      if (cur.includes(seat)) return cur.filter((s) => s !== seat);
      if (cur.length >= MAX_SEATS) {
        toast.error(`You can select up to ${MAX_SEATS} seats per booking.`);
        return cur;
      }
      return [...cur, seat].sort();
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <BookingSteps current={2} />
      {seatState.isPending && (
        <p className="mt-4 text-sm text-muted-foreground">Checking current seat availability…</p>
      )}
      {seatState.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {friendlyError(seatState.error)} Seat selection is unavailable until it reconnects.
        </p>
      )}
      {hydrated && !user && (
        <p className="mt-4 text-sm text-muted-foreground">
          <Link to="/login" className="text-primary">
            Sign in
          </Link>{" "}
          to continue with a booking.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{movie.title}</h1>
          <p className="text-sm text-muted-foreground">
            {theatre.name} · {show.screen} · {show.format} ·{" "}
            {new Date(show.date).toLocaleDateString("en-IN", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
            , {show.time}
          </p>
        </div>
        <Link
          to="/movie/$movieId"
          params={{ movieId: movie.id }}
          className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
        >
          Change showtime
        </Link>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface p-4 sm:p-6">
          <div className="mx-auto min-w-[560px]">
            <div className="mx-auto h-2 w-3/4 rounded-t-[100%] bg-gradient-to-b from-accent/70 to-transparent" />
            <p className="mb-8 text-center text-[11px] tracking-[0.35em] text-muted-foreground uppercase">
              Screen this way
            </p>

            {seatConfig.rows.map((row) => (
              <div key={row} className="mb-2 flex items-center justify-center gap-2">
                <span className="w-5 text-xs text-muted-foreground">{row}</span>
                <div className="flex gap-1.5">
                  {Array.from({ length: seatConfig.seatsPerRow }, (_, i) => {
                    const seat = `${row}${i + 1}`;
                    const isTaken = taken.has(seat);
                    const isSel = selected.includes(seat);
                    const cat = categoryForRow(row, seatConfig);
                    return (
                      <button
                        key={seat}
                        onClick={() => toggleSeat(seat)}
                        disabled={isTaken || !seatState.data || seatState.isError}
                        aria-label={`Seat ${seat}, ${cat}, ${isTaken ? "occupied" : isSel ? "selected" : "available"}`}
                        aria-pressed={isSel}
                        className={`h-7 w-7 rounded-md border text-[10px] transition ${
                          i === 3 || i === 8 ? "mr-4" : ""
                        } ${
                          isTaken
                            ? "cursor-not-allowed border-border bg-surface-2 text-muted-foreground/40"
                            : isSel
                              ? "scale-110 border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                              : cat === "Recliner"
                                ? "border-accent/50 text-accent hover:bg-accent/15"
                                : cat === "Premium"
                                  ? "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15"
                                  : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
                        }`}
                      >
                        {isTaken ? "✕" : i + 1}
                      </button>
                    );
                  })}
                </div>
                <span className="w-5 text-xs text-muted-foreground">{row}</span>
              </div>
            ))}

            <div className="mt-6 flex flex-wrap justify-center gap-4 text-[11px] text-muted-foreground">
              {seatConfig.categories.map((category) => (
                <span key={category.category} className="flex items-center gap-1.5">
                  <i
                    className={`h-3 w-3 rounded border ${category.category === "Recliner" ? "border-accent/60" : category.category === "Premium" ? "border-emerald-500/60" : "border-border"}`}
                  />
                  {category.category} {inr(Math.round(show.price * category.multiplier))}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <i className="h-3 w-3 rounded bg-primary" /> Selected
              </span>
              <span className="flex items-center gap-1.5">
                <i className="h-3 w-3 rounded bg-surface-2" /> Occupied
              </span>
            </div>
          </div>
        </div>

        <aside className="sticky bottom-16 h-fit rounded-2xl border border-border bg-surface p-5 lg:top-24 lg:bottom-auto">
          <h2 className="text-sm font-semibold">Your selection</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {selected.length ? (
              <>
                <span className="font-semibold text-foreground">{selected.join(", ")}</span> ·{" "}
                {selected.length} seat{selected.length > 1 ? "s" : ""}
              </>
            ) : (
              "No seats selected yet."
            )}
          </p>
          <dl className="mt-4 grid gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tickets</dt>
              <dd>{inr(breakdown.tickets)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Convenience fee</dt>
              <dd>{inr(breakdown.fee)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Taxes</dt>
              <dd>{inr(breakdown.taxes)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd>{inr(breakdown.total)}</dd>
            </div>
          </dl>
          <button
            disabled={
              !selected.length ||
              !user ||
              seatState.isError ||
              !seatState.data ||
              selected.some((seat) => taken.has(seat))
            }
            onClick={() =>
              navigate({
                to: "/checkout/$showId",
                params: { showId: show.id },
                search: { seats: selected.join(",") },
              })
            }
            className="mt-4 w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Proceed to Summary
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Up to {MAX_SEATS} seats per booking.
          </p>
        </aside>
      </div>
    </div>
  );
}
