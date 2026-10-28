export function HeroSkeleton() {
  return (
    <div className="relative h-[62vh] min-h-[420px] w-full animate-pulse overflow-hidden bg-surface-2">
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6">
        <div className="h-3 w-40 rounded bg-surface" />
        <div className="mt-4 h-10 w-2/3 max-w-lg rounded bg-surface" />
        <div className="mt-4 h-3 w-1/2 max-w-md rounded bg-surface" />
        <div className="mt-6 flex gap-3">
          <div className="h-11 w-36 rounded-full bg-surface" />
          <div className="h-11 w-36 rounded-full bg-surface" />
        </div>
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-2/3 w-full rounded-2xl bg-surface-2" />
      <div className="mt-2 h-3 w-3/4 rounded bg-surface-2" />
      <div className="mt-1.5 h-3 w-1/2 rounded bg-surface-2" />
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-4 px-4 py-8 sm:grid-cols-3 sm:px-6 lg:grid-cols-6">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function RailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="h-5 w-48 animate-pulse rounded bg-surface-2" />
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-[56vh] min-h-96 w-full bg-surface-2" />
      <div className="mx-auto -mt-32 w-full max-w-7xl px-4 sm:px-6">
        <div className="flex gap-6">
          <div className="h-64 w-44 shrink-0 rounded-2xl bg-surface" />
          <div className="flex-1 pt-6">
            <div className="h-9 w-2/3 rounded bg-surface" />
            <div className="mt-4 h-3 w-1/2 rounded bg-surface" />
            <div className="mt-8 h-11 w-40 rounded-full bg-surface" />
          </div>
        </div>
      </div>
    </div>
  );
}
