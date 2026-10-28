/**
 * Centralised TMDB image URL helper.
 * Keeps every TMDB image size decision in one place.
 */
const BASE = "https://image.tmdb.org/t/p";

export const IMAGE_SIZES = {
  card: "w500",
  poster: "w780",
  hero: "original",
  backdrop: "w1280",
  cast: "w185",
} as const;

export type ImageKind = keyof typeof IMAGE_SIZES;

export const FALLBACK_POSTER = "/images/poster-1.jpg";
export const FALLBACK_BACKDROP = "/images/backdrop-1.jpg";

export function tmdbImage(path: string | null | undefined, kind: ImageKind): string {
  if (!path) return kind === "hero" || kind === "backdrop" ? FALLBACK_BACKDROP : FALLBACK_POSTER;
  if (path.startsWith("http") || path.startsWith("/images/")) return path;
  return `${BASE}/${IMAGE_SIZES[kind]}${path}`;
}
