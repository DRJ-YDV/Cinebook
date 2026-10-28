import { AsyncLocalStorage } from "node:async_hooks";

// Share the context across Vite reloads and server bundles, but isolate each
// request so a disconnected client cannot hide another request's error.
const key = Symbol.for("cinebook:request-context");
const globals = globalThis as typeof globalThis & { [key]?: AsyncLocalStorage<Request> };
const storage = (globals[key] ??= new AsyncLocalStorage<Request>());

export function withRequest<T>(request: Request, callback: () => T): T {
  return storage.run(request, callback);
}

export function currentRequest(): Request | undefined {
  return storage.getStore();
}
