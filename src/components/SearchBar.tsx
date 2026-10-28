import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { movieSearchQuery } from "@/lib/movie-queries";
import { rememberMovies } from "@/lib/movie-registry";

export function SearchBar({ className = "" }: { className?: string }) {
  const searchId = useId();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching, isError, refetch } = useQuery(movieSearchQuery(debounced));
  const results = (data ?? []).slice(0, 6);

  useEffect(() => {
    if (results.length) rememberMovies(results);
  }, [results]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          navigate({ to: "/movies", search: { q: q.trim() || undefined } });
        }}
      >
        <label htmlFor={searchId} className="sr-only">
          Search movies, actors, genres
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id={searchId}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search movies, actors, genres…"
          className="h-10 w-full rounded-full border border-border bg-surface-2/70 pr-9 pl-9 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQ("")}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {open && q.trim().length > 0 && (
        <div className="glass absolute top-12 z-50 w-full overflow-hidden rounded-2xl shadow-2xl">
          {q.trim().length < 2 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">
              Enter at least two characters to search.
            </p>
          ) : isFetching && results.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">Searching movies…</p>
          ) : isError ? (
            <div role="alert" className="px-4 py-5 text-sm text-muted-foreground">
              <p>Movie search is temporarily unavailable. Please try again.</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-2 font-semibold text-primary"
              >
                Retry search
              </button>
            </div>
          ) : results.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">
              No movies found 🎬 Try another title.
            </p>
          ) : (
            <ul>
              {results.map((m) => (
                <li key={m.id}>
                  <Link
                    to="/movie/$movieId"
                    params={{ movieId: m.id }}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-surface-2"
                  >
                    <img
                      src={m.poster}
                      alt={`${m.title} poster`}
                      className="h-12 w-9 rounded-md object-cover"
                      loading="lazy"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{m.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {new Date(m.releaseDate).getFullYear() || ""} ·{" "}
                        {m.rating > 0 ? `★ ${m.rating.toFixed(1)}` : "Unrated"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
