import { THEATRES, type Format, type Movie, type Theatre } from "@/data/catalog";
import { lookupMovie } from "./movie-registry";
import { showStartsAt } from "./booking-rules";

export type Show = {
  id: string;
  movieId: string;
  theatreId: string;
  screen: string;
  date: string; // yyyy-mm-dd
  time: string; // "10:00 AM"
  format: Format;
  price: number; // base regular price
};

export function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export const TIME_SLOTS = [
  "09:15 AM",
  "10:30 AM",
  "11:45 AM",
  "01:15 PM",
  "03:00 PM",
  "04:30 PM",
  "06:15 PM",
  "07:30 PM",
  "09:00 PM",
  "10:45 PM",
];

export function slotPeriod(time: string): "Morning" | "Afternoon" | "Evening" | "Night" {
  const [hm, ap] = time.split(" ");
  const h24 = (Number(hm!.split(":")[0]) % 12) + (ap === "PM" ? 12 : 0);
  if (h24 < 12) return "Morning";
  if (h24 < 16) return "Afternoon";
  if (h24 < 20) return "Evening";
  return "Night";
}

export function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function nextDays(n: number) {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

export function getMovie(id: string): Movie | undefined {
  return lookupMovie(id);
}

export function getTheatre(id: string): Theatre | undefined {
  return THEATRES.find((t) => t.id === id);
}

/** Deterministic mock show generation. */
export function getShowsFor(movieId: string, theatreId: string, date: string): Show[] {
  const movie = getMovie(movieId);
  const theatre = getTheatre(theatreId);
  if (!movie || !theatre || movie.status !== "now-showing") return [];
  return generateShows(movie, theatre, date);
}

/** Shared schedule calculation. Server callers supply trusted movie/theatre records. */
export function generateShows(movie: Movie, theatre: Theatre, date: string): Show[] {
  if (movie.status !== "now-showing" || !theatre.screens.length) return [];
  const formats = movie.formats.filter((format) => theatre.formats.includes(format));
  if (!formats.length) return [];
  const movieId = movie.id;
  const theatreId = theatre.id;
  const base = hash(movieId + theatreId + date);
  return TIME_SLOTS.filter((_, i) => (base >> i) % 3 !== 0)
    .map((time, idx) => {
      const seed = hash(movieId + theatreId + date + time);
      const format = formats[seed % formats.length]!;
      const screen = theatre.screens[seed % theatre.screens.length]!;
      const premium = format === "IMAX" ? 120 : format === "4DX" ? 160 : format === "3D" ? 60 : 0;
      const evening = slotPeriod(time) === "Evening" || slotPeriod(time) === "Night" ? 40 : 0;
      return {
        id: `${movieId}_${theatreId}_${date}_${time.replace(/[: ]/g, "")}`,
        movieId,
        theatreId,
        screen: screen.name,
        date,
        time,
        format,
        price: 180 + premium + evening + (idx % 2 === 0 ? 0 : 20),
      };
    })
    .filter((show) => {
      const startsAt = showStartsAt(show.date, show.time);
      return !!startsAt && new Date(startsAt).getTime() > Date.now();
    });
}

export function theatresInCity(city: string) {
  return THEATRES.filter((t) => t.city === city);
}

/** Resolve a generated show id back into a Show. */
export function findShow(showId: string): Show | undefined {
  const [movieId, theatreId, date] = showId.split("_");
  if (!movieId || !theatreId || !date) return undefined;
  return getShowsFor(movieId, theatreId, date).find((s) => s.id === showId);
}

/* ---------------- Seats ---------------- */

export type SeatCategory = "Regular" | "Premium" | "Recliner";
export const SEAT_ROWS = ["A", "B", "C", "D", "E", "F", "G", "H", "J"];
export const SEATS_PER_ROW = 12;

export function categoryOf(row: string): SeatCategory {
  if ("ABC".includes(row)) return "Regular";
  if ("DEFG".includes(row)) return "Premium";
  return "Recliner";
}

export function seatPrice(basePrice: number, row: string) {
  const cat = categoryOf(row);
  if (cat === "Regular") return basePrice;
  if (cat === "Premium") return Math.round(basePrice * 1.4);
  return Math.round(basePrice * 2.2);
}

/** Deterministic pre-occupied seats for a show. */
export function occupiedSeats(showId: string): string[] {
  const out: string[] = [];
  for (const row of SEAT_ROWS) {
    for (let i = 1; i <= SEATS_PER_ROW; i++) {
      const h = hash(`${showId}:${row}${i}`);
      if (h % 100 < 26) out.push(`${row}${i}`);
    }
  }
  return out;
}

export function occupancyLabel(showId: string) {
  const total = SEAT_ROWS.length * SEATS_PER_ROW;
  const taken = occupiedSeats(showId).length / total;
  if (taken > 0.85) return { label: "Sold Out", tone: "soldout" as const };
  if (taken > 0.32) return { label: "Almost Full", tone: "almost" as const };
  if (taken > 0.24) return { label: "Filling Fast", tone: "filling" as const };
  return { label: "Available", tone: "available" as const };
}
