import { Link } from "@tanstack/react-router";
import { Heart, Star } from "lucide-react";
import type { Movie } from "@/data/catalog";
import { useApp } from "@/lib/store";

export function MovieCard({ movie }: { movie: Movie }) {
  const { favorites, toggleFavorite, favoritePending, hydrated, favoritesLoading, favoritesError } =
    useApp();
  const fav = favorites.includes(movie.id);
  const upcoming = movie.status === "coming-soon";

  return (
    <article className="group relative">
      <Link
        to="/movie/$movieId"
        params={{ movieId: movie.id }}
        className="block overflow-hidden rounded-2xl border border-border bg-surface transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl hover:shadow-black/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <div className="relative aspect-2/3 overflow-hidden">
          <img
            src={movie.poster}
            alt={`${movie.title} poster`}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />
          {movie.rating > 0 && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-accent">
              <Star className="h-3 w-3 fill-current" aria-hidden="true" />
              {movie.rating.toFixed(1)}
            </span>
          )}
          <span className="absolute top-2 left-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold tracking-wide uppercase">
            {movie.certification}
          </span>
        </div>
        <div className="p-3">
          <h3 className="truncate text-sm font-semibold">{movie.title}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">{movie.genre.join(" • ")}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {movie.language.join(", ")} ·{" "}
            {upcoming
              ? new Date(movie.releaseDate).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })
              : movie.duration > 0
                ? `${Math.floor(movie.duration / 60)}h ${movie.duration % 60}m`
                : "Runtime unavailable"}
          </p>
        </div>
      </Link>
      <button
        onClick={() => void toggleFavorite(movie.id)}
        disabled={
          !hydrated ||
          favoritesLoading ||
          Boolean(favoritesError) ||
          favoritePending.includes(movie.id)
        }
        aria-label={
          fav ? `Remove ${movie.title} from favorites` : `Add ${movie.title} to favorites`
        }
        aria-pressed={fav}
        className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 backdrop-blur transition hover:bg-black/80"
      >
        <Heart
          className={`h-4 w-4 transition ${fav ? "fill-primary text-primary" : "text-white"}`}
          aria-hidden="true"
        />
      </button>
    </article>
  );
}
