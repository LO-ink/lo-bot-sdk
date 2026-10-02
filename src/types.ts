/** A stable identifier. Kept as text to avoid numeric precision loss. */
export type Identifier = string;
/** Public identity of the authenticated bot. */
export interface BotIdentity {
  readonly id: Identifier;
  readonly name: string;
  readonly handle?: string;
}
/** A stored text message returned by a bot operation. */
export interface Message {
  readonly id: Identifier;
  readonly conversationId: Identifier;
  readonly text?: string;
  readonly caption?: string;
  /** Reusable reference belonging to this bot; cache after a successful upload. */
  readonly fileId?: string;
}
/** Exactly one action per button, using the Bot API's keyboard shape. */
export type InlineKeyboardButton = { readonly text: string } & (
  | {
      readonly url: string;
      readonly callback_data?: never;
      readonly web_app?: never;
    }
  | {
      readonly callback_data: string;
      readonly url?: never;
      readonly web_app?: never;
    }
  | {
      readonly web_app: { readonly url: string };
      readonly url?: never;
      readonly callback_data?: never;
    }
);
export interface InlineKeyboard {
  readonly inline_keyboard: readonly (readonly InlineKeyboardButton[])[];
}
export interface ReplyKeyboard {
  readonly keyboard: readonly (readonly {
    readonly text: string;
    readonly web_app?: { readonly url: string };
  }[])[];
  readonly resize_keyboard?: boolean;
  readonly one_time_keyboard?: boolean;
  readonly is_persistent?: boolean;
  readonly selective?: boolean;
  readonly input_field_placeholder?: string;
}
export type ReplyMarkup = InlineKeyboard | ReplyKeyboard;
export type ChatMenuButton =
  | {
      readonly type: "web_app";
      readonly text: string;
      readonly web_app: { readonly url: string };
    }
  | { readonly type: "commands" | "default" };
export type InputFile =
  | { readonly fileId: string; readonly data?: never }
  | {
      readonly data: Uint8Array | Blob | ReadableStream<Uint8Array>;
      readonly name: string;
      readonly mime?: string;
      readonly fileId?: never;
    };
export interface MediaInput {
  conversationId: Identifier;
  replyMarkup?: ReplyMarkup;
}
/** Command displayed by the client, without a slash prefix. */
export interface BotCommand {
  readonly name: string;
  readonly description: string;
}
/** A normalized update. Unrecognized updates retain their cursor without exposing an untyped payload. */
export type BotUpdate =
  | import("./secretary.js").SecretaryUpdate
  | {
      readonly id: Identifier;
      readonly kind: "message";
      readonly message: Message;
    }
  | { readonly id: Identifier; readonly kind: "unhandled" };
/** Operations owned by the bot client. Additional transport features use separate extensions. */
export interface BotOperations {
  getIdentity: { input: undefined; output: BotIdentity };
  sendMessage: {
    input: {
      conversationId: Identifier;
      text: string;
      replyMarkup?: ReplyMarkup;
    };
    output: Message;
  };
  editMessage: {
    input: {
      conversationId: Identifier;
      messageId: Identifier;
      text: string;
      replyMarkup?: ReplyMarkup;
    };
    output: Message;
  };
  deleteMessage: {
    input: { conversationId: Identifier; messageId: Identifier };
    output: boolean;
  };
  sendPhoto: {
    input: MediaInput & { photo: InputFile; caption?: string };
    output: Message & { readonly fileId: string };
  };
  sendDocument: {
    input: MediaInput & { document: InputFile; caption?: string };
    output: Message & { readonly fileId: string };
  };
  sendVoice: {
    input: MediaInput & { voice: InputFile };
    output: Message & { readonly fileId: string };
  };
  setChatMenuButton: {
    input: { conversationId?: Identifier; menuButton: ChatMenuButton };
    output: boolean;
  };
  getCommands: { input: undefined; output: readonly BotCommand[] };
  setCommands: { input: { commands: readonly BotCommand[] }; output: boolean };
  getUpdates: {
    input: { offset?: Identifier; limit?: number; waitSeconds?: number };
    output: readonly BotUpdate[];
  };
}
/** Per-request cancellation and deadline. No request is retried automatically. */
export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}
/** A transport implements server serialization and credential handling outside the client. */
export interface BotTransport {
  execute<K extends keyof BotOperations>(
    operation: K,
    input: BotOperations[K]["input"],
    options: { signal: AbortSignal },
  ): Promise<BotOperations[K]["output"]>;
}
