import {
  BotApiError,
  RateLimited,
  NotAllowed,
  BadRequest,
  Unavailable,
  type BotErrorCode,
  type BotFailureDetails,
} from "../errors.js";

function canonicalCode(platformCode: number): BotErrorCode {
  switch (platformCode) {
    case 400:
      return "invalid-input";
    case 401:
      return "unauthenticated";
    case 403:
      return "forbidden";
    case 404:
      return "not-found";
    case 409:
      return "conflict";
    case 429:
      return "rate-limited";
    case 501:
      return "unsupported";
    default:
      return platformCode >= 500 ? "unavailable" : "transport";
  }
}

function errorMessage(code: BotErrorCode): string {
  switch (code) {
    case "invalid-input":
      return "LO Bot API rejected the request.";
    case "unauthenticated":
      return "LO Bot API rejected the bot credential.";
    case "forbidden":
      return "LO Bot API denied the operation.";
    case "not-found":
      return "LO Bot API could not find the requested resource.";
    case "conflict":
      return "LO Bot API reported an operation conflict.";
    case "rate-limited":
      return "LO Bot API rate limit was reached.";
    case "unsupported":
      return "LO Bot API does not support the operation.";
    case "unavailable":
      return "LO Bot API is unavailable.";
    default:
      return "LO Bot API request failed.";
  }
}

export function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

export function retryAfter(
  bodySeconds: unknown,
  response: Response,
): number | undefined {
  const fromBody = positiveInteger(bodySeconds);
  if (fromBody !== undefined) return fromBody;
  const header = response.headers.get("retry-after");
  if (!header || !/^[0-9]+$/.test(header)) return undefined;
  return positiveInteger(Number(header));
}

/** Classify a refusal using only validated metadata and sanitized descriptions. */
export function httpFailure(
  status: number,
  platformCode = status,
  retry?: number,
  description?: string,
  details?: BotFailureDetails,
): BotApiError {
  if (platformCode === 429)
    return new RateLimited(retry, status, platformCode, details);
  if (platformCode === 403) return new NotAllowed(status, platformCode);
  if (platformCode === 400)
    return new BadRequest(description, status, platformCode, details);
  const code = canonicalCode(platformCode);
  if (platformCode >= 500)
    return new Unavailable(
      errorMessage(code),
      status,
      platformCode,
      code === "unsupported" ? "unsupported" : "unavailable",
      platformCode === 501
        ? { ...details, reason: details?.reason ?? "method_not_implemented" }
        : details,
    );
  return new BotApiError(code, errorMessage(code), status, platformCode, retry);
}
