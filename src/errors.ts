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

/** API failure metadata. Also exported as HttpBotError by the LO transport. */
export class BotApiError extends BotError {
  constructor(
    code: BotErrorCode,
    message: string,
    readonly status?: number,
    readonly platformCode?: number,
    retryAfterSeconds?: number,
    readonly description?: string,
  ) {
    super(code, message, retryAfterSeconds);
    Object.defineProperty(this, "name", {
      value: "HttpBotError",
      configurable: true,
    });
  }
}
export class RateLimited extends BotApiError {
  constructor(retryAfterSec?: number, status?: number, platformCode?: number) {
    super(
      "rate-limited",
      "LO Bot API rate limit was reached.",
      status,
      platformCode,
      retryAfterSec,
    );
    Object.defineProperty(this, "name", { value: "RateLimited" });
  }
  get retryAfterSec(): number | undefined {
    return this.retryAfterSeconds;
  }
}
export class NotAllowed extends BotApiError {
  constructor(status?: number, platformCode?: number) {
    super(
      "forbidden",
      "LO Bot API denied the operation.",
      status,
      platformCode,
    );
    Object.defineProperty(this, "name", { value: "NotAllowed" });
  }
}
export class BadRequest extends BotApiError {
  declare readonly description: string;
  constructor(
    description: string = "LO Bot API rejected the request.",
    status?: number,
    platformCode?: number,
  ) {
    super(
      "invalid-input",
      "LO Bot API rejected the request.",
      status,
      platformCode,
      undefined,
      description,
    );
    Object.defineProperty(this, "name", { value: "BadRequest" });
  }
}
export class Unavailable extends BotApiError {
  constructor(
    message = "LO Bot API is unavailable.",
    status?: number,
    platformCode?: number,
    code: "unavailable" | "transport" | "unsupported" = "unavailable",
  ) {
    super(code, message, status, platformCode);
    Object.defineProperty(this, "name", { value: "Unavailable" });
  }
}
