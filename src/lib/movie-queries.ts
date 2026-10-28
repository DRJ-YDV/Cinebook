import { queryOptions } from "@tanstack/react-query";
import { getMovieDetail, getMovieLists, searchTmdbMovies } from "./tmdb.functions";

export const movieListsQuery = queryOptions({
  queryKey: ["tmdb", "lists"],
  queryFn: () => getMovieLists(),
  staleTime: (query) =>
    query.state.data?.source === "tmdb" && !query.state.data.error ? 1000 * 60 * 30 : 0,
  // A stale fallback must hydrate the same retry state as its SSR snapshot.
  // The interval below still recovers automatically after hydration.
  refetchOnMount: (query) => query.state.data?.source === "tmdb" && !query.state.data.error,
  refetchInterval: (query) =>
    query.state.data?.source === "fallback" || query.state.data?.error ? 15_000 : false,
});

export const movieDetailQuery = (tmdbId: number) =>
  queryOptions({
    queryKey: ["tmdb", "movie", tmdbId],
    queryFn: () => getMovieDetail({ data: tmdbId }),
    staleTime: 1000 * 60 * 30,
  });

export const movieSearchQuery = (q: string) =>
  queryOptions({
    queryKey: ["tmdb", "search", q],
    queryFn: () => searchTmdbMovies({ data: q }),
    staleTime: 1000 * 60 * 10,
    enabled: q.trim().length > 1,
    retry: 1,
  });
