import { BotError } from './errors.js';
import type { BotCommand, BotOperations, BotTransport, Identifier, RequestOptions } from './types.js';

function id(value: string): void {
  if (typeof value !== 'string' || !/^-?[1-9][0-9]*$/.test(value)) throw new BotError('invalid-input', 'Expected a non-zero decimal identifier.');
}
function text(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) throw new BotError('invalid-input', 'Expected text between 1 and 4096 UTF-16 units.');
}

/** Create a client over an explicitly chosen transport. Credentials stay in the transport. */
export function createBotClient(transport: BotTransport, options: { timeoutMs?: number } = {}) {
  const defaultTimeout = options.timeoutMs ?? 35_000;
  if (!Number.isFinite(defaultTimeout) || defaultTimeout <= 0) throw new BotError('invalid-input', 'timeoutMs must be positive and finite.');
  function request<K extends keyof BotOperations>(operation: K, input: BotOperations[K]['input'], requestOptions: RequestOptions = {}): Promise<BotOperations[K]['output']> {
    const timeout = requestOptions.timeoutMs ?? defaultTimeout;
    if (!Number.isFinite(timeout) || timeout <= 0) return Promise.reject(new BotError('invalid-input', 'timeoutMs must be positive and finite.'));
    if (requestOptions.signal?.aborted) return Promise.reject(new BotError('aborted', 'Request aborted.'));
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      let settled = false;
      const finish = (result: { ok: true; value: BotOperations[K]['output'] } | { ok: false; error: unknown }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        requestOptions.signal?.removeEventListener('abort', cancel);
        if (!result.ok) reject(result.error instanceof BotError ? result.error : new BotError('transport', 'Bot transport failed.'));
        else resolve(result.value);
      };
      const cancel = () => { finish({ ok: false, error: new BotError('aborted', 'Request aborted.') }); controller.abort(); };
      const timer = setTimeout(() => { finish({ ok: false, error: new BotError('timeout', 'Request timed out.') }); controller.abort(); }, timeout);
      requestOptions.signal?.addEventListener('abort', cancel, { once: true });
      if (requestOptions.signal?.aborted) { cancel(); return; }
      try { void transport.execute(operation, input, { signal: controller.signal }).then(value => finish({ ok: true, value }), error => finish({ ok: false, error })); }
      catch (error) { finish({ ok: false, error }); }
    });
  }
  return {
    /** Fetch the authenticated bot identity. */
    getIdentity: (options?: RequestOptions) => request('getIdentity', undefined, options),
    /** Send one plain-text message. Retrying can create another message. */
    sendMessage(input: BotOperations['sendMessage']['input'], options?: RequestOptions) { id(input.conversationId); text(input.text); return request('sendMessage', input, options); },
    /** Replace the text of one stored message. */
    editMessage(input: BotOperations['editMessage']['input'], options?: RequestOptions) { id(input.conversationId); id(input.messageId); text(input.text); return request('editMessage', input, options); },
    /** Delete one stored message. */
    deleteMessage(input: { conversationId: Identifier; messageId: Identifier }, options?: RequestOptions) { id(input.conversationId); id(input.messageId); return request('deleteMessage', input, options); },
    /** Read configured commands. */
    getCommands: (options?: RequestOptions) => request('getCommands', undefined, options),
    /** Replace configured commands. An empty array removes them. */
    setCommands(commands: readonly BotCommand[], options?: RequestOptions) {
      if (!Array.isArray(commands) || commands.length > 100 || new Set(commands.map(x => x.name)).size !== commands.length || commands.some(x => !/^[a-z0-9_]{1,32}$/.test(x.name) || typeof x.description !== 'string' || !x.description.trim() || x.description.length > 256)) throw new BotError('invalid-input', 'Expected up to 100 unique commands with names and descriptions.');
      return request('setCommands', { commands }, options);
    },
    /** Read updates. Advance offset only after durable processing of an update. */
    getUpdates(input: BotOperations['getUpdates']['input'] = {}, options?: RequestOptions) {
      if (input.offset !== undefined && !/^[0-9]+$/.test(input.offset)) throw new BotError('invalid-input', 'offset must be a non-negative decimal identifier.');
      if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)) throw new BotError('invalid-input', 'limit must be between 1 and 100.');
      if (input.waitSeconds !== undefined && (!Number.isInteger(input.waitSeconds) || input.waitSeconds < 0 || input.waitSeconds > 30)) throw new BotError('invalid-input', 'waitSeconds must be between 0 and 30.');
      return request('getUpdates', input, options);
    },
  };
}
/** The ready client returned by {@link createBotClient}. */
export type BotClient = ReturnType<typeof createBotClient>;
