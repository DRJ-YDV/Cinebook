/** Only classify abort errors as cancellations when this client disconnected. */
export function isCancelledRequest(request: Request, error: unknown): boolean {
  const incoming = (
    request as Request & {
      runtime?: { node?: { req?: { aborted?: boolean; errored?: unknown } } };
    }
  ).runtime?.node?.req;
  // Node marks an incomplete incoming body aborted before the response-close
  // event updates srvx's Web Request signal.
  if (!request.signal.aborted && !incoming?.aborted) return false;
  let cause = error;
  for (let depth = 0; depth < 5 && cause && typeof cause === "object"; depth++) {
    const value = cause as { name?: string; message?: string; code?: string; cause?: unknown };
    if (
      cause === request.signal.reason ||
      cause === incoming?.errored ||
      value.name === "AbortError" ||
      value.message === "aborted" ||
      value.code === "ERR_STREAM_PREMATURE_CLOSE"
    )
      return true;
    cause = value.cause;
  }
  return false;
}

export function cancelledResponse(): Response {
  return new Response(null, { status: 499, statusText: "Client Closed Request" });
}
