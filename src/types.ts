/** A stable identifier. Kept as text to avoid numeric precision loss. */
export type Identifier = string;
/** Public identity of the authenticated bot. */
export interface BotIdentity { readonly id: Identifier; readonly name: string; readonly handle?: string; }
/** A stored text message returned by a bot operation. */
export interface Message { readonly id: Identifier; readonly conversationId: Identifier; readonly text?: string; }
/** Command displayed by the client, without a slash prefix. */
export interface BotCommand { readonly name: string; readonly description: string; }
/** A normalized update. Unrecognized updates retain their cursor without exposing an untyped payload. */
export type BotUpdate = { readonly id: Identifier; readonly kind: 'message'; readonly message: Message } | { readonly id: Identifier; readonly kind: 'unhandled' };
/** Operations owned by the bot client. Additional transport features use separate extensions. */
export interface BotOperations {
  getIdentity: { input: undefined; output: BotIdentity };
  sendMessage: { input: { conversationId: Identifier; text: string }; output: Message };
  editMessage: { input: { conversationId: Identifier; messageId: Identifier; text: string }; output: Message };
  deleteMessage: { input: { conversationId: Identifier; messageId: Identifier }; output: boolean };
  getCommands: { input: undefined; output: readonly BotCommand[] };
  setCommands: { input: { commands: readonly BotCommand[] }; output: boolean };
  getUpdates: { input: { offset?: Identifier; limit?: number; waitSeconds?: number }; output: readonly BotUpdate[] };
}
/** Per-request cancellation and deadline. No request is retried automatically. */
export interface RequestOptions { signal?: AbortSignal; timeoutMs?: number; }
/** A transport implements server serialization and credential handling outside the client. */
export interface BotTransport {
  execute<K extends keyof BotOperations>(operation: K, input: BotOperations[K]['input'], options: { signal: AbortSignal }): Promise<BotOperations[K]['output']>;
}
