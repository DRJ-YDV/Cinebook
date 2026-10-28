import type { Format, Movie } from "@/data/catalog";
import { tmdbImage } from "./tmdb-image";

export type TmdbMovieRaw = {
  id: number;
  title?: string;
  name?: string;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number | null;
  release_date?: string | null;
  runtime?: number | null;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  original_language?: string | null;
  spoken_languages?: { english_name?: string; name?: string }[];
  adult?: boolean;
  popularity?: number | null;
  credits?: {
    cast?: { name: string; character?: string; profile_path?: string | null }[];
    crew?: { name: string; job?: string; profile_path?: string | null }[];
  };
  videos?: { results?: { key: string; site: string; type: string; official?: boolean }[] };
  release_dates?: {
    results?: { iso_3166_1: string; release_dates?: { certification?: string }[] }[];
  };
};

const FORMAT_SETS: Format[][] = [
  ["2D", "3D", "IMAX"],
  ["2D"],
  ["2D", "IMAX", "4DX"],
  ["2D", "3D"],
  ["2D", "3D", "IMAX", "4DX"],
];

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  mr: "Marathi",
  bn: "Bengali",
  pa: "Punjabi",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  es: "Spanish",
  de: "German",
  zh: "Chinese",
  it: "Italian",
};

export function movieIdFromTmdb(tmdbId: number) {
  return `tmdb${tmdbId}`;
}

export function tmdbIdFromMovieId(movieId: string): number | undefined {
  const m = /^tmdb(\d+)$/.exec(movieId);
  return m ? Number(m[1]) : undefined;
}

function languageList(raw: TmdbMovieRaw): string[] {
  const spoken = (raw.spoken_languages ?? [])
    .map((l) => l.english_name || l.name || "")
    .filter(Boolean);
  if (spoken.length) return [...new Set(spoken)].slice(0, 3);
  const code = raw.original_language;
  if (!code) return ["Unspecified"];
  return [LANGUAGE_NAMES[code] ?? code.toUpperCase()];
}

function certificationOf(raw: TmdbMovieRaw): string {
  const results = raw.release_dates?.results ?? [];
  for (const region of ["IN", "US", "GB"]) {
    const hit = results.find((r) => r.iso_3166_1 === region);
    const cert = hit?.release_dates?.find((d) => d.certification)?.certification;
    if (cert) return cert;
  }
  return "NR";
}

export function trailerUrlOf(raw: TmdbMovieRaw): string {
  const vids = raw.videos?.results ?? [];
  const pick =
    vids.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ??
    vids.find((v) => v.site === "YouTube" && v.type === "Trailer") ??
    vids.find((v) => v.site === "YouTube" && v.type === "Teaser");
  return pick ? `https://www.youtube.com/embed/${pick.key}` : "";
}

export type CastMember = { name: string; role: string; image: string };

export function castOf(raw: TmdbMovieRaw): CastMember[] {
  return (raw.credits?.cast ?? []).slice(0, 10).map((c) => ({
    name: c.name,
    role: c.character || "Cast",
    image: tmdbImage(c.profile_path, "cast"),
  }));
}

/** Map a TMDB payload onto CineBook's existing Movie shape. */
export function toMovie(raw: TmdbMovieRaw, genreNames: Record<number, string> = {}): Movie {
  const title = raw.title || raw.name || "Untitled";
  const genres = raw.genres?.length
    ? raw.genres.map((g) => g.name)
    : (raw.genre_ids ?? [])
        .map((id) => genreNames[id])
        .filter(Boolean as unknown as (v: string | undefined) => v is string);
  const release = raw.release_date || "";
  const released = release ? new Date(release).getTime() <= Date.now() : false;
  const runtime = raw.runtime && raw.runtime > 0 ? raw.runtime : 0;
  const crew = raw.credits?.crew ?? [];
  const director = crew.find((c) => c.job === "Director")?.name ?? "—";

  return {
    id: movieIdFromTmdb(raw.id),
    tmdbId: raw.id,
    title,
    poster: tmdbImage(raw.poster_path, "card"),
    backdrop: tmdbImage(raw.backdrop_path, "hero"),
    description: raw.overview || "Synopsis coming soon.",
    genre: genres.length ? genres.slice(0, 3) : ["Unspecified"],
    language: languageList(raw),
    duration: runtime,
    rating: Number(raw.vote_average ?? 0),
    certification: certificationOf(raw),
    releaseDate: release || new Date().toISOString().slice(0, 10),
    cast: (raw.credits?.cast ?? []).slice(0, 6).map((c) => c.name),
    director,
    trailer: trailerUrlOf(raw),
    status: released ? "now-showing" : "coming-soon",
    popularity: Number(raw.popularity ?? 0),
    formats: FORMAT_SETS[raw.id % FORMAT_SETS.length]!,
  };
}
