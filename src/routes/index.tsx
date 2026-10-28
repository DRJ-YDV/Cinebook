import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Play, Star, Ticket } from "lucide-react";
import { MovieCard } from "@/components/MovieCard";
import { MovieGrid, MovieRail, Section } from "@/components/Section";
import { useApp } from "@/lib/store";
import { HeroTrailer } from "@/components/HeroTrailer";
import { TrailerModal } from "@/components/TrailerModal";
import { movieDetailQuery, movieListsQuery } from "@/lib/movie-queries";
import { MovieDataNotice } from "@/components/MovieDataNotice";
import { rememberMovies } from "@/lib/movie-registry";
import { HeroSkeleton, RailSkeleton } from "@/components/Skeletons";

export const Route = createFileRoute("/")({
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(movieListsQuery);
  },
  head: () => ({
    meta: [
      { title: "CineBook — Book Movie Tickets, Showtimes & Seats" },
      {
        name: "description",
        content:
          "Browse now showing and upcoming movies, pick a theatre and showtime, choose your seats and get an instant digital ticket with CineBook.",
      },
      { property: "og:title", content: "CineBook — Book Movie Tickets Online" },
      {
        property: "og:description",
        content: "Your movie. Your seat. Your experience.",
      },
    ],
  }),
  component: Home,
  pendingComponent: () => (
    <>
      <HeroSkeleton />
      <RailSkeleton />
      <RailSkeleton />
    </>
  ),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">Movies unavailable right now</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </p>
    </div>
  ),
});

