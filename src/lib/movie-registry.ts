import type { Movie } from "@/data/catalog";
import { MOVIES } from "@/data/catalog";

/**
 * Client-side registry of TMDB-sourced movies so that synchronous lookups
 * (seat map, checkout, favorites) keep working after a page reload.
 * CineBook's own mock catalog stays as the last-resort fallback.
 */
const KEY = "cinebook.movies.v1";
const registry = new Map<string, Movie>();
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const list = JSON.parse(raw) as Movie[];
    for (const m of list) registry.set(m.id, m);
  } catch {
    /* ignore corrupt cache */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const list = [...registry.values()].slice(-300);
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota — ignore */
  }
}

export function rememberMovies(movies: (Movie | undefined | null)[]) {
  load();
  let changed = false;
  for (const m of movies) {
    if (!m) continue;
    const prev = registry.get(m.id);
    // Detail payloads are richer than list payloads — prefer the one with a trailer.
    if (!prev || (!prev.trailer && m.trailer) || prev.director === "—") {
      registry.set(m.id, m);
      changed = true;
    }
  }
  if (changed) persist();
}

export function lookupMovie(id: string): Movie | undefined {
  load();
  return registry.get(id) ?? MOVIES.find((m) => m.id === id);
}

export function registeredMovies(): Movie[] {
  load();
  return [...registry.values()];
}
