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
