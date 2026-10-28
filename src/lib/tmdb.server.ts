import { MOVIES } from "@/data/catalog";
import type { Movie } from "@/data/catalog";
import { castOf, toMovie, type CastMember, type TmdbMovieRaw } from "./tmdb-map";
import dns from "node:dns";
import { readCatalogueCache, writeCatalogueCache } from "./tmdb-catalogue-cache.server";

dns.setDefaultResultOrder("ipv4first");
const BASE = "https://api.themoviedb.org/3";

type CacheEntry = { at: number; value: unknown };
const cache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<unknown>>();
const TTL = 1000 * 60 * 30; // 30 minutes
const REQUEST_TIMEOUT_MS = 6000;
const REQUEST_ATTEMPTS = 3;

class TmdbHttpError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401 || status === 403
        ? `TMDB credentials were rejected (${status}). Check TMDB_ACCESS_TOKEN or TMDB_API_KEY.`
        : `TMDB request failed (${status})`,
    );
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof TmdbHttpError) return error.message;
  if (error instanceof Error && error.message === "TMDB credentials are not configured")
    return error.message;
  const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
  if (cause?.code) return `TMDB connection failed (${cause.code}).`;
  if (error instanceof Error && error.name === "TimeoutError") return "TMDB request timed out.";
  return "TMDB is temporarily unavailable.";
}

function fromCache<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = process.env["TMDB_ACCESS_TOKEN"]?.trim();
  const apiKey = process.env["TMDB_API_KEY"]?.trim();
  if (!token && !apiKey) throw new Error("TMDB credentials are not configured");

  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!token && apiKey) url.searchParams.set("api_key", apiKey);

  const key = url.toString();
  const cached = fromCache<T>(key);
  if (cached !== undefined) return cached;
  const pending = pendingRequests.get(key);
  if (pending) return pending as Promise<T>;

  const request = requestTmdb<T>(url, token).then((json) => {
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), value: json });
    return json;
  });
  pendingRequests.set(key, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(key);
  }
}

