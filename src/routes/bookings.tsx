import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError } from "@/lib/cinebook-queries";
import { cancelBooking as cancelBookingFn } from "@/lib/cinebook.functions";
import { inr } from "@/lib/pricing";
import { useApp, type Booking } from "@/lib/store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "My Bookings — CineBook" },
      {
        name: "description",
        content:
          "View upcoming, completed and cancelled CineBook bookings, open your ticket or cancel a reservation.",
      },
      { property: "og:title", content: "My Bookings — CineBook" },
      { property: "og:description", content: "All your movie tickets in one place." },
    ],
  }),
  component: MyBookings,
});

type Tab = "upcoming" | "completed" | "cancelled";

function isPast(b: Booking) {
  return new Date(`${b.date}T23:59:59`).getTime() < Date.now();
}

function MyBookings() {
  const { bookings, hydrated, user, bookingsLoading, bookingsError, refreshBookings } = useApp();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [pending, setPending] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const cancel = async (id: string) => {
    if (cancelling) return;
    setCancelling(id);
    try {
      const cancelled = await cancelBookingFn({ data: { bookingId: id } });
      await queryClient.invalidateQueries({ queryKey: ["db", "bookings"] });
      toast.success(
        cancelled.paymentStatus === "REFUND_PENDING"
          ? "Booking cancelled. Your refund is pending provider processing."
          : "Booking cancelled and seats released",
      );
      setTab("cancelled");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setCancelling(null);
    }
  };

  const filtered = bookings.filter((b) =>
    tab === "cancelled"
      ? b.status === "cancelled"
      : tab === "completed"
        ? b.status !== "cancelled" && isPast(b)
        : b.status !== "cancelled" && !isPast(b),
  );

  if (hydrated && !user)
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Sign in to see your bookings</h1>
        <Link
          to="/login"
          className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Sign in
        </Link>
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">My Bookings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bookings are saved to your account and verified by the server.
      </p>
      {bookingsError && (
        <div role="alert" className="mt-6 rounded-xl border border-destructive/40 p-4 text-sm">
          <p>{bookingsError}</p>
          <button onClick={refreshBookings} className="mt-2 text-primary">
            Try again
          </button>
        </div>
      )}

      <div className="mt-5 flex gap-2" role="tablist" aria-label="Booking status">
        {(["upcoming", "completed", "cancelled"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-2 text-sm capitalize transition ${
              tab === t
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-surface-2"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {!hydrated || bookingsLoading ? (
        <div className="mt-6 grid gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      ) : !bookingsError && filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="text-lg font-semibold">Nothing here yet 🍿</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === "upcoming"
              ? "Book a movie and your ticket will appear here."
              : `No ${tab} bookings.`}
          </p>
          <Link
            to="/movies"
            className="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Browse movies
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4">
          {filtered.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:flex-row"
            >
              <img
                src={b.poster}
                alt={`${b.movieTitle} poster`}
                className="h-32 w-22 shrink-0 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{b.movieTitle}</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase ${
                      b.status === "cancelled"
                        ? "bg-destructive/20 text-destructive"
                        : "bg-emerald-500/20 text-emerald-400"
                    }`}
                  >
                    {b.status === "cancelled"
                      ? b.paymentStatus === "REFUND_PENDING"
                        ? "Cancelled · refund pending"
                        : "Cancelled"
                      : b.status === "confirmed"
                        ? isPast(b)
                          ? "Completed"
                          : "Confirmed"
                        : b.status === "failed"
                          ? "Payment failed"
                          : "Payment pending"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {b.theatreName} · {b.screen} · {b.format}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(b.date).toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {b.time}
                </p>
                <p className="mt-1 text-sm">
                  Seats <span className="font-semibold">{b.seats.join(", ")}</span> ·{" "}
                  {inr(b.amount)} · ID {b.id}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {b.status === "confirmed" && (
                    <Link
                      to="/ticket/$bookingId"
                      params={{ bookingId: b.id }}
                      className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      View Ticket
                    </Link>
                  )}
                  {b.status !== "cancelled" && !isPast(b) && (
                    <button
                      onClick={() => setPending(b.id)}
                      disabled={cancelling !== null}
                      className="rounded-full border border-destructive/60 px-3.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    >
                      Cancel Booking
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel booking?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this booking? Your seats will be released back to the
              show.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) void cancel(pending);
                setPending(null);
              }}
            >
              Cancel Ticket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
