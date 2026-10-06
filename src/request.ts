import { BotError } from "./errors.js";
import type { RequestOptions } from "./entities.js";
function object(value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new BotError("invalid-input", "Expected an input object.");
}
function validTimeout(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 2_147_483_647;
}

export function validateRequestOptions(
  requestOptions: RequestOptions,
  defaultTimeout: number,
) {
  object(requestOptions);
  const signal = requestOptions.signal;
  if (
    signal !== undefined &&
    (signal === null ||
      typeof signal !== "object" ||
      typeof signal.aborted !== "boolean" ||
      typeof signal.addEventListener !== "function" ||
      typeof signal.removeEventListener !== "function")
  ) {
    throw new BotError("invalid-input", "Expected an AbortSignal.");
  }
  const timeout = requestOptions.timeoutMs ?? defaultTimeout;
  if (!validTimeout(timeout))
    throw new BotError(
      "invalid-input",
      "timeoutMs must be an integer between 1 and 2147483647.",
    );
  if (signal?.aborted) throw new BotError("aborted", "Request aborted.");
  return { signal, timeout };
}

export function createOperationRequester<
  Operations extends {
    [K in keyof Operations]: { input: unknown; output: unknown };
  },
>(
  transport: {
    execute<K extends keyof Operations>(
      operation: K,
      input: Operations[K]["input"],
      options: { signal: AbortSignal },
    ): Promise<Operations[K]["output"]>;
  },
  options: { timeoutMs?: number } = {},
) {
  object(options);
  if (!transport || typeof transport.execute !== "function")
    throw new BotError("invalid-input", "Expected a bot transport.");
  const defaultTimeout = options.timeoutMs ?? 35_000;
  if (!validTimeout(defaultTimeout))
    throw new BotError(
      "invalid-input",
      "timeoutMs must be an integer between 1 and 2147483647.",
    );
  return async function request<K extends keyof Operations>(
    operation: K,
    input: Operations[K]["input"],
    requestOptions: RequestOptions = {},
  ): Promise<Operations[K]["output"]> {
    const { signal, timeout } = validateRequestOptions(
      requestOptions,
      defaultTimeout,
    );
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      let settled = false;
      const finish = (
        result:
          | { ok: true; value: Operations[K]["output"] }
          | { ok: false; error: unknown },
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          signal?.removeEventListener("abort", cancel);
        } catch {
          /* Preserve request settlement. */
        }
        if (!result.ok)
          reject(
            result.error instanceof BotError
              ? result.error
              : new BotError("transport", "Bot transport failed."),
          );
        else resolve(result.value);
      };
      const cancel = () => {
        finish({
          ok: false,
          error: new BotError("aborted", "Request aborted."),
        });
        controller.abort();
      };
      const timer = setTimeout(() => {
        finish({
          ok: false,
          error: new BotError("timeout", "Request timed out."),
        });
        controller.abort();
      }, timeout);
      try {
        signal?.addEventListener("abort", cancel, { once: true });
        if (settled) return;
        if (signal?.aborted) {
          cancel();
          return;
        }
      } catch (error) {
        finish({ ok: false, error });
        return;
      }
      try {
        void transport
          .execute(operation, input, { signal: controller.signal })
          .then(
            (value) => finish({ ok: true, value }),
            (error) => finish({ ok: false, error }),
          );
      } catch (error) {
        finish({ ok: false, error });
      }
    });
  };
}
