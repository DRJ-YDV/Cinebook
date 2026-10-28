import type { SeatConfig } from "./db/models";

/** Showtime dates are interpreted in the cinema's India timezone, never the host timezone. */
export function showStartsAt(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const match = /^(0?[1-9]|1[0-2]):([0-5]\d) (AM|PM)$/.exec(time);
  if (!match) return null;
  const hour = (Number(match[1]) % 12) + (match[3] === "PM" ? 12 : 0);
  const stamp = new Date(`${date}T${String(hour).padStart(2, "0")}:${match[2]}:00+05:30`);
  if (!Number.isFinite(stamp.getTime())) return null;
  // Reject calendar rollover such as February 31.
  const indiaDate = new Date(stamp.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return indiaDate === date ? stamp.toISOString() : null;
}

export function validSeatCodes(seats: string[], config: SeatConfig): boolean {
  if (!Array.isArray(seats) || seats.length === 0 || seats.length > 10) return false;
  if (new Set(seats).size !== seats.length) return false;
  return seats.every((seat) => {
    if (typeof seat !== "string") return false;
    const match = /^([A-Z]+)([1-9]\d*)$/.exec(seat);
    return !!match && config.rows.includes(match[1]!) && Number(match[2]) <= config.seatsPerRow;
  });
}
