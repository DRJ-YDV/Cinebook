import { queryOptions } from "@tanstack/react-query";
import type { Movie, Theatre } from "@/data/catalog";
import type { QueryClient } from "@tanstack/react-query";
import type { Show } from "./shows";
import type { Format, MovieRef, TheatreDoc } from "./db/models";
import { resolveMovie } from "./resolve-movie";
import {
  getAdminOverview,
  getAdminAccess,
  getAvailableSeats,
  getDbStatus,
  getOffers,
  getTheatres,
  getUserBookings,
  getFavorites,
  getBooking,
  getShow,
} from "./cinebook.functions";

export function theatreView(theatre: TheatreDoc): Theatre {
  return {
    id: theatre.theatreId,
    name: theatre.name,
    city: theatre.city,
    address: theatre.address,
    rating: theatre.rating,
    distanceKm: theatre.distanceKm ?? 0,
    formats: theatre.formats,
    screens: theatre.screens.map((screen) => ({
      id: screen.screenId,
      name: screen.name,
      seats: screen.seats,
    })),
  };
}

export async function loadShowContext(queryClient: QueryClient, showId: string) {
  const dbShow = await getShow({ data: { showId } });
  const movieId = dbShow.movie.movieId ?? `tmdb${dbShow.movie.tmdbId}`;
  const [movie, theatres] = await Promise.all([
    resolveMovie(queryClient, movieId),
    getTheatres({ data: {} }),
  ]);
  const dbTheatre = theatres.find((item) => item.theatreId === dbShow.theatreId);
  const show: Show = {
    id: dbShow.showId,
    movieId,
    theatreId: dbShow.theatreId,
    screen: dbShow.screenName,
    date: dbShow.date,
    time: dbShow.time,
    format: dbShow.format,
    price: dbShow.price,
  };
  const theatre: Theatre | null = dbTheatre
    ? {
        id: dbTheatre.theatreId,
        name: dbTheatre.name,
        address: dbTheatre.address,
        city: dbTheatre.city,
        rating: dbTheatre.rating,
        distanceKm: dbTheatre.distanceKm ?? 0,
        formats: dbTheatre.formats,
        screens: dbTheatre.screens.map((screen) => ({
          id: screen.screenId,
          name: screen.name,
          seats: screen.seats,
        })),
      }
    : null;
  return { show, theatre, movie: movie ?? null, seatConfig: dbShow.seatConfig };
}

/** Builds the persistent show payload from CineBook's generated showtime. */
export function showHint(show: Show, movie: Movie | undefined) {
  const tmdbId = movie?.tmdbId ?? Number(show.movieId.replace(/^tmdb/, ""));
  const movieRef: MovieRef = {
    tmdbId: Number.isFinite(tmdbId) ? tmdbId : 0,
    movieId: show.movieId,
    ...(movie?.title ? { title: movie.title } : {}),
    ...(movie?.poster ? { posterPath: movie.poster } : {}),
    ...(movie?.backdrop ? { backdropPath: movie.backdrop } : {}),
  };
  return {
    movie: movieRef,
    theatreId: show.theatreId,
    screenName: show.screen,
    date: show.date,
    time: show.time,
    format: show.format as Format,
    language: movie?.language?.[0] ?? "Hindi",
    price: show.price,
  };
}

export const dbStatusQuery = () =>
  queryOptions({
    queryKey: ["db", "status"],
    queryFn: () => getDbStatus(),
    staleTime: 5 * 60_000,
    retry: false,
  });

export const theatresQuery = (city?: string) =>
  queryOptions({
    queryKey: ["db", "theatres", city ?? "all"],
    queryFn: () => getTheatres({ data: city ? { city } : {} }),
    staleTime: 5 * 60_000,
    retry: false,
  });

export const offersQuery = () =>
  queryOptions({
    queryKey: ["db", "offers"],
    queryFn: () => getOffers(),
    staleTime: 5 * 60_000,
    retry: false,
  });

export const seatsQuery = (showId: string, hint?: ReturnType<typeof showHint>) =>
  queryOptions({
    queryKey: ["db", "seats", showId],
    queryFn: () => getAvailableSeats({ data: { showId, ...(hint ? { hint } : {}) } }),
    staleTime: 15_000,
    retry: false,
  });

export const userBookingsQuery = (email?: string, userId?: string | null) =>
  queryOptions({
    queryKey: ["db", "bookings", userId ?? email ?? "guest"],
    queryFn: () => getUserBookings(),
    enabled: Boolean(userId),
    staleTime: 30_000,
    retry: false,
  });

export const favoritesQuery = (userId?: string) =>
  queryOptions({
    queryKey: ["db", "favorites", userId ?? "none"],
    queryFn: () => getFavorites(),
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: false,
  });

export const bookingQuery = (bookingId: string, userId?: string) =>
  queryOptions({
    queryKey: ["db", "bookings", userId ?? "none", bookingId],
    queryFn: () => getBooking({ data: { bookingId } }),
    enabled: Boolean(userId),
    staleTime: 0,
    retry: false,
  });

export const adminOverviewQuery = (enabled = true) =>
  queryOptions({
    queryKey: ["db", "admin"],
    queryFn: () => getAdminOverview(),
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
    retry: false,
    enabled,
  });

export const adminAccessQuery = () =>
  queryOptions({
    queryKey: ["auth", "admin"],
    queryFn: () => getAdminAccess(),
    staleTime: 0,
    retry: false,
  });

/** Turns a `CODE: message` server error into something a visitor can read. */
export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const [, code, msg] = /^([A-Z_]+):\s*(.*)$/.exec(raw) ?? [];
  if (!code) return raw || "Something went wrong. Please try again.";
  if (code === "DB_NOT_CONFIGURED")
    return "The booking database isn't configured. Please try again after setup is complete.";
  if (code === "DB_UNAVAILABLE") return "We couldn't reach the booking database. Please try again.";
  return msg || raw;
}

/** True when the failure is "no database configured / unreachable". */
export function isDbOutage(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return /^(DB_NOT_CONFIGURED|DB_UNAVAILABLE)\b/.test(raw) || /Failed to fetch/i.test(raw);
}
