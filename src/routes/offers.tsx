import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError, offersQuery } from "@/lib/cinebook-queries";

export const Route = createFileRoute("/offers")({
  head: () => ({
    meta: [
      { title: "Offers & Promo Codes — CineBook" },
      {
        name: "description",
        content:
          "Save on movie tickets with CineBook demo offers: first-booking discounts, card cashback and weekday savers.",
      },
      { property: "og:title", content: "Offers & Promo Codes — CineBook" },
      { property: "og:description", content: "Discounts you can apply at checkout." },
    ],
  }),
  component: Offers,
});

function Offers() {
  const remote = useQuery(offersQuery());
  const list = remote.data ?? [];
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Offers</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Copy an available code and apply it on the booking summary screen. Eligibility is checked at
        checkout.
      </p>
      {remote.isPending && <p className="mt-6 text-muted-foreground">Loading offers…</p>}
      {remote.error && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {friendlyError(remote.error)}
        </p>
      )}
      {!remote.isPending && !remote.error && !list.length && (
        <p className="mt-6 text-muted-foreground">No active offers are available.</p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {list.map((o) => (
          <article
            key={o.code}
            className="rounded-2xl border border-border bg-surface p-5 transition hover:border-accent/50"
          >
            <p className="text-2xl" aria-hidden="true">
              {o.icon}
            </p>
            <h2 className="mt-2 text-lg font-bold">{o.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{o.description}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <code className="rounded-lg border border-dashed border-accent/60 px-3 py-1.5 text-sm font-bold tracking-widest text-accent">
                {o.code}
              </code>
              <button
                onClick={() => {
                  void navigator.clipboard
                    .writeText(o.code)
                    .then(() => toast.success(`${o.code} copied — apply it at checkout`))
                    .catch(() =>
                      toast.error("The code could not be copied. Select and copy it manually."),
                    );
                }}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Copy code
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