function Home() {
  const { favorites, city } = useApp();
  const { data: lists, refetch, isFetching } = useSuspenseQuery(movieListsQuery);
  const [i, setI] = useState(0);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [clientReady, setClientReady] = useState(false);

  const nowShowing = lists.nowPlaying;
  const comingSoon = lists.upcoming;
  const trending = lists.popular.slice(0, 10);
  const topRated = lists.topRated.slice(0, 10);
  const candidates = useMemo(() => lists.popular.slice(0, 4), [lists.popular]);
  const activeIndex = i % Math.max(candidates.length, 1);
  const { data: heroDetail, isFetching: trailerLoading } = useQuery({
    ...movieDetailQuery(candidates[activeIndex]?.tmdbId ?? 0),
    enabled: clientReady && Boolean(candidates[activeIndex]?.tmdbId),
  });
  const featured = candidates.map((m) => (heroDetail?.movie.id === m.id ? heroDetail.movie : m));

  useEffect(() => setClientReady(true), []);

  useEffect(() => {
    rememberMovies([...nowShowing, ...comingSoon, ...trending, ...topRated]);
  }, [nowShowing, comingSoon, trending, topRated]);

  useEffect(() => {
    if (featured.length < 2 || trailerOpen) return;
    const t = setInterval(() => setI((v) => (v + 1) % featured.length), 6000);
    return () => clearInterval(t);
  }, [featured.length, trailerOpen]);

  const favGenres = new Set(
    favorites.flatMap((id) => nowShowing.find((m) => m.id === id)?.genre ?? []),
  );
  const recommended = (
    favGenres.size ? nowShowing.filter((m) => m.genre.some((g) => favGenres.has(g))) : topRated
  ).slice(0, 6);

  return (
    <>
      {(lists.source === "fallback" || lists.error) && (
        <MovieDataNotice
          sample={lists.source === "fallback"}
          busy={isFetching}
          onRetry={() => void refetch()}
        />
      )}
      <section className="relative" aria-label="Featured movies">
        <div className="relative h-[62vh] min-h-[420px] w-full overflow-hidden">
          {featured.map((m, idx) => (
            <div
              key={m.id}
              aria-hidden={idx !== activeIndex}
              className={`absolute inset-0 transition-opacity duration-700 ${idx === activeIndex ? "opacity-100" : "opacity-0"}`}
            >
              {idx === activeIndex ? (
                <HeroTrailer trailer={m.trailer} backdrop={m.backdrop} title={m.title} />
              ) : (
                <img
                  src={m.backdrop}
                  alt={`${m.title} backdrop`}
                  className="h-full w-full object-cover"
                />
              )}
              <div className="hero-fade pointer-events-none absolute inset-0" />
            </div>
          ))}

          <div className="absolute inset-x-0 bottom-0">
            <div className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6">
              {featured.map(
                (m, idx) =>
                  idx === activeIndex && (
                    <div key={m.id} className="animate-rise max-w-2xl">
                      <p className="text-xs tracking-[0.25em] text-accent uppercase">
                        Now showing in {city}
                      </p>
                      <h1 className="mt-2 text-4xl font-extrabold sm:text-6xl">{m.title}</h1>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1 font-semibold text-accent">
                          <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                          {m.rating.toFixed(1)}/10
                        </span>
                        <span>{m.genre.join(" • ")}</span>
                        <span>{m.language.join(" / ")}</span>
                        <span>
                          {m.duration > 0
                            ? `${Math.floor(m.duration / 60)}h ${m.duration % 60}m`
                            : "Runtime unavailable"}
                        </span>
                        <span className="rounded border border-border px-1.5 text-xs">
                          {m.certification}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                        {m.description}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-3">
                        <Link
                          to="/movie/$movieId"
                          params={{ movieId: m.id }}
                          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
                        >
                          <Ticket className="h-4 w-4" aria-hidden="true" /> Book Tickets
                        </Link>
                        <button
                          type="button"
                          onClick={() => setTrailerOpen(true)}
                          className="inline-flex items-center gap-2 rounded-full border border-border bg-black/40 px-5 py-3 text-sm font-semibold backdrop-blur transition hover:bg-black/60"
                        >
                          <Play className="h-4 w-4" aria-hidden="true" /> Watch Trailer
                        </button>
                      </div>
                    </div>
                  ),
              )}

              <div className="mt-6 flex gap-2">
                {featured.map((m, idx) => (
                  <button
                    key={m.id}
                    onClick={() => setI(idx)}
                    aria-label={`Show ${m.title}`}
                    aria-current={idx === activeIndex}
                    className={`h-1.5 rounded-full transition-all ${idx === activeIndex ? "w-8 bg-primary" : "w-4 bg-white/30"}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <TrailerModal
        open={trailerOpen}
        onClose={() => setTrailerOpen(false)}
        trailer={featured[activeIndex]?.trailer ?? ""}
        title={featured[activeIndex]?.title ?? ""}
        loading={trailerLoading}
      />

      <Section title="Now Showing" subtitle="Grab your seats before they're gone" href="/movies">
        <MovieGrid>
          {nowShowing.slice(0, 6).map((m) => (
            <MovieCard key={m.id} movie={m} />
          ))}
        </MovieGrid>
      </Section>

      <Section title="Popular Now" subtitle="What everyone is watching right now">
        <MovieRail>
          {trending.map((m) => (
            <MovieCard key={m.id} movie={m} />
          ))}
        </MovieRail>
      </Section>

      <Section title="Top Rated" subtitle="The highest rated films of all time">
        <MovieRail>
          {topRated.map((m) => (
            <MovieCard key={m.id} movie={m} />
          ))}
        </MovieRail>
      </Section>

      <Section
        title="Recommended For You"
        subtitle={favGenres.size ? "Based on the movies you loved" : "Top rated at the moment"}
      >
        <MovieRail>
          {recommended.map((m) => (
            <MovieCard key={m.id} movie={m} />
          ))}
        </MovieRail>
      </Section>

      <Section title="Coming Soon" subtitle="Set a reminder so you don't miss out" href="/upcoming">
        <MovieGrid>
          {comingSoon.slice(0, 6).map((m) => (
            <MovieCard key={m.id} movie={m} />
          ))}
        </MovieGrid>
      </Section>
    </>
  );
}
