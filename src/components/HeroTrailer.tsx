import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export function youtubeId(url?: string) {
  if (!url) return null;
  const m = url.match(/(?:embed\/|v=|youtu\.be\/)([\w-]{6,})/);
  return m?.[1] ?? null;
}

type Props = { trailer?: string; backdrop: string; title: string };

/** Cinematic hero background: muted looping trailer with image fallback. */
export function HeroTrailer({ trailer, backdrop, title }: Props) {
  const isMobile = useIsMobile();
  const id = youtubeId(trailer);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  const useVideo = !!id && !isMobile && !failed;

  useEffect(() => {
    if (!useVideo) return;
    const t = setTimeout(() => setReady(true), 400);
    const fail = setTimeout(() => setReady((r) => (r ? r : (setFailed(true), false))), 8000);
    return () => {
      clearTimeout(t);
      clearTimeout(fail);
    };
  }, [useVideo]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <img src={backdrop} alt={`${title} backdrop`} className="h-full w-full object-cover" />

      {useVideo && (
        <div
          className={`pointer-events-none absolute inset-0 transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
          aria-hidden="true"
        >
          <iframe
            title={`${title} trailer background`}
            src={`https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&modestbranding=1&playsinline=1&rel=0&showinfo=0&disablekb=1&iv_load_policy=3`}
            allow="autoplay; encrypted-media"
            tabIndex={-1}
            onError={() => setFailed(true)}
            className="pointer-events-none absolute top-1/2 left-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full -translate-x-1/2 -translate-y-1/2 border-0"
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/85 via-background/40 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/25 to-background/10" />
    </div>
  );
}
