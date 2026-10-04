import { BotError, RateLimited } from "./errors.js";

/** One opt-in retry after a confirmed refusal. Never retries an uncertain send. */
export async function retryRejected<T>(
  operation: () => Promise<T>,
  options: { maxWaitSeconds?: number; signal?: AbortSignal } = {},
): Promise<T> {
  if (
    typeof operation !== "function" ||
    !options ||
    typeof options !== "object" ||
    Array.isArray(options)
  )
    throw new BotError(
      "invalid-input",
      "Expected an operation and retry options.",
    );
  const maxWait = options.maxWaitSeconds ?? 30;
  const signal = options.signal;
  if (!Number.isFinite(maxWait) || maxWait < 0 || maxWait > 2147483)
    throw new BotError("invalid-input", "Invalid retry wait limit.");
  if (signal !== undefined && !(signal instanceof AbortSignal))
    throw new BotError("invalid-input", "Expected a retry AbortSignal.");
  if (signal?.aborted) throw new BotError("aborted", "Request aborted.");
  try {
    return await operation();
  } catch (error) {
    if (
      !(error instanceof RateLimited) ||
      error.details?.safeToRetry !== true ||
      error.retryAfterSeconds === undefined ||
      !Number.isFinite(error.retryAfterSeconds) ||
      error.retryAfterSeconds < 0 ||
      error.retryAfterSeconds > maxWait
    )
      throw error;
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(new BotError("aborted", "Request aborted."));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        resolve();
      }, error.retryAfterSeconds! * 1000);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
    if (signal?.aborted) throw new BotError("aborted", "Request aborted.");
    return operation();
  }
}
