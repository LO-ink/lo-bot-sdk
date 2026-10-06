import { BotError } from "./errors.js";
import { createOperationRequester } from "./request.js";
import type { RequestOptions } from "./entities.js";

import type {
  SecretaryQuote,
  SecretaryAction,
  SecretaryOperations,
  SecretaryTransport,
} from "./secretary-types.js";
export type * from "./secretary-types.js";

function invalid(): never {
  throw new BotError("invalid-input", "Invalid secretary request.");
}
function integer(value: string, maximum = 9223372036854775807n): void {
  if (
    typeof value !== "string" ||
    !/^[1-9][0-9]{0,18}$/.test(value) ||
    BigInt(value) > maximum
  )
    invalid();
}
function connectionId(value: string): void {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ) ||
    value === "00000000-0000-0000-0000-000000000000"
  )
    invalid();
}
function action(value: SecretaryAction): void {
  if (
    !value ||
    !value.context ||
    typeof value.requestId !== "string" ||
    !/^[\x21-\x7e]{8,128}$/.test(value.requestId)
  )
    invalid();
  connectionId(value.connectionId);
  integer(value.context.conversationId, 2147483647n);
  integer(value.context.chatId, 999999999999999n);
  integer(value.context.policyVersion);
  integer(value.context.sourceMessageId);
  integer(value.context.sourceRevision);
}
function text(value: string): void {
  if (typeof value !== "string" || !value || Array.from(value).length > 4096)
    invalid();
}

function selectedQuote(value: SecretaryQuote | undefined): void {
  if (
    value !== undefined &&
    (!value ||
      typeof value.text !== "string" ||
      !value.text.trim() ||
      value.text.length > 1024 ||
      !Number.isInteger(value.offsetUtf16) ||
      value.offsetUtf16 < 0 ||
      value.offsetUtf16 > 2147483647)
  )
    invalid();
}
function fileReference(value: string): void {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    !/^secretary-v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]{22}$/.test(value)
  )
    invalid();
}

/** Explicit extension: an ordinary transport is not required to support delegation. */
export function createSecretaryClient(
  transport: SecretaryTransport,
  options: { timeoutMs?: number } = {},
) {
  if (!transport || typeof transport.executeSecretary !== "function") invalid();
  const request = createOperationRequester<SecretaryOperations>(
    {
      execute: (operation, input, requestOptions) =>
        transport.executeSecretary(operation, input, requestOptions),
    },
    options,
  );
  return {
    async proposeDraft(
      input: SecretaryOperations["proposeDraft"]["input"],
      options?: RequestOptions,
    ) {
      action(input);
      text(input.text);
      if (input.text.length > 4096) invalid();
      if (
        !["template", "manual_review", "cannot_answer"].includes(input.reason)
      )
        invalid();
      return request("proposeDraft", input, options);
    },
    async getFile(fileId: string, options?: RequestOptions) {
      if (
        typeof fileId !== "string" ||
        fileId.length > 4096 ||
        !/^secretary-v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]{22}$/.test(fileId)
      )
        invalid();
      return request("getFile", { fileId }, options);
    },
    async getConnection(id: string, options?: RequestOptions) {
      connectionId(id);
      return request("getConnection", { connectionId: id }, options);
    },
    async sendText(
      input: SecretaryOperations["sendText"]["input"],
      options?: RequestOptions,
    ) {
      action(input);
      text(input.text);
      selectedQuote(input.quote);
      return request("sendText", input, options);
    },
    async sendMedia(
      input: SecretaryOperations["sendMedia"]["input"],
      options?: RequestOptions,
    ) {
      action(input);
      selectedQuote(input.quote);
      if (
        !Array.isArray(input.fileIds) ||
        input.fileIds.length < 1 ||
        input.fileIds.length > 10 ||
        new Set(input.fileIds).size !== input.fileIds.length ||
        (input.caption !== undefined &&
          (typeof input.caption !== "string" || input.caption.length > 1024))
      )
        invalid();
      for (const file of input.fileIds) fileReference(file);
      return request("sendMedia", input, options);
    },
    async editText(
      input: SecretaryOperations["editText"]["input"],
      options?: RequestOptions,
    ) {
      action(input);
      integer(input.messageId);
      text(input.text);
      return request("editText", input, options);
    },
    async markRead(input: SecretaryAction, options?: RequestOptions) {
      action(input);
      return request("markRead", input, options);
    },
    async deleteMessages(
      input: SecretaryOperations["deleteMessages"]["input"],
      options?: RequestOptions,
    ) {
      action(input);
      if (
        !Array.isArray(input.messageIds) ||
        input.messageIds.length < 1 ||
        input.messageIds.length > 100 ||
        new Set(input.messageIds).size !== input.messageIds.length ||
        (input.deleteAll !== undefined && typeof input.deleteAll !== "boolean")
      )
        invalid();
      for (const id of input.messageIds) integer(id);
      return request("deleteMessages", input, options);
    },
  };
}
export type SecretaryClient = ReturnType<typeof createSecretaryClient>;
