import type { QueryClient } from "@tanstack/react-query";
import type { Movie } from "@/data/catalog";
import { movieDetailQuery } from "./movie-queries";
import { lookupMovie, rememberMovies } from "./movie-registry";
import { tmdbIdFromMovieId } from "./tmdb-map";

/**
 * Resolves a CineBook movie id (mock or TMDB-backed) to a full Movie.
 * Booking data (show/theatre/seats) stays CineBook-owned; this only fills in movie info.
 */
export async function resolveMovie(
  queryClient: QueryClient,
  movieId: string,
): Promise<Movie | undefined> {
  const cached = lookupMovie(movieId);
  if (cached) return cached;
  const tmdbId = tmdbIdFromMovieId(movieId);
  if (tmdbId === undefined) return undefined;
  try {
    const detail = await queryClient.ensureQueryData(movieDetailQuery(tmdbId));
    if (detail?.movie) {
      rememberMovies([detail.movie]);
      return detail.movie;
    }
  } catch {
    /* TMDB unavailable — fall back to whatever the caller has */
  }
  return undefined;
}
