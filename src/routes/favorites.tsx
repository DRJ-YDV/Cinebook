import { createFileRoute, Link } from "@tanstack/react-router";
import { MovieCard } from "@/components/MovieCard";
import { useApp } from "@/lib/store";
import { lookupMovie } from "@/lib/movie-registry";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resolveMovie } from "@/lib/resolve-movie";
import type { Movie } from "@/data/catalog";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Your Favorite Movies — CineBook" },
      {
        name: "description",
        content: "Your favorite movies saved securely to your CineBook account.",
      },
      { property: "og:title", content: "Your Favorite Movies — CineBook" },
      { property: "og:description", content: "The films you saved for later." },
    ],
  }),
  component: Favorites,
});

function Favorites() {
  const {
    user,
    favoriteRecords,
    hydrated,
    favoritesLoading,
    favoritesError,
    refreshFavorites,
    toggleFavorite,
    favoritePending,
  } = useApp();
  const queryClient = useQueryClient();
  const [resolved, setResolved] = useState<Record<string, Movie>>({});
  useEffect(() => {
    let active = true;
    void Promise.all(
      favoriteRecords.map(async (item) => {
        const movie = await resolveMovie(queryClient, item.movieId);
        return movie ? ([item.movieId, movie] as const) : null;
      }),
    ).then((items) => {
      if (active) setResolved(Object.fromEntries(items.filter((item) => item !== null)));
    });
    return () => {
      active = false;
    };
  }, [favoriteRecords, queryClient]);

  if (!hydrated) return <div className="mx-auto max-w-7xl px-4 py-8">Loading your account…</div>;
  if (!user)
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Sign in to see your favorites</h1>
        <Link
          to="/login"
          className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Sign in
        </Link>
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Favorites</h1>
      <p className="mt-1 text-sm text-muted-foreground">{favoriteRecords.length} saved titles</p>
      {favoritesError && (
        <div role="alert" className="mt-6 rounded-xl border border-destructive/40 p-4 text-sm">
          <p>{favoritesError}</p>
          <button onClick={refreshFavorites} className="mt-2 text-primary">
            Try again
          </button>
        </div>
      )}

      {favoritesLoading ? (
        <p className="mt-8 text-muted-foreground">Loading favorites…</p>
      ) : !favoritesError && favoriteRecords.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="text-lg font-semibold">No favorites yet ❤️</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap the heart on any movie to save it here.
          </p>
          <Link
            to="/movies"
            className="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Browse movies
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {favoriteRecords.map((item) => {
            const movie = resolved[item.movieId] ?? lookupMovie(item.movieId);
            return movie ? (
              <MovieCard key={item.movieId} movie={movie} />
            ) : (
              <article
                key={item.movieId}
                className="rounded-2xl border border-border bg-surface p-4"
              >
                {item.posterPath && (
                  <img
                    src={item.posterPath}
                    alt=""
                    className="aspect-2/3 w-full rounded-xl object-cover"
                  />
                )}
                <h2 className="mt-2 font-semibold">{item.title ?? `Movie #${item.tmdbId}`}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Movie details are temporarily unavailable. Your favorite is still saved.
                </p>
                <button
                  disabled={favoritePending.includes(item.movieId)}
                  onClick={() => void toggleFavorite(item.movieId)}
                  className="mt-3 text-sm text-primary"
                >
                  Remove favorite
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
