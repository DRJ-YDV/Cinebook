import { useEffect } from "react";
import { X } from "lucide-react";
import { youtubeId } from "./HeroTrailer";

type Props = {
  open: boolean;
  onClose: () => void;
  trailer?: string;
  title: string;
  loading?: boolean;
};

/** Large trailer player with sound. */
export function TrailerModal({ open, onClose, trailer, title, loading = false }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const id = youtubeId(trailer);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} trailer`}
      className="fixed inset-0 z-100 grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-surface-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close trailer"
          className="absolute top-3 right-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-border bg-background/80 transition hover:bg-background"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="aspect-video w-full">
          {id ? (
            <iframe
              title={`${title} trailer`}
              src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0`}
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
              className="h-full w-full border-0"
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              {loading ? "Loading trailer…" : "Trailer unavailable"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
