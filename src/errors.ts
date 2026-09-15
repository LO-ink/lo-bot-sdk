/** Stable error categories independent of a server's wire format. */
export type BotErrorCode =
  | "invalid-input"
  | "aborted"
  | "timeout"
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "rate-limited"
  | "conflict"
  | "unsupported"
  | "unavailable"
  | "invalid-response"
  | "transport";
/** A request failure with a stable category and optional retry guidance. */
export class BotError extends Error {
  override readonly name = "BotError";
  constructor(
    readonly code: BotErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
