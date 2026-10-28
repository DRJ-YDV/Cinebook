import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { BookingSteps } from "@/components/BookingSteps";
import { type Offer } from "@/data/catalog";
import { computePrice, inr, type PriceBreakdown } from "@/lib/pricing";
import { useApp } from "@/lib/store";
import { friendlyError, loadShowContext, offersQuery } from "@/lib/cinebook-queries";
import { priceForRow } from "@/lib/db/models";
import {
  createBooking as createBookingFn,
  getPaymentConfig,
  createRazorpayOrder,
  verifyRazorpayPayment,
  failRazorpayPayment,
} from "@/lib/cinebook.functions";
import { loadRazorpay, openRazorpayCheckout } from "@/lib/razorpay-checkout";

type Search = { seats?: string | undefined };

export const Route = createFileRoute("/checkout/$showId")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    seats: typeof s["seats"] === "string" ? (s["seats"] as string) : undefined,
  }),
  loader: async ({ params, context }) => {
    return loadShowContext(context.queryClient, params.showId);
  },
  head: () => ({
    meta: [
      { title: "Booking Summary & Payment — CineBook" },
      {
        name: "description",
        content: "Review your seats, apply an offer and complete secure test checkout on CineBook.",
      },
      { property: "og:title", content: "Booking Summary & Payment — CineBook" },
      { property: "og:description", content: "Review your booking and pay securely (demo)." },
    ],
  }),
  component: Checkout,
});

