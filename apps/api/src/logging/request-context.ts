import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context, available to any code that runs while a request is
 * handled (services, storage, audit), without passing `req` around. The
 * logger adds `requestId` from it to every entry.
 */
type RequestContext = { requestId: string };

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(
  context: RequestContext,
  work: () => T,
): T => storage.run(context, work);

/** The current request's id, or undefined outside a request (startup, CLIs). */
export const getRequestId = (): string | undefined =>
  storage.getStore()?.requestId;
