export function MovieDataNotice({
  sample,
  busy,
  onRetry,
}: {
  sample: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role="status"
      className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 text-sm text-muted-foreground sm:px-6"
    >
      <p className="flex-1">
        {sample
          ? "Showing sample movies while we reconnect to the movie service."
          : "Some movie updates are temporarily unavailable. Retrying automatically."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="font-semibold text-primary disabled:opacity-50"
      >
        {busy ? "Reconnecting…" : "Try again"}
      </button>
    </div>
  );
}
