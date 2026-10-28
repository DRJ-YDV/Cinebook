import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { MovieCard } from "@/components/MovieCard";
import { movieListsQuery, movieSearchQuery } from "@/lib/movie-queries";
import { MovieDataNotice } from "@/components/MovieDataNotice";
import { rememberMovies } from "@/lib/movie-registry";
import { GridSkeleton } from "@/components/Skeletons";

type Search = { q?: string | undefined };

export const Route = createFileRoute("/movies")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s["q"] === "string" && s["q"] ? (s["q"] as string) : undefined,
  }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(movieListsQuery);
  },
  head: () => ({
    meta: [
      { title: "Now Showing Movies — CineBook" },
      {
        name: "description",
        content:
          "Browse every movie now showing on CineBook. Filter by language, genre, format and rating, then book your seats.",
      },
      { property: "og:title", content: "Now Showing Movies — CineBook" },
      {
        property: "og:description",
        content: "Filter movies by language, genre and format, then book instantly.",
      },
    ],
  }),
  component: MoviesPage,
  pendingComponent: () => <GridSkeleton count={12} />,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">Couldn’t load movies</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </p>
    </div>
  ),
});

const FORMATS = ["2D", "3D", "IMAX", "4DX"];

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function MoviesPage() {
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: lists, refetch, isFetching } = useSuspenseQuery(movieListsQuery);
  const term = (q ?? "").trim();
  const searchResult = useQuery(movieSearchQuery(term));
  const [langs, setLangs] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [openFilters, setOpenFilters] = useState(false);

  const pool = useMemo(() => {
    if (term) return searchResult.data ?? [];
    const seen = new Set<string>();
    return [...lists.nowPlaying, ...lists.popular, ...lists.topRated].filter((m) =>
      seen.has(m.id) ? false : (seen.add(m.id), true),
    );
  }, [term, searchResult.data, lists]);

  useEffect(() => {
    rememberMovies(pool);
  }, [pool]);

  const LANGS = useMemo(() => [...new Set(pool.flatMap((m) => m.language))].sort(), [pool]);
  const GENRES = useMemo(() => [...new Set(pool.flatMap((m) => m.genre))].sort(), [pool]);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const results = useMemo(() => {
    return pool
      .filter((m) => !langs.length || m.language.some((l) => langs.includes(l)))
      .filter((m) => !genres.length || m.genre.some((g) => genres.includes(g)))
      .filter((m) => !formats.length || m.formats.some((f) => formats.includes(f)))
      .filter((m) => m.rating >= minRating);
  }, [pool, langs, genres, formats, minRating]);

  const clearAll = () => {
    setLangs([]);
    setGenres([]);
    setFormats([]);
    setMinRating(0);
    navigate({ search: {} });
  };

  const filters = (
    <div className="grid gap-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Language</h3>
        <div className="flex flex-wrap gap-2">
          {LANGS.map((l) => (
            <Chip key={l} active={langs.includes(l)} onClick={() => toggle(langs, setLangs, l)}>
              {l}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Genre</h3>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <Chip key={g} active={genres.includes(g)} onClick={() => toggle(genres, setGenres, g)}>
              {g}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Format</h3>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <Chip
              key={f}
              active={formats.includes(f)}
              onClick={() => toggle(formats, setFormats, f)}
            >
              {f}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Minimum rating: {minRating.toFixed(1)}</h3>
        <input
          type="range"
          min={0}
          max={9}
          step={0.5}
          value={minRating}
          aria-label="Minimum rating"
          onChange={(e) => setMinRating(Number(e.target.value))}
          className="w-full accent-[oklch(0.65_0.21_20)]"
        />
      </div>
      <button
        onClick={clearAll}
        className="rounded-full border border-border px-4 py-2 text-sm transition hover:bg-surface-2"
      >
        Clear all filters
      </button>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {(lists.source === "fallback" || lists.error) && (
        <MovieDataNotice
          sample={lists.source === "fallback"}
          busy={isFetching}
          onRetry={() => void refetch()}
        />
      )}
      <h1 className="text-2xl font-bold sm:text-3xl">
        {q ? `Results for “${q}”` : "Movies Now Showing"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {term && searchResult.isLoading ? "Searching…" : `${results.length} movies available`}
      </p>
      {term && searchResult.error && (
        <div role="alert" className="mt-4 text-sm text-destructive">
          <p>Movie search is temporarily unavailable. Please try again.</p>
          <button
            type="button"
            className="mt-2 text-primary"
            onClick={() => void searchResult.refetch()}
          >
            Try again
          </button>
        </div>
      )}
      {term.length === 1 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Enter at least two characters to search.
        </p>
      )}

      <button
        onClick={() => setOpenFilters((v) => !v)}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm lg:hidden"
        aria-expanded={openFilters}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters
      </button>

      <div className="mt-6 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside
          className={`${openFilters ? "block" : "hidden"} rounded-2xl border border-border bg-surface p-4 lg:block lg:h-fit lg:sticky lg:top-24`}
        >
          {filters}
        </aside>

        {term && searchResult.isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="aspect-2/3 animate-pulse rounded-2xl bg-surface-2" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-20 text-center">
            <p className="text-lg font-semibold">No movies found 🎬</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different search or clear your filters.
            </p>
            <button
              onClick={clearAll}
              className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {results.map((m) => (
              <MovieCard key={m.id} movie={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
