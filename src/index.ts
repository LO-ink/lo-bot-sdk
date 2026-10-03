export { createBotClient } from "./client.js";
export { createSecretaryClient } from "./secretary.js";
export type {
  SecretaryFileDownload,
  SecretaryFileReference,
  SecretaryAttachment,
  SecretaryRight,
  SecretaryConnection,
  SecretaryContext,
  SecretaryMessage,
  SecretaryQuote,
  SecretaryUpdate,
  SecretaryAction,
  SecretaryDraft,
  SecretaryOperations,
  SecretaryTransport,
  SecretaryClient,
} from "./secretary.js";
export type { BotClient } from "./client.js";
export { BotError } from "./errors.js";
export type { BotErrorCode } from "./errors.js";
export type {
  BotCommand,
  BotIdentity,
  BotOperations,
  BotTransport,
  BotUpdate,
  Identifier,
  Message,
  RequestOptions,
} from "./types.js";

export {
  BotApiError,
  RateLimited,
  NotAllowed,
  BadRequest,
  Unavailable,
} from "./errors.js";
export {
  BOT_SEND_LIMITS,
  BOT_MEDIA_LIMITS,
  validateReplyMarkup,
  validateInputFile,
  validateCaption,
  validateMenuButton,
} from "./validation.js";
export type {
  InlineKeyboardButton,
  InlineKeyboard,
  ReplyKeyboard,
  ReplyMarkup,
  ChatMenuButton,
  InputFile,
  MediaInput,
} from "./types.js";
