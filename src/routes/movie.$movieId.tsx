import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Heart, MapPin, Play, Star } from "lucide-react";
import { MOVIES } from "@/data/catalog";
import { useApp } from "@/lib/store";
import { DateSelector } from "@/components/DateSelector";
import { generateShows, slotPeriod, toDateKey } from "@/lib/shows";
import { inr } from "@/lib/pricing";
import { HeroTrailer } from "@/components/HeroTrailer";
import { TrailerModal } from "@/components/TrailerModal";
import { movieDetailQuery } from "@/lib/movie-queries";
import { tmdbIdFromMovieId } from "@/lib/tmdb-map";
import { rememberMovies } from "@/lib/movie-registry";
import { DetailSkeleton } from "@/components/Skeletons";
import { friendlyError, theatresQuery, theatreView } from "@/lib/cinebook-queries";

export const Route = createFileRoute("/movie/$movieId")({
  loader: async ({ params, context }) => {
    const tmdbId = tmdbIdFromMovieId(params.movieId);
    if (tmdbId !== undefined) {
      const detail = await context.queryClient.ensureQueryData(movieDetailQuery(tmdbId));
      if (!detail) throw notFound();
      return { movie: detail.movie, cast: detail.cast, source: detail.source };
    }
    const movie = MOVIES.find((m) => m.id === params.movieId);
    if (!movie) throw notFound();
    return {
      movie,
      cast: movie.cast.map((name) => ({ name, role: "Cast", image: "" })),
      source: "fallback" as const,
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData)
      return {
        meta: [{ title: "Movie unavailable — CineBook" }, { name: "robots", content: "noindex" }],
      };
    const m = loaderData.movie;
    const desc = `${m.title} — ${m.genre.join(", ")}. Book tickets, check showtimes and pick your seats on CineBook.`;
    return {
      meta: [
        { title: `${m.title} — Tickets & Showtimes | CineBook` },
        { name: "description", content: desc },
        { property: "og:title", content: `${m.title} — Tickets & Showtimes` },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: MovieDetails,
  pendingComponent: () => <DetailSkeleton />,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">Couldn’t load this movie</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <Link
        to="/movies"
        className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        Browse movies
      </Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">Movie not found 🎬</h1>
      <p className="mt-2 text-sm text-muted-foreground">This title is no longer in our listings.</p>
      <Link
        to="/movies"
        className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        Browse movies
      </Link>
    </div>
  ),
});

const REVIEWS = [
  {
    name: "Rahul M.",
    stars: 5,
    text: "Absolutely gripping from the first frame. Worth the IMAX upgrade.",
  },
  { name: "Sneha K.", stars: 4, text: "Great performances and a soundtrack I'm still humming." },
  { name: "Imran S.", stars: 5, text: "Second watch and it still holds up. Take your friends." },
  { name: "Divya R.", stars: 3, text: "Slow in the middle act but the finale saves it." },
];
const DIST = [72, 18, 7, 2, 1];

function MovieDetails() {
  const { movie, cast, source } = Route.useLoaderData();
  const {
    city,
    favorites,
    toggleFavorite,
    favoritePending,
    hydrated,
    favoritesLoading,
    favoritesError,
  } = useApp();
  const [date, setDate] = useState(toDateKey(new Date()));
  const [trailerOpen, setTrailerOpen] = useState(false);
  const fav = favorites.includes(movie.id);
  const remoteTheatres = useQuery(theatresQuery(city));
  const theatres = (remoteTheatres.data ?? []).map(theatreView);
  const upcoming = movie.status === "coming-soon";

  useEffect(() => {
    rememberMovies([movie]);
  }, [movie]);

  return (
    <div>
      {source === "fallback" && (
        <p className="mx-auto max-w-7xl px-4 py-3 text-sm text-muted-foreground">
          This is a sample movie from the demonstration catalog.
        </p>
      )}
      <div className="relative h-[56vh] min-h-96 w-full overflow-hidden">
        <HeroTrailer trailer={movie.trailer} backdrop={movie.backdrop} title={movie.title} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-background" />
      </div>

      <div className="relative z-10 mx-auto -mt-32 w-full max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          <img
            src={movie.poster}
            alt={`${movie.title} poster`}
            className="h-64 w-44 shrink-0 rounded-2xl border border-border object-cover shadow-2xl"
          />
          <div className="pt-2">
            <h1 className="text-3xl font-extrabold sm:text-4xl">{movie.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              {movie.rating > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 font-semibold text-accent">
                  <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                  {movie.rating.toFixed(1)}/10
                </span>
              )}
              <span>{movie.genre.join(" • ")}</span>
              <span>
                {movie.duration > 0
                  ? `${Math.floor(movie.duration / 60)}h ${movie.duration % 60}m`
                  : "Runtime unavailable"}
              </span>
              <span>{movie.language.join(" / ")}</span>
              <span className="rounded border border-border px-1.5">{movie.certification}</span>
              <span>
                {new Date(movie.releaseDate).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {!upcoming && (
                <a
                  href="#showtimes"
                  className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
                >
                  Book Tickets
                </a>
              )}
              <button
                onClick={() => setTrailerOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-semibold transition hover:bg-surface-2"
              >
                <Play className="h-4 w-4" aria-hidden="true" /> Watch Trailer
              </button>
              <button
                onClick={() => void toggleFavorite(movie.id)}
                disabled={
                  !hydrated ||
                  favoritesLoading ||
                  Boolean(favoritesError) ||
                  favoritePending.includes(movie.id)
                }
                aria-pressed={fav}
                className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-semibold transition hover:bg-surface-2"
              >
                <Heart
                  className={`h-4 w-4 ${fav ? "fill-primary text-primary" : ""}`}
                  aria-hidden="true"
                />
                {fav ? "In Favorites" : "Add to Favorites"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
          <div>
            <section>
              <h2 className="text-xl font-bold">About the Movie</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {movie.description}
                {movie.director !== "—" ? ` Directed by ${movie.director}.` : ""}
                {movie.duration > 0 ? ` Runtime: ${movie.duration} minutes.` : ""}
                {movie.certification !== "NR" ? ` Certification: ${movie.certification}.` : ""}
              </p>
            </section>

            <section className="mt-8">
              <h2 className="text-xl font-bold">Cast & Crew</h2>
              <div className="mt-3 flex flex-wrap gap-3">
                {[{ name: movie.director, role: "Director", image: "" }, ...cast].map((p) => (
                  <div key={`${p.name}-${p.role}`} className="w-24 text-center">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.name}
                        loading="lazy"
                        className="mx-auto h-16 w-16 rounded-full object-cover"
                      />
                    ) : (
                      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-lg font-bold text-accent">
                        {p.name
                          .split(" ")
                          .map((w) => w[0])
                          .join("")}
                      </div>
                    )}
                    <p className="mt-2 truncate text-xs font-medium">{p.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{p.role}</p>
                  </div>
                ))}
              </div>
            </section>

            {!upcoming && (
              <section id="showtimes" className="mt-10 scroll-mt-24">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-bold">Theatres & Showtimes</h2>
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 text-primary" aria-hidden="true" /> {city}
                  </span>
                </div>

                <div className="mt-4">
                  <DateSelector value={date} onChange={setDate} />
                </div>

                <div className="mt-6 grid gap-4">
                  {remoteTheatres.isPending && (
                    <p className="text-sm text-muted-foreground">Loading cinemas…</p>
                  )}
                  {remoteTheatres.error && (
                    <p role="alert" className="text-sm text-destructive">
                      {friendlyError(remoteTheatres.error)}
                    </p>
                  )}
                  {!remoteTheatres.isPending &&
                    !remoteTheatres.error &&
                    theatres.length > 0 &&
                    !theatres.some((theatre) => generateShows(movie, theatre, date).length) && (
                      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                        No remaining showtimes for this date. Choose another date.
                      </p>
                    )}
                  {theatres.length === 0 && (
                    <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                      No theatres in {city} yet. Try another city.
                    </p>
                  )}
                  {theatres.map((t) => {
                    const shows = generateShows(movie, t, date);
                    if (!shows.length) return null;
                    const periods = ["Morning", "Afternoon", "Evening", "Night"] as const;
                    return (
                      <article
                        key={t.id}
                        className="rounded-2xl border border-border bg-surface p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold">{t.name}</h3>
                            <p className="text-xs text-muted-foreground">
                              {t.address} · {t.distanceKm} km away
                            </p>
                          </div>
                          <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-xs font-semibold text-accent">
                            <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                            {t.rating}
                          </span>
                        </div>

                        {periods.map((p) => {
                          const list = shows.filter((s) => slotPeriod(s.time) === p);
                          if (!list.length) return null;
                          return (
                            <div key={p} className="mt-4">
                              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                                {p}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {list.map((s) => {
                                  const tone =
                                    "border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10";
                                  return (
                                    <Link
                                      key={s.id}
                                      to="/book/$showId"
                                      params={{ showId: s.id }}
                                      className={`rounded-lg border px-3 py-2 text-center text-sm transition ${tone}`}
                                    >
                                      <span className="block font-medium">{s.time}</span>
                                      <span className="block text-[10px] opacity-80">
                                        {s.format} · {inr(s.price)} · Check seats
                                      </span>
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="mt-10">
              <h2 className="text-xl font-bold">Example Reviews</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Illustrative reviews and rating distribution for this demonstration.
              </p>
              <div className="mt-4 grid gap-6 sm:grid-cols-[200px_1fr]">
                <div className="rounded-2xl border border-border bg-surface p-4 text-center">
                  <p className="text-4xl font-extrabold text-accent">
                    {(movie.rating ? movie.rating / 2 : 4.5).toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground">out of 5</p>
                  <div className="mt-3 grid gap-1">
                    {DIST.map((pct, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[11px]">
                        <span className="w-8 text-left">{5 - idx} ★</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="w-8 text-right text-muted-foreground">{pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <ul className="grid gap-3">
                  {REVIEWS.map((r) => (
                    <li key={r.name} className="rounded-2xl border border-border bg-surface p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{r.name}</p>
                        <p className="text-xs text-accent" aria-label={`${r.stars} out of 5`}>
                          {"★".repeat(r.stars)}
                          <span className="text-muted-foreground">{"★".repeat(5 - r.stars)}</span>
                        </p>
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">{r.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          <aside className="h-fit rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-24">
            <h2 className="text-sm font-semibold">Quick facts</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              {[
                ["Director", movie.director],
                ["Languages", movie.language.join(", ")],
                ["Formats", movie.formats.join(", ")],
                ["Certification", movie.certification],
                [
                  "Release",
                  new Date(movie.releaseDate).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  }),
                ],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </div>

      <TrailerModal
        open={trailerOpen}
        onClose={() => setTrailerOpen(false)}
        trailer={movie.trailer}
        title={movie.title}
      />
    </div>
  );
}
