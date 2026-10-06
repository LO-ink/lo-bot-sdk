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
/** Per-request cancellation and deadline. No request is retried automatically. */
export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}
