import type { Identifier, Message } from "./entities.js";

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
