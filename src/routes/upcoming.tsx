import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { movieListsQuery } from "@/lib/movie-queries";
import { MovieDataNotice } from "@/components/MovieDataNotice";
import { rememberMovies } from "@/lib/movie-registry";
import { GridSkeleton } from "@/components/Skeletons";

export const Route = createFileRoute("/upcoming")({
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(movieListsQuery);
  },
  head: () => ({
    meta: [
      { title: "Upcoming Movies — CineBook" },
      {
        name: "description",
        content:
          "See which films arrive next in cinemas. Get release dates, genres and set a reminder for upcoming movies on CineBook.",
      },
      { property: "og:title", content: "Upcoming Movies — CineBook" },
      { property: "og:description", content: "Release dates and reminders for films coming soon." },
    ],
  }),
  component: Upcoming,
  pendingComponent: () => <GridSkeleton count={6} />,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">Couldn’t load upcoming movies</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </p>
    </div>
  ),
});

function Upcoming() {
  const { notify } = useApp();
  const { data: lists, refetch, isFetching } = useSuspenseQuery(movieListsQuery);
  const movies = lists.upcoming;

  useEffect(() => {
    rememberMovies(movies);
  }, [movies]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {(lists.source === "fallback" || lists.error) && (
        <MovieDataNotice
          sample={lists.source === "fallback"}
          busy={isFetching}
          onRetry={() => void refetch()}
        />
      )}
      <h1 className="text-2xl font-bold sm:text-3xl">Coming Soon</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Fresh releases heading to a screen near you.
      </p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {movies.map((m) => (
          <article
            key={m.id}
            className="flex gap-4 rounded-2xl border border-border bg-surface p-4 transition hover:border-primary/40"
          >
            <img
              src={m.poster}
              alt={`${m.title} poster`}
              loading="lazy"
              className="h-40 w-28 shrink-0 rounded-xl object-cover"
            />
            <div className="min-w-0">
              <h2 className="truncate font-semibold">{m.title}</h2>
              <p className="mt-1 text-xs text-accent">
                Releasing{" "}
                {new Date(m.releaseDate).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{m.genre.join(" • ")}</p>
              <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{m.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/movie/$movieId"
                  params={{ movieId: m.id }}
                  className="rounded-full border border-border px-3 py-1.5 text-xs transition hover:bg-surface-2"
                >
                  View Details
                </Link>
                <button
                  onClick={() => {
                    if (
                      notify(
                        "Saved reminder",
                        `${m.title} releases on ${m.releaseDate}. This reminder is kept for this sign-in session.`,
                      )
                    ) {
                      toast.success(`Saved a reminder for ${m.title} in this session`);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"
                >
                  <BellRing className="h-3.5 w-3.5" aria-hidden="true" /> Notify Me
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
