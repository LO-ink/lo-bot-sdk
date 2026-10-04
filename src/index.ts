export { createBotClient } from "./client.js";
export { retryRejected } from "./retry.js";
export type { BotFailureDetails, BotFailureReason } from "./errors.js";
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
  BotCapabilities,
  Callback,
  CallbackAnswer,
  AppData,
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
  validateVideo,
  validateAlbum,
  validateFilePath,
} from "./validation.js";
export type {
  InlineKeyboardButton,
  InlineKeyboard,
  ReplyKeyboard,
  ReplyKeyboardRemove,
  ReplyMarkup,
  ChatMenuButton,
  InputFile,
  MediaInput,
  VideoInput,
  AlbumItem,
  BotFile,
  UploadFile,
} from "./types.js";
