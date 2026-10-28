import { Link } from "@tanstack/react-router";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5" aria-label="CineBook home">
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-primary shadow-lg shadow-primary/30">
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" />
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary-foreground" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 3v2h2V7H5Zm0 4v2h2v-2H5Zm0 4v2h2v-2H5Zm12-8v2h2V7h-2Zm0 4v2h2v-2h-2Zm0 4v2h2v-2h-2ZM9 7v10h6V7H9Z"
          />
        </svg>
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-lg font-bold tracking-tight">
            Cine<span className="text-gradient-gold">Book</span>
          </span>
          <span className="block text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Your seat awaits
          </span>
        </span>
      )}
    </Link>
  );
}
