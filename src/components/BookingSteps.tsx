const STEPS = ["Movie", "Showtime", "Seats", "Summary", "Payment", "Ticket"];

export function BookingSteps({ current }: { current: number }) {
  return (
    <ol className="mx-auto flex w-full max-w-3xl items-center gap-1 overflow-x-auto pb-1 text-[11px]">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex flex-1 items-center gap-1">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] font-bold ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`hidden truncate sm:block ${active ? "font-semibold" : "text-muted-foreground"}`}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && (
              <span className={`h-px flex-1 ${done ? "bg-accent" : "bg-border"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
