import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { MovieLists } from "./tmdb.server";

// This file contains only public movie metadata, never credentials or user data.
const text = z.string().max(20_000);
const movie = z
  .object({
    id: z.string().regex(/^tmdb[1-9]\d*$/),
    tmdbId: z.number().int().positive(),
    title: text,
    poster: text,
    backdrop: text,
    description: text,
    genre: z.array(text).max(20),
    language: z.array(text).max(20),
    duration: z.number().finite(),
    rating: z.number().finite(),
    certification: text,
    releaseDate: text,
    cast: z.array(text).max(100),
    director: text,
    trailer: text,
    status: z.enum(["now-showing", "coming-soon"]),
    popularity: z.number().finite(),
    formats: z.array(z.enum(["2D", "3D", "IMAX", "4DX"])).max(4),
  })
  .refine((value) => value.id === `tmdb${value.tmdbId}`);
const list = z.array(movie).max(100);
const snapshot = z.object({
  version: z.literal(1),
  at: z.number().finite(),
  lists: z.object({
    nowPlaying: list,
    popular: list,
    topRated: list,
    upcoming: list,
    source: z.literal("tmdb"),
  }),
});
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 2_000_000;

function cachePath(): string | undefined {
  const file = (process.env["TMDB_CACHE_FILE"] ?? ".cache/tmdb-catalogue.json").trim();
  return file ? resolve(file) : undefined;
}

export async function readCatalogueCache(): Promise<MovieLists | null> {
  const file = cachePath();
  if (!file) return null;
  try {
    if ((await stat(file)).size > MAX_BYTES) return null;
    const parsed = snapshot.safeParse(JSON.parse(await readFile(file, "utf8")));
    if (!parsed.success) return null;
    const age = Date.now() - parsed.data.at;
    return age >= 0 && age <= MAX_AGE_MS ? parsed.data.lists : null;
  } catch {
    return null;
  }
}

export async function writeCatalogueCache(lists: MovieLists): Promise<void> {
  const file = cachePath();
  if (!file || lists.source !== "tmdb" || lists.error) return;
  const parsed = snapshot.safeParse({ version: 1, at: Date.now(), lists });
  if (!parsed.success) return;
  const data = JSON.stringify(parsed.data);
  if (Buffer.byteLength(data) > MAX_BYTES) return;
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(temporary, data, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, file);
  } catch {
    // Read-only deployments can still serve the in-memory catalogue.
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
