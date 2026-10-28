import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Star } from "lucide-react";
import { useApp } from "@/lib/store";
import { friendlyError, theatresQuery } from "@/lib/cinebook-queries";

export const Route = createFileRoute("/theatres")({
  head: () => ({
    meta: [
      { title: "Cinemas & Theatres — CineBook" },
      {
        name: "description",
        content:
          "Find cinemas near you with screen counts, supported formats like IMAX and 4DX, ratings and addresses.",
      },
      { property: "og:title", content: "Cinemas & Theatres — CineBook" },
      { property: "og:description", content: "Screens, formats and ratings for cinemas near you." },
    ],
  }),
  component: Theatres,
});

function Theatres() {
  const { city } = useApp();
  // Cinema listings are database-owned. An empty response is an empty listing.
  const remote = useQuery(theatresQuery(city));
  const theatres = (remote.data ?? []).map((t) => ({
    id: t.theatreId,
    name: t.name,
    address: t.address,
    rating: t.rating,
    formats: t.formats,
    screens: t.screens.map((s) => ({ id: s.screenId, name: s.name, seats: s.seats })),
    distanceKm: t.distanceKm ?? 0,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Theatres in {city}</h1>
      <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4 text-primary" aria-hidden="true" /> Change your city from the
        header to see other cinemas.
      </p>

      {remote.error && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {friendlyError(remote.error)}
        </p>
      )}
      {remote.isPending ? (
        <p className="mt-8 text-muted-foreground">Loading theatres…</p>
      ) : theatres.length === 0 && !remote.error ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border p-16 text-center text-sm text-muted-foreground">
          No theatres listed in {city} yet.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {theatres.map((t) => (
            <article key={t.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{t.name}</h2>
                  <p className="text-xs text-muted-foreground">{t.address}</p>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-xs font-semibold text-accent">
                  <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                  {t.rating}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.formats.map((f) => (
                  <span
                    key={f}
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {f}
                  </span>
                ))}
              </div>
              <ul className="mt-3 grid gap-1 text-xs text-muted-foreground">
                {t.screens.map((s) => (
                  <li key={s.id}>
                    {s.name} — {s.seats} seats
                  </li>
                ))}
                <li>{t.distanceKm} km away</li>
              </ul>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
