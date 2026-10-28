import type { Offer } from "@/data/catalog";

export type PriceBreakdown = {
  tickets: number;
  fee: number;
  taxes: number;
  discount: number;
  total: number;
};

export function computePrice(seatPrices: number[], offer?: Offer | null): PriceBreakdown {
  const tickets = seatPrices.reduce((a, b) => a + b, 0);
  const fee = seatPrices.length * 25;
  const taxes = Math.round((tickets + fee) * 0.06);
  let discount = 0;
  if (offer && tickets > 0) {
    discount =
      offer.type === "flat"
        ? offer.value
        : Math.min(
            Math.round((tickets * offer.value) / 100),
            "max" in offer ? offer.max : Infinity,
          );
    discount = Math.min(discount, tickets);
  }
  return { tickets, fee, taxes, discount, total: tickets + fee + taxes - discount };
}

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
