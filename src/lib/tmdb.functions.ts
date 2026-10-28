import { createServerFn } from "@tanstack/react-start";

export const getMovieLists = createServerFn({ method: "GET" }).handler(async () => {
  const { loadMovieLists } = await import("./tmdb.server");
  return loadMovieLists();
});

export const searchTmdbMovies = createServerFn({ method: "GET" })
  .validator((query: string) => (typeof query === "string" ? query.trim().slice(0, 100) : ""))
  .handler(async ({ data }) => {
    const { loadSearch } = await import("./tmdb.server");
    return loadSearch(data);
  });

export const getMovieDetail = createServerFn({ method: "GET" })
  .validator((tmdbId: number) => Number(tmdbId))
  .handler(async ({ data }) => {
    const { loadDetail } = await import("./tmdb.server");
    if (!Number.isSafeInteger(data) || data <= 0) return null;
    return loadDetail(data);
  });
