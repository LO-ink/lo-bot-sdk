import { BotError } from "./errors.js";
import { createOperationRequester } from "./request.js";
import type { Identifier, Message, RequestOptions } from "./types.js";

/** Independent LO rights. Sending never implies reading or deleting messages. */
export type SecretaryRight =
  | "receive_messages"
  | "send_messages"
  | "mark_read"
  | "edit_sent"
  | "delete_sent"
  | "delete_all";
export interface SecretaryConnection {
  readonly id: string;
  readonly ownerId: Identifier;
  readonly policyVersion: string;
  readonly schemaVersion: 1;
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly rights: readonly SecretaryRight[];
}
/** Exact event context. Credentials, owner identity and history are never caller inputs. */
export interface SecretaryContext {
  readonly conversationId: Identifier;
  readonly chatId: Identifier;
  readonly policyVersion: string;
  readonly sourceMessageId: Identifier;
  readonly sourceRevision: string;
}
export interface SecretaryFileReference {
  readonly fileId: string;
  readonly uniqueId: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
}
export type SecretaryAttachment =
  | {
      readonly kind: "photo";
      readonly sizes: readonly (SecretaryFileReference & {
        readonly width: number;
        readonly height: number;
      })[];
    }
  | (SecretaryFileReference & {
      readonly kind: "document";
      readonly fileName?: string;
    })
  | (SecretaryFileReference & {
      readonly kind: "voice";
      readonly durationSeconds: number;
    })
  | (SecretaryFileReference & {
      readonly kind: "audio";
      readonly durationSeconds: number;
      readonly title?: string;
      readonly performer?: string;
    })
  | (SecretaryFileReference & {
      readonly kind: "video";
      readonly durationSeconds: number;
      readonly width?: number;
      readonly height?: number;
    });
export interface SecretaryQuote {
  readonly text: string;
  /** Offset into the exact source text, in UTF-16 code units. */
  readonly offsetUtf16: number;
}
export interface SecretaryMessage extends Message {
  readonly replyToMessageId?: Identifier;
  readonly quote?: SecretaryQuote;
  readonly mediaFileIds?: readonly string[];
  readonly caption?: string;
  readonly attachments?: readonly SecretaryAttachment[];
  readonly albumId?: string;
  readonly mediaStatus?: "available" | "unavailable" | "unsupported";
  readonly connectionId: string;
  readonly senderId: Identifier;
  readonly secretaryBotId?: Identifier;
}
export type SecretaryUpdate =
  | {
      readonly id: Identifier;
      readonly kind: "secretary_connection";
      readonly connection: SecretaryConnection;
    }
  | {
      readonly id: Identifier;
      readonly kind: "secretary_message" | "secretary_message_edited";
      readonly eventId: string;
      readonly context: SecretaryContext;
      readonly message: SecretaryMessage;
    }
  | {
      readonly id: Identifier;
      readonly kind: "secretary_messages_deleted";
      readonly eventId: string;
      readonly connectionId: string;
      readonly context: SecretaryContext;
      readonly messageIds: readonly Identifier[];
    };
export interface SecretaryAction {
  readonly connectionId: string;
  readonly context: SecretaryContext;
  /** 8..128 printable characters. Reuse exactly on an uncertain outcome. */
  readonly requestId: string;
}
export interface SecretaryDraft {
  readonly id: string;
  readonly connectionId: string;
  readonly conversationId: Identifier;
  readonly chatId: Identifier;
  readonly sourceMessageId: Identifier;
  readonly revision: string;
  readonly state: "draft" | "approved" | "sent" | "cancelled" | "expired";
  readonly mode: "review" | "auto";
  readonly text: string;
  readonly reason: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly secretaryBotId: Identifier;
  readonly messageId?: Identifier;
}
export interface SecretaryFileDownload {
  readonly fileId: string;
  readonly uniqueId: string;
  /** Relative, signed five-minute path. A download still checks live consent. */
  readonly path: string;
  readonly expiresAt: number;
}
export interface SecretaryOperations {
  proposeDraft: {
    input: SecretaryAction & {
      text: string;
      reason: "template" | "manual_review" | "cannot_answer";
    };
    output: SecretaryDraft;
  };
  getFile: { input: { fileId: string }; output: SecretaryFileDownload };
  getConnection: {
    input: { connectionId: string };
    output: SecretaryConnection;
  };
  sendText: {
    input: SecretaryAction & { text: string; quote?: SecretaryQuote };
    output: SecretaryMessage;
  };
  sendMedia: {
    input: SecretaryAction & {
      fileIds: readonly string[];
      caption?: string;
      quote?: SecretaryQuote;
    };
    output: SecretaryMessage;
  };
  editText: {
    input: SecretaryAction & { messageId: Identifier; text: string };
    output: SecretaryMessage;
  };
  markRead: { input: SecretaryAction; output: boolean };
  deleteMessages: {
    input: SecretaryAction & {
      messageIds: readonly Identifier[];
      deleteAll?: boolean;
    };
    output: boolean;
  };
}
export interface SecretaryTransport {
  executeSecretary<K extends keyof SecretaryOperations>(
    operation: K,
    input: SecretaryOperations[K]["input"],
    options: { signal: AbortSignal },
  ): Promise<SecretaryOperations[K]["output"]>;
}
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