function Checkout() {
  const { showId } = Route.useParams();
  const { seats: seatsParam } = Route.useSearch();
  const { movie, show, theatre, seatConfig } = Route.useLoaderData();
  const navigate = useNavigate();
  const { user, hydrated } = useApp();
  const queryClient = useQueryClient();
  const busyRef = useRef(false);
  const attemptKey = useRef<{ selection: string; id: string } | null>(null);
  const pendingBooking = useRef<{
    key: string;
    booking: Awaited<ReturnType<typeof createBookingFn>>;
  } | null>(null);

  const [stage, setStage] = useState<"summary" | "payment">("summary");
  const [offer, setOffer] = useState<Offer | null>(null);
  const [code, setCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const [payState, setPayState] = useState<
    "idle" | "creating" | "gateway" | "verifying" | "confirmed" | "failed"
  >("idle");
  const [payMessage, setPayMessage] = useState("");
  const [serverPrice, setServerPrice] = useState<PriceBreakdown | null>(null);
  const [paymentAttempt, setPaymentAttempt] = useState(0);

  // Razorpay Key ID is served by the server; the secret never reaches here.
  const payConfig = useQuery({
    queryKey: ["payment-config"],
    queryFn: () => getPaymentConfig(),
    staleTime: 5 * 60_000,
  });
  const razorpayReady = payConfig.data?.enabled === true && Boolean(payConfig.data.keyId);

  // Only server-listed offers can be applied. The booking server checks eligibility.
  const offersData = useQuery(offersQuery());
  const offerList: Offer[] = (offersData.data ?? []).map((o) => ({
    code: o.code,
    title: o.title,
    description: o.description,
    type: o.type,
    value: o.value,
    ...("max" in o && o.max ? { max: o.max } : {}),
    icon: o.icon,
  })) as Offer[];

  const seats = (seatsParam ?? "").split(",").filter(Boolean);

  if (!hydrated) return <div className="mx-auto max-w-md px-4 py-24">Loading your account…</div>;
  if (!user)
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Sign in to complete your booking</h1>
        <Link
          to="/login"
          className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Sign in
        </Link>
      </div>
    );

  if (!show || !movie || !theatre || seats.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Invalid seat selection</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick your seats again to continue with the booking.
        </p>
        <Link
          to="/movies"
          className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Back to movies
        </Link>
      </div>
    );
  }

  const price =
    serverPrice ??
    computePrice(
      seats.map((s) => priceForRow(show.price, s[0]!, seatConfig)),
      offer,
    );

  const applyCode = () => {
    const found = offerList.find((o) => o.code.toLowerCase() === code.trim().toLowerCase());
    if (!found) {
      toast.error("That offer code isn't valid.");
      return;
    }
    setOffer(found);
    setServerPrice(null);
    toast.success(`${found.code} applied`);
  };

  const finish = (bookingId: string) => {
    setProcessing(false);
    setPayState("confirmed");
    toast.success("Payment successful — booking confirmed");
    void navigate({
      to: "/ticket/$bookingId",
      params: { bookingId },
      search: { new: true },
    });
  };

  const failPay = (message: string) => {
    setProcessing(false);
    setPayState("failed");
    setPayMessage(message);
    toast.error(message);
  };

  const pay = async () => {
    if (busyRef.current) return;
    if (!user) {
      failPay("Sign in before booking your seats.");
      return;
    }
    if (!razorpayReady) {
      failPay("Payments are unavailable until test checkout is configured.");
      return;
    }
    const selection = JSON.stringify([
      user.userId,
      showId,
      seatsParam,
      offer?.code,
      paymentAttempt,
    ]);
    if (attemptKey.current?.selection !== selection)
      attemptKey.current = { selection, id: crypto.randomUUID() };
    const idempotencyKey = attemptKey.current.id;
    busyRef.current = true;
    setProcessing(true);
    setPayMessage("");
    setPayState("creating");
    let bookingId: string | undefined;
    try {
      const created =
        pendingBooking.current?.key === idempotencyKey
          ? pendingBooking.current.booking
          : await createBookingFn({
              data: {
                showId: show.id,
                seats,
                offerCode: offer?.code ?? null,
                paymentMethod: "Razorpay",
                idempotencyKey,
              },
            });
      pendingBooking.current = { key: idempotencyKey, booking: created };
      bookingId = created.bookingId;
      setServerPrice(created.amount);
      if (created.amount.total !== price.total) {
        failPay(
          "The server updated your total. Review the price details and select Pay again to continue.",
        );
        return;
      }
      const order = await createRazorpayOrder({ data: { bookingId } });
      if (order.alreadyPaid) {
        await queryClient.invalidateQueries({ queryKey: ["db", "bookings"] });
        finish(bookingId);
        return;
      }
      if (!(await loadRazorpay()))
        throw new Error("Could not open the payment window. Please try again.");
      setPayState("gateway");
      const result = await openRazorpayCheckout({
        keyId: order.keyId,
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "CineBook",
        description: movie.title + " · " + seats.join(", "),
        prefill: { name: user.name, email: user.email, contact: user.phone },
      });
      if (result.status !== "success") {
        await failRazorpayPayment({ data: { bookingId, reason: result.status } });
        pendingBooking.current = null;
        setPaymentAttempt((attempt) => attempt + 1);
        failPay(
          result.status === "dismissed"
            ? "Payment cancelled. No ticket has been issued."
            : result.reason,
        );
        return;
      }
      setPayState("verifying");
      const verified = await verifyRazorpayPayment({
        data: {
          bookingId,
          razorpayOrderId: result.razorpayOrderId,
          razorpayPaymentId: result.razorpayPaymentId,
          razorpaySignature: result.razorpaySignature,
        },
      });
      if (
        !verified.verified ||
        !verified.booking ||
        verified.booking.status !== "CONFIRMED" ||
        verified.booking.paymentStatus !== "PAID"
      ) {
        failPay("Payment verification failed. No ticket has been issued.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["db", "bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["db", "seats", show.id] });
      finish(bookingId);
    } catch (error) {
      failPay(friendlyError(error));
    } finally {
      busyRef.current = false;
      setProcessing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <BookingSteps current={stage === "summary" ? 3 : 4} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-2xl border border-border bg-surface p-5">
          {stage === "summary" ? (
            <>
              <h1 className="text-lg font-bold tracking-wide uppercase">Booking Summary</h1>
              <div className="mt-4 flex gap-4">
                <img
                  src={movie.poster}
                  alt={`${movie.title} poster`}
                  className="h-32 w-22 rounded-xl object-cover"
                />
                <div className="text-sm">
                  <h2 className="text-base font-semibold">{movie.title}</h2>
                  <p className="text-muted-foreground">
                    {movie.language.join("/")} · {show.format} · {movie.certification}
                  </p>
                  <p className="mt-2 font-medium">
                    {theatre.name} · {show.screen}
                  </p>
                  <p className="text-muted-foreground">{theatre.address}</p>
                  <p className="mt-2 font-medium">
                    {new Date(show.date).toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}{" "}
                    · {show.time}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-border p-4">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">Seats</p>
                <p className="mt-1 text-lg font-bold tracking-wide">{seats.join(" • ")}</p>
                <p className="text-xs text-muted-foreground">
                  {seats.length} ticket{seats.length > 1 ? "s" : ""}
                </p>
              </div>

              <div className="mt-5">
                <label
                  htmlFor="offer"
                  className="text-xs tracking-wide text-muted-foreground uppercase"
                >
                  Apply an offer
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="offer"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="FIRST100"
                    className="h-10 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none focus:border-primary/60"
                  />
                  <button
                    onClick={applyCode}
                    className="rounded-xl border border-border px-4 text-sm font-semibold hover:bg-surface-2"
                  >
                    Apply
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {offerList.map((o) => (
                    <button
                      key={o.code}
                      onClick={() => {
                        setOffer(o);
                        setCode(o.code);
                        toast.success(`${o.code} applied`);
                      }}
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-accent/60 hover:text-accent"
                    >
                      {o.icon} {o.code}
                    </button>
                  ))}
                  {offer && (
                    <button
                      onClick={() => {
                        setOffer(null);
                        setCode("");
                      }}
                      className="rounded-full border border-primary/50 px-2.5 py-1 text-[11px] text-primary"
                    >
                      Remove offer
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={() => setStage("payment")}
                className="mt-6 w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
              >
                Proceed to Payment · {inr(price.total)}
              </button>
            </>
          ) : (
            <>
              <h1 className="text-lg font-bold tracking-wide uppercase">Payment Method</h1>
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {payConfig.isPending
                  ? "Checking payment availability…"
                  : razorpayReady
                    ? "Pay through Razorpay test checkout. Use test payment details only."
                    : "Payments are unavailable until test checkout is configured. No booking can be confirmed."}
              </p>

              {payState === "failed" && payMessage && (
                <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {payMessage}
                </p>
              )}
              {payState === "confirmed" && (
                <p className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                  Payment verified — booking confirmed.
                </p>
              )}

              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setStage("summary")}
                  disabled={processing}
                  className="rounded-full border border-border px-4 py-3 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={pay}
                  disabled={processing || !razorpayReady || !user}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-70"
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {payState === "creating"
                        ? "Holding your seats…"
                        : payState === "gateway"
                          ? "Waiting for payment…"
                          : payState === "verifying"
                            ? "Verifying payment…"
                            : "Processing payment…"}
                    </>
                  ) : (
                    <>Pay {inr(price.total)}</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        <aside className="h-fit rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-24">
          <h2 className="text-sm font-semibold">Price details</h2>
          <dl className="mt-3 grid gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tickets ({seats.length})</dt>
              <dd>{inr(price.tickets)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Convenience fee</dt>
              <dd>{inr(price.fee)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Taxes</dt>
              <dd>{inr(price.taxes)}</dd>
            </div>
            {price.discount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <dt>Discount ({offer?.code})</dt>
                <dd>-{inr(price.discount)}</dd>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd>{inr(price.total)}</dd>
            </div>
          </dl>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            Booking for {user ? user.name : "Guest"}
          </p>
        </aside>
      </div>
    </div>
  );
}
