/** Loads the Razorpay Standard Checkout script once, in the browser only. */

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (e: string, cb: (p: unknown) => void) => void;
    };
  }
}

let loading: Promise<boolean> | null = null;

export function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (loading) return loading;
  loading = new Promise<boolean>((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(Boolean(window.Razorpay));
    s.onerror = () => {
      loading = null;
      resolve(false);
    };
    document.body.appendChild(s);
  });
  return loading;
}

export type CheckoutResult =
  | {
      status: "success";
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }
  | { status: "failed"; reason: string; razorpayPaymentId?: string }
  | { status: "dismissed" };

/** Opens Standard Checkout and resolves once the user finishes or cancels. */
export function openRazorpayCheckout(opts: {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
}): Promise<CheckoutResult> {
  return new Promise((resolve) => {
    const Ctor = window.Razorpay;
    if (!Ctor) {
      resolve({ status: "failed", reason: "Payment window could not be opened." });
      return;
    }
    let settled = false;
    const done = (r: CheckoutResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    const rzp = new Ctor({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amount,
      currency: opts.currency,
      name: opts.name,
      description: opts.description,
      theme: { color: "#e11d48" },
      prefill: opts.prefill ?? {},
      handler: (res: unknown) => {
        const r = res as {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        };
        done({
          status: "success",
          razorpayOrderId: r.razorpay_order_id,
          razorpayPaymentId: r.razorpay_payment_id,
          razorpaySignature: r.razorpay_signature,
        });
      },
      modal: { ondismiss: () => done({ status: "dismissed" }) },
    });
    rzp.on("payment.failed", (res: unknown) => {
      const e = (res as { error?: { description?: string; metadata?: { payment_id?: string } } })
        .error;
      done({
        status: "failed",
        reason: e?.description ?? "Payment failed.",
        ...(e?.metadata?.payment_id ? { razorpayPaymentId: e.metadata.payment_id } : {}),
      });
    });
    rzp.open();
  });
}