async function requestTmdb<T>(url: URL, token?: string): Promise<T> {
  for (let attempt = 0; attempt < REQUEST_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        // Credentials must stay on the configured API host, including retries.
        redirect: "error",
      });
      if (!res.ok) {
        await res.body?.cancel();
        throw new TmdbHttpError(res.status);
      }
      return (await res.json()) as T;
    } catch (error) {
      const retryable =
        !(error instanceof TmdbHttpError) ||
        error.status === 408 ||
        error.status === 429 ||
        error.status >= 500;
      if (!retryable || attempt === REQUEST_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw new Error("TMDB is temporarily unavailable.");
}

export type TmdbList = "now_playing" | "popular" | "top_rated" | "upcoming";

export async function fetchGenreMap(): Promise<Record<number, string>> {
  const data = await tmdbFetch<{ genres: { id: number; name: string }[] }>("/genre/movie/list");
  return Object.fromEntries(data.genres.map((g) => [g.id, g.name]));
}

export async function fetchList(list: TmdbList, page = 1): Promise<TmdbMovieRaw[]> {
  const params: Record<string, string> = { page: String(page) };
  if (list === "now_playing" || list === "upcoming") params["region"] = "IN";
  const data = await tmdbFetch<{ results: TmdbMovieRaw[] }>(`/movie/${list}`, params);
  return data.results ?? [];
}

export async function fetchSearch(query: string, page = 1): Promise<TmdbMovieRaw[]> {
  if (!query.trim()) return [];
  const data = await tmdbFetch<{ results: TmdbMovieRaw[] }>("/search/movie", {
    query,
    page: String(page),
    include_adult: "false",
  });
  return data.results ?? [];
}

export async function fetchDetails(tmdbId: number): Promise<TmdbMovieRaw> {
  return tmdbFetch<TmdbMovieRaw>(`/movie/${tmdbId}`, {
    append_to_response: "credits,videos,release_dates,images",
  });
}

/* ---------- Composed, UI-ready results with graceful fallbacks ---------- */

export type MovieLists = {
  nowPlaying: Movie[];
  popular: Movie[];
  topRated: Movie[];
  upcoming: Movie[];
  source: "tmdb" | "fallback";
  error?: string;
};

let lastMovieLists: MovieLists | undefined;
let pendingLists: Promise<MovieLists> | undefined;
let lastResult: { at: number; value: MovieLists } | undefined;
let restoredCatalogue = false;
const FAILURE_COOLDOWN_MS = 10_000;

function mockLists(error: string): MovieLists {
  const showing = MOVIES.filter((m) => m.status === "now-showing");
  const soon = MOVIES.filter((m) => m.status === "coming-soon");
  return {
    nowPlaying: showing,
    popular: [...showing].sort((a, b) => b.popularity - a.popularity),
    topRated: [...showing].sort((a, b) => b.rating - a.rating),
    upcoming: soon,
    source: "fallback",
    error,
  };
}

export function loadMovieLists(): Promise<MovieLists> {
  if (pendingLists) return pendingLists;
  // Concurrent page loads share the same refresh; outages cannot trigger a
  // separate batch of retries for every visitor or SSR prefetch.
  if (
    lastResult &&
    Date.now() - lastResult.at < (lastResult.value.error ? FAILURE_COOLDOWN_MS : TTL)
  )
    return Promise.resolve(lastResult.value);

  pendingLists = refreshMovieLists()
    .then((value) => {
      lastResult = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      pendingLists = undefined;
    });
  return pendingLists;
}

async function refreshMovieLists(): Promise<MovieLists> {
  if (!restoredCatalogue) {
    restoredCatalogue = true;
    lastMovieLists = (await readCatalogueCache()) ?? undefined;
  }
  // A failure in metadata or one list must not discard every successful list.
  const [genreResult, ...results] = await Promise.allSettled([
    fetchGenreMap(),
    fetchList("now_playing"),
    fetchList("popular"),
    fetchList("top_rated"),
    fetchList("upcoming"),
  ] as const);
  const failures = [genreResult, ...results].filter((result) => result.status === "rejected");
  const error = failures.length
    ? errorMessage((failures[0] as PromiseRejectedResult).reason)
    : undefined;
  if (failures.length) console.warn("TMDB lists:", error);

  if (results.every((result) => result.status === "rejected")) {
    return lastMovieLists
      ? { ...lastMovieLists, error: error ?? "TMDB is temporarily unavailable." }
      : mockLists(error ?? "TMDB is temporarily unavailable.");
  }

  const genres = genreResult.status === "fulfilled" ? genreResult.value : {};
  const [nowPlaying, popular, topRated, upcoming] = results;

  // Trailers load separately in the browser. Optional detail calls must never
  // delay the catalogue or make it fall back to sample movies.
  const list = (result: PromiseSettledResult<TmdbMovieRaw[]>, previous: Movie[] = []) =>
    result.status === "fulfilled" ? result.value.map((r) => toMovie(r, genres)) : previous;
  const movies: MovieLists = {
    nowPlaying: list(nowPlaying, lastMovieLists?.nowPlaying),
    popular: list(popular, lastMovieLists?.popular),
    topRated: list(topRated, lastMovieLists?.topRated),
    upcoming: list(upcoming, lastMovieLists?.upcoming).map((m) => ({
      ...m,
      status: "coming-soon" as const,
    })),
    source: "tmdb",
    ...(error ? { error } : {}),
  };
  if (!movies.popular.length)
    movies.popular = movies.nowPlaying.length ? movies.nowPlaying : movies.topRated;
  lastMovieLists = movies;
  if (!error) await writeCatalogueCache(movies);
  return movies;
}

export async function loadSearch(query: string): Promise<Movie[]> {
  if (!query.trim()) return [];
  try {
    const [genres, rows] = await Promise.all([
      fetchGenreMap().catch(() => ({})),
      fetchSearch(query),
    ]);
    return rows.map((r) => toMovie(r, genres));
  } catch (e) {
    const message = errorMessage(e);
    console.warn("TMDB search:", message);
    throw new Error(message);
  }
}

export type MovieDetail = { movie: Movie; cast: CastMember[]; source: "tmdb" | "fallback" };

export async function loadDetail(tmdbId: number): Promise<MovieDetail | null> {
  try {
    const raw = await fetchDetails(tmdbId);
    return { movie: toMovie(raw), cast: castOf(raw), source: "tmdb" };
  } catch (e) {
    console.warn("TMDB detail:", errorMessage(e));
    return null;
  }
}
