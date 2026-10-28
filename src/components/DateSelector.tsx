import { nextDays, toDateKey } from "@/lib/shows";

export function DateSelector({
  value,
  onChange,
  days = 7,
}: {
  value: string;
  onChange: (d: string) => void;
  days?: number;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {nextDays(days).map((d, i) => {
        const key = toDateKey(d);
        const active = key === value;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            aria-pressed={active}
            className={`min-w-18 shrink-0 rounded-xl border px-3 py-2 text-center transition ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:border-primary/50 hover:bg-surface-2"
            }`}
          >
            <span className="block text-[10px] font-semibold tracking-wide uppercase">
              {i === 0
                ? "Today"
                : i === 1
                  ? "Tomorrow"
                  : d.toLocaleDateString("en-IN", { weekday: "short" })}
            </span>
            <span className="block text-sm font-bold">
              {d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
