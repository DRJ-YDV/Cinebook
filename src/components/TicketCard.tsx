import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Booking } from "@/lib/store";
import { inr } from "@/lib/pricing";

export function TicketCard({ booking }: { booking: Booking }) {
  const [qr, setQr] = useState<string>("");
  const [qrError, setQrError] = useState(false);
  const [qrAttempt, setQrAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setQr("");
    setQrError(false);
    if (booking.status !== "confirmed" || booking.paymentStatus !== "PAID" || !booking.qrPayload)
      return;
    const payload = booking.qrPayload;
    QRCode.toDataURL(payload, {
      width: 320,
      margin: 1,
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then((value) => {
        if (active) setQr(value);
      })
      .catch(() => {
        if (active) setQrError(true);
      });
    return () => {
      active = false;
    };
  }, [booking, qrAttempt]);

  const cancelled = booking.status === "cancelled";

  return (
    <div
      id="printable-ticket"
      className="animate-ticket mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-border bg-surface"
    >
      <div className="flex items-center justify-between bg-primary px-5 py-3 text-primary-foreground">
        <span className="font-display text-lg font-extrabold tracking-wide">CINEBOOK</span>
        <span className="rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-semibold tracking-widest uppercase">
          {cancelled ? "Cancelled" : "Confirmed"}
        </span>
      </div>

      <div className="flex gap-4 p-5">
        <img
          src={booking.poster}
          alt={`${booking.movieTitle} poster`}
          className="h-28 w-20 rounded-xl object-cover"
        />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{booking.movieTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {booking.theatreName} · {booking.screen}
          </p>
          <p className="text-xs text-muted-foreground">{booking.address}</p>
          <p className="mt-2 text-sm font-semibold">
            {new Date(booking.date)
              .toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
              .toUpperCase()}{" "}
            · {booking.time}
          </p>
        </div>
      </div>

      <div className="relative border-t border-dashed border-border">
        <span className="absolute -top-3 -left-3 h-6 w-6 rounded-full bg-background" />
        <span className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-background" />
      </div>

      <div className="grid grid-cols-2 gap-4 p-5 text-sm">
        <div>
          <p className="text-[10px] tracking-widest text-muted-foreground uppercase">Seats</p>
          <p className="font-bold">{booking.seats.join(" • ")}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-widest text-muted-foreground uppercase">Format</p>
          <p className="font-bold">{booking.format}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-widest text-muted-foreground uppercase">Booking ID</p>
          <p className="font-bold">{booking.id}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-widest text-muted-foreground uppercase">Amount paid</p>
          <p className="font-bold">{inr(booking.amount)}</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 border-t border-border p-5">
        {qr ? (
          <img
            src={qr}
            alt={`QR code for booking ${booking.id}`}
            className="h-40 w-40 rounded-xl"
          />
        ) : qrError ? (
          <div role="alert" className="py-6 text-center text-sm text-muted-foreground">
            <p>The QR code could not be generated.</p>
            <button
              type="button"
              onClick={() => setQrAttempt((attempt) => attempt + 1)}
              className="mt-2 text-primary"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="h-40 w-40 animate-pulse rounded-xl bg-surface-2" />
        )}
        <p className="text-center text-[11px] text-muted-foreground">
          Please arrive 15 minutes before the show.
          <br />
          Demo ticket QR — not valid for real entry.
        </p>
      </div>
    </div>
  );
}
