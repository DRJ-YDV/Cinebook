/**
 * Razorpay Standard Checkout — server-only helpers.
 *
 * The Key Secret is read from `process.env` inside each function and never
 * leaves the server. Only the Key ID and the created order are returned to the
 * browser. Test mode keys (`rzp_test_...`) are expected.
 */

import { DbError } from "./db/mongo.server";

const API = "https://api.razorpay.com/v1";

function creds() {
  const keyId = process.env["RAZORPAY_KEY_ID"]?.trim();
  const keySecret = process.env["RAZORPAY_KEY_SECRET"]?.trim();
  return { keyId, keySecret };
}

export function isRazorpayConfigured() {
  const { keyId, keySecret } = creds();
  return Boolean(keyId && keySecret);
}

export function getKeyId(): string {
  const { keyId } = creds();
  if (!keyId) throw new DbError("PAYMENT_ERROR", "Online payments are not configured yet.");
  return keyId;
}

function requireCreds() {
  const { keyId, keySecret } = creds();
  if (!keyId || !keySecret)
    throw new DbError("PAYMENT_ERROR", "Online payments are not configured yet.");
  return { keyId, keySecret };
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
};

/** Creates an order through the Razorpay Orders API (amount in paise). */
export async function createOrder(input: {
  amountInRupees: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (
    !Number.isFinite(input.amountInRupees) ||
    input.amountInRupees <= 0 ||
    input.amountInRupees > 100000
  )
    throw new DbError("PAYMENT_ERROR", "The payable amount is invalid.");
  const { keyId, keySecret } = requireCreds();
  const auth = btoa(`${keyId}:${keySecret}`);
  let res: Response;
  try {
    res = await fetch(`${API}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: Math.round(input.amountInRupees * 100),
        currency: "INR",
        receipt: input.receipt.slice(0, 40),
        payment_capture: 1,
        notes: input.notes ?? {},
      }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new DbError("PAYMENT_ERROR", "Could not reach the payment gateway. Try again.");
  }
  const body = (await res.json().catch(() => null)) as
    (RazorpayOrder & { error?: { description?: string } }) | null;
  if (
    !res.ok ||
    !body?.id ||
    body.amount !== Math.round(input.amountInRupees * 100) ||
    body.currency !== "INR"
  ) {
    // Provider details stay in the server log; the browser gets a safe message.
    console.error("[razorpay] order creation failed", res.status);
    throw new DbError("PAYMENT_ERROR", "We couldn't start the payment. Please try again.");
  }
  return body;
}

/** HMAC-SHA256(order_id|payment_id) compared against the checkout signature. */
export async function verifySignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<boolean> {
  if (
    !/^order_[A-Za-z0-9]+$/.test(input.orderId) ||
    !/^pay_[A-Za-z0-9]+$/.test(input.paymentId) ||
    !/^[a-fA-F0-9]{64}$/.test(input.signature)
  )
    return false;
  const { keySecret } = requireCreds();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(keySecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${input.orderId}|${input.paymentId}`),
  );
  const expected = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = input.signature.trim().toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export type CapturedPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
};

/** Signature authenticity is followed by a provider read of capture, order and amount. */
export async function fetchCapturedPayment(input: {
  paymentId: string;
  orderId: string;
  amountInRupees: number;
}): Promise<CapturedPayment> {
  if (!/^pay_[A-Za-z0-9]+$/.test(input.paymentId) || !/^order_[A-Za-z0-9]+$/.test(input.orderId))
    throw new DbError("PAYMENT_ERROR", "The payment reference is invalid.");
  const { keyId, keySecret } = requireCreds();
  let response: Response;
  try {
    response = await fetch(`${API}/payments/${encodeURIComponent(input.paymentId)}`, {
      headers: {
        accept: "application/json",
        authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new DbError("PAYMENT_ERROR", "Payment status could not be verified. Please try again.");
  }
  const payment = (await response.json().catch(() => null)) as CapturedPayment | null;
  if (
    !response.ok ||
    !payment ||
    payment.id !== input.paymentId ||
    payment.order_id !== input.orderId ||
    payment.amount !== Math.round(input.amountInRupees * 100) ||
    payment.currency !== "INR" ||
    payment.status !== "captured" ||
    payment.captured !== true
  )
    throw new DbError(
      "PAYMENT_ERROR",
      "The gateway has not confirmed a captured payment for this booking.",
    );
  return payment;
}
