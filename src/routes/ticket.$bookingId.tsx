import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Home, Printer, Share2, Ticket as TicketIcon } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { BookingSteps } from "@/components/BookingSteps";
import { TicketCard } from "@/components/TicketCard";
import { bookingFromDoc, useApp } from "@/lib/store";
import { bookingQuery, friendlyError } from "@/lib/cinebook-queries";

type Search = { new?: boolean | undefined };

export const Route = createFileRoute("/ticket/$bookingId")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    new: s["new"] === true || s["new"] === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Your Digital Ticket — CineBook" },
      {
        name: "description",
        content: "Your CineBook digital ticket with QR code, seats, screen and showtime details.",
      },
      { property: "og:title", content: "Your Digital Ticket — CineBook" },
      { property: "og:description", content: "Show this QR ticket at the cinema entrance." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TicketPage,
});

function TicketPage() {
  const { bookingId } = Route.useParams();
  const { new: isNew } = Route.useSearch();
  const { hydrated, user } = useApp();
  const result = useQuery(bookingQuery(bookingId, user?.userId));
  const booking = result.data ? bookingFromDoc(result.data) : undefined;

  if (!hydrated || (user && result.isPending)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="h-96 animate-pulse rounded-3xl bg-surface" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Ticket not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {!user
            ? "Sign in to access your tickets."
            : result.error
              ? friendlyError(result.error)
              : "This ticket is unavailable for your account."}
        </p>
        <Link
          to="/bookings"
          className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Go to My Bookings
        </Link>
      </div>
    );
  }

  if (booking.status !== "confirmed" || booking.paymentStatus !== "PAID" || !booking.qrPayload)
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Ticket unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A ticket is issued only after payment is verified. This booking is {booking.status}.
        </p>
        <Link to="/bookings" className="mt-6 inline-block text-primary">
          Go to My Bookings
        </Link>
      </div>
    );

  const download = () => {
    const text = [
      "CINEBOOK — DEMO TICKET",
      "==========================",
      booking.movieTitle,
      `${booking.theatreName} · ${booking.screen}`,
      booking.address,
      `${booking.date} · ${booking.time} · ${booking.format}`,
      `Seats: ${booking.seats.join(", ")}`,
      `Booking ID: ${booking.id}`,
      `Amount: ₹${booking.amount}`,
      `Status: ${booking.status.toUpperCase()}`,
      "",
      "Razorpay test booking. Not valid for real cinema entry.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cinebook-${booking.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Ticket downloaded");
  };

  const share = async () => {
    const text = `I'm watching ${booking.movieTitle} at ${booking.theatreName} — seats ${booking.seats.join(", ")}. Booking ${booking.id} (CineBook demo).`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "CineBook ticket", text });
        return;
      } catch {
        /* dismissed */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Ticket details copied to clipboard");
    } catch {
      toast.error("Sharing is unavailable in this browser.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <BookingSteps current={5} />

      {isNew && (
        <div className="animate-rise mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
          <p className="text-3xl">🎉</p>
          <h1 className="mt-1 text-xl font-bold text-emerald-400">Booking Confirmed</h1>
          <p className="text-sm text-muted-foreground">
            Payment successful — your tickets are ready.
          </p>
        </div>
      )}

      <div className="mt-6">
        <TicketCard booking={booking} />
      </div>

      <div className="mx-auto mt-6 flex max-w-md flex-wrap justify-center gap-2 print:hidden">
        <button
          onClick={download}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Download
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-2"
        >
          <Printer className="h-4 w-4" aria-hidden="true" /> Print
        </button>
        <button
          onClick={share}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-2"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" /> Share
        </button>
        <Link
          to="/bookings"
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-2"
        >
          <TicketIcon className="h-4 w-4" aria-hidden="true" /> My Bookings
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-2"
        >
          <Home className="h-4 w-4" aria-hidden="true" /> Home
        </Link>
      </div>
    </div>
  );
}
