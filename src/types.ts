/** A stable identifier. Kept as text to avoid numeric precision loss. */
export type Identifier = string;
/** Known installation features. Missing values mean unknown, not disabled. */
export interface BotCapabilities {
  readonly videoUploads?: boolean;
  readonly audioUploads?: boolean;
  readonly singleAttach?: boolean;
  readonly mediaGroups?: boolean;
  readonly chatActions?: boolean;
}
/** Public identity of the authenticated bot. */
export interface BotIdentity {
  readonly id: Identifier;
  readonly name: string;
  readonly handle?: string;
  readonly canJoinGroups?: boolean;
  readonly canReadAllGroupMessages?: boolean;
  readonly supportsInlineQueries?: boolean;
  /** Installation features, when advertised by the server. Absence means unknown. */
  readonly capabilities?: BotCapabilities;
}
/** A stored text message returned by a bot operation. */
export interface Message {
  readonly id: Identifier;
  readonly conversationId: Identifier;
  readonly text?: string;
  readonly caption?: string;
  /** Reusable reference belonging to this bot; cache after a successful upload. */
  readonly fileId?: string;
  readonly mediaType?: "photo" | "document" | "voice" | "video" | "audio";
}
/** Exactly one action per button, with a single LO action. */
export type InlineKeyboardButton = { readonly text: string } & (
  | {
      readonly url: string;
      readonly callbackData?: never;
      readonly miniApp?: never;
    }
  | {
      readonly callbackData: string;
      readonly url?: never;
      readonly miniApp?: never;
    }
  | {
      readonly miniApp: { readonly url: string };
      readonly url?: never;
      readonly callbackData?: never;
    }
);
export interface InlineKeyboard {
  readonly inlineKeyboard: readonly (readonly InlineKeyboardButton[])[];
}
export interface ReplyKeyboard {
  readonly keyboard: readonly (readonly {
    readonly text: string;
    readonly miniApp?: { readonly url: string };
  }[])[];
  readonly resize?: boolean;
  readonly oneTime?: boolean;
  readonly persistent?: boolean;
  readonly selective?: false;
  readonly placeholder?: string;
}
export interface ReplyKeyboardRemove {
  readonly removeKeyboard: true;
  readonly selective?: false;
}
export type ReplyMarkup = InlineKeyboard | ReplyKeyboard | ReplyKeyboardRemove;
export type ChatMenuButton =
  | {
      readonly type: "miniApp";
      readonly text: string;
      readonly miniApp: { readonly url: string };
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
export type UploadFile = Exclude<InputFile, { readonly fileId: string }>;
export interface VideoInput extends MediaInput {
  video: InputFile;
  caption?: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail?: UploadFile;
  supportsStreaming?: boolean;
}
export interface AlbumItem {
  type: "photo" | "document";
  media: InputFile;
  /** LO stores one caption on the first item. */
  caption?: string;
}
export interface BotFile {
  readonly fileId: string;
  readonly uniqueId: string;
  readonly size?: number;
  /** Missing for media that has no directly downloadable file. */
  readonly path?: string;
}
/** Command displayed by the client, without a slash prefix. */
export interface BotCommand {
  readonly name: string;
  readonly description: string;
}
/** A callback from a button. It may have no stored message attached. */
export interface Callback {
  readonly id: string;
  readonly userId: Identifier;
  readonly data?: string;
  readonly message?: Message;
}
/** App data is an event; older installations may not give it a message ID. */
export interface AppData {
  readonly conversationId: Identifier;
  readonly userId?: Identifier;
  readonly messageId?: Identifier;
  readonly data: string;
  readonly buttonText?: string;
}
export interface CallbackAnswer {
  callbackId: string;
  text?: string;
  showAlert?: boolean;
}
/** A normalized update. Unrecognized updates retain their cursor without exposing an untyped payload. */
export type BotUpdate =
  | import("./secretary.js").SecretaryUpdate
  | {
      readonly id: Identifier;
      readonly kind: "message";
      readonly message: Message;
    }
  | {
      readonly id: Identifier;
      readonly kind: "callback";
      readonly callback: Callback;
    }
  | {
      readonly id: Identifier;
      readonly kind: "appData";
      readonly appData: AppData;
    }
  | { readonly id: Identifier; readonly kind: "unhandled" };
/** Operations owned by the bot client. Additional transport features use separate extensions. */
export interface BotOperations {
  getIdentity: { input: undefined; output: BotIdentity };
  answerCallback: { input: CallbackAnswer; output: boolean };
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
  sendVideo: {
    input: VideoInput;
    output: Message & { readonly fileId: string };
  };
  sendAudio: {
    input: MediaInput & {
      audio: { readonly fileId: string };
      caption?: string;
    };
    output: Message & { readonly fileId: string };
  };
  sendMediaGroup: {
    input: { conversationId: Identifier; media: readonly AlbumItem[] };
    output: readonly (Message & { readonly fileId: string })[];
  };
  getFile: { input: { fileId: string }; output: BotFile };
  /** The stream owns its cancellation after the initial request completes. */
  downloadFile: {
    input: { path: string; maxBytes?: number; signal?: AbortSignal };
    output: ReadableStream<Uint8Array>;
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
