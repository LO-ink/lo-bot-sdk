import { createOperationRequester, validateRequestOptions } from "./request.js";
import {
  validateReplyMarkup,
  validateMenuButton,
  validateInputFile,
  validateCaption,
  validateVideo,
  validateAlbum,
  validateFilePath,
} from "./validation.js";
import { BotError } from "./errors.js";
import type {
  BotCommand,
  BotCapabilities,
  BotIdentity,
  BotOperations,
  BotTransport,
  Identifier,
  RequestOptions,
} from "./types.js";

function id(value: string, positive = false): void {
  const pattern = positive ? /^[1-9][0-9]*$/ : /^-?[1-9][0-9]*$/;
  if (
    typeof value !== "string" ||
    !pattern.test(value) ||
    value.replace("-", "").length > 19 ||
    BigInt(value) < -(2n ** 63n) ||
    BigInt(value) > 2n ** 63n - 1n
  )
    throw new BotError("invalid-input", "Expected a valid decimal identifier.");
}
function text(value: string): void {
  if (typeof value !== "string" || !value.trim() || value.length > 4096)
    throw new BotError(
      "invalid-input",
      "Expected non-empty text of at most 4096 UTF-16 code units.",
    );
}
function object(value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new BotError("invalid-input", "Expected an input object.");
}
/** Create a client over an explicitly chosen transport. Credentials stay in the transport. */
export function createBotClient(
  transport: BotTransport,
  options: { timeoutMs?: number; capabilitiesTtlMs?: number } = {},
) {
  const request = createOperationRequester<BotOperations>(transport, options);
  const identityTimeoutMs = options.timeoutMs ?? 35_000;
  const videoTimeoutMs = options.timeoutMs ?? 90_000;
  const capabilitiesTtlMs = options.capabilitiesTtlMs ?? 300_000;
  if (
    !Number.isFinite(capabilitiesTtlMs) ||
    capabilitiesTtlMs < 0 ||
    capabilitiesTtlMs > 86_400_000
  )
    throw new BotError("invalid-input", "Invalid capability cache lifetime.");
  let capabilities: BotCapabilities | undefined,
    expires = 0;
  let identityRequestOwner = 0;
  let cachedIdentityOwner = 0;
  const readIdentity = async (requestOptions: RequestOptions = {}) => {
    validateRequestOptions(requestOptions, identityTimeoutMs);
    const owner = ++identityRequestOwner;
    const identity = await request("getIdentity", undefined, requestOptions);
    const snapshot =
      identity.capabilities === undefined
        ? undefined
        : Object.freeze({ ...identity.capabilities });
    // Only the newest started read can commit cache state or renew its lifetime.
    // A failed refresh preserves the established cache and fences older reads.
    if (owner === identityRequestOwner) {
      capabilities = snapshot;
      expires = Date.now() + capabilitiesTtlMs;
      cachedIdentityOwner = owner;
    }
    return { identity, snapshot, owner };
  };
  const getIdentity = async (options?: RequestOptions): Promise<BotIdentity> =>
    (await readIdentity(options)).identity;
  return {
    /** Fetch the authenticated bot identity. */
    getIdentity,
    /** Refresh installation flags on demand. Older servers may leave them unknown. */
    async getCapabilities(
      options: RequestOptions & { refresh?: boolean } = {},
    ) {
      if (
        !options ||
        typeof options !== "object" ||
        Array.isArray(options) ||
        (options.signal !== undefined &&
          !(options.signal instanceof AbortSignal))
      )
        throw new BotError(
          "invalid-input",
          "Expected capability request options.",
        );
      if (
        options.timeoutMs !== undefined &&
        (!Number.isFinite(options.timeoutMs) ||
          options.timeoutMs <= 0 ||
          options.timeoutMs > 2_147_483_647)
      )
        throw new BotError(
          "invalid-input",
          "Invalid capability request deadline.",
        );
      if (options.refresh !== undefined && typeof options.refresh !== "boolean")
        throw new BotError(
          "invalid-input",
          "Expected a boolean capability refresh option.",
        );
      if (options.signal?.aborted)
        throw new BotError("aborted", "Request aborted.");
      if (options.refresh || Date.now() >= expires) {
        const { refresh: _refresh, ...requestOptions } = options;
        const result = await readIdentity(requestOptions);
        // A pending newer read must not erase this caller's known response.
        // Prefer a newer completed cache, including an explicit unknown value.
        return cachedIdentityOwner > result.owner
          ? capabilities
          : result.snapshot;
      }
      return capabilities;
    },
    /** Complete a callback button action. */
    async answerCallback(
      input: BotOperations["answerCallback"]["input"],
      options?: RequestOptions,
    ) {
      object(input);
      if (
        typeof input.callbackId !== "string" ||
        !input.callbackId ||
        input.callbackId.length > 1024 ||
        input.callbackId.trim() !== input.callbackId ||
        // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted input.
        /[\u0000-\u001f]/.test(input.callbackId)
      )
        throw new BotError("invalid-input", "Expected a callback identifier.");
      if (
        input.text !== undefined &&
        (typeof input.text !== "string" || Array.from(input.text).length > 200)
      )
        throw new BotError(
          "invalid-input",
          "Callback answer text is limited to 200 characters.",
        );
      if (input.showAlert !== undefined && typeof input.showAlert !== "boolean")
        throw new BotError("invalid-input", "Expected a boolean alert option.");
      return request("answerCallback", input, options);
    },
    /** Send one plain-text message. Retrying can create another message. */
    async sendMessage(
      input: BotOperations["sendMessage"]["input"],
      options?: RequestOptions,
    ) {
      object(input);
      id(input.conversationId);
      text(input.text);
      validateReplyMarkup(input.replyMarkup, input.conversationId);
      return request("sendMessage", input, options);
    },
    /** Replace the text of one stored message. */
    async editMessage(
      input: BotOperations["editMessage"]["input"],
      options?: RequestOptions,
    ) {
      object(input);
      id(input.conversationId);
      id(input.messageId, true);
      text(input.text);
      validateReplyMarkup(input.replyMarkup, input.conversationId, true);
      return request("editMessage", input, options);
    },
    async sendPhoto(
      input: BotOperations["sendPhoto"]["input"],
      options?: RequestOptions,
    ) {
      object(input);
      id(input.conversationId);
      validateReplyMarkup(input.replyMarkup, input.conversationId, true);
      validateCaption(input.caption);
      validateInputFile(input.photo, "photo");
      return request("sendPhoto", input, options);
    },
    async sendVideo(
      input: BotOperations["sendVideo"]["input"],
      options?: RequestOptions,
    ) {
      object(input);
      id(input.conversationId);
      validateReplyMarkup(input.replyMarkup, input.conversationId, true);
      validateVideo(input);
      return request("sendVideo", input, {
        timeoutMs: videoTimeoutMs,
        ...options,
      });
    },
    async sendAudio(
      input: BotOperations["sendAudio"]["input"],
      options?: RequestOptions,
    ) {
      object(input);
      id(input.conversationId);
      validateReplyMarkup(input.replyMarkup, input.conversationId, true);
      validateCaption(input.caption);
      validateInputFile(input.audio, "audio");
      if (!("fileId" in input.audio))
        throw new BotError(
          "invalid-input",
          "LO audio requires a reusable fileId; uploads are unavailable.",
        );
      return request("sendAudio", input, options);
    },
    async sendMediaGroup(
      input: BotOperations["sendMediaGroup"]["input"],
      options?: RequestOptions,
    ) {
      object(input);
      id(input.conversationId);
      validateAlbum(input.media);
      return request("sendMediaGroup", input, options);
    },
    async getFile(fileId: string, options?: RequestOptions) {
      validateInputFile({ fileId }, "document");
      return request("getFile", { fileId }, options);
    },
    async downloadFile(
      input: BotOperations["downloadFile"]["input"],
      options?: RequestOptions,
    ) {
      object(input);
      validateFilePath(input.path);
      if (
        input.maxBytes !== undefined &&
        (!Number.isSafeInteger(input.maxBytes) ||
          input.maxBytes < 1 ||
          input.maxBytes > 50 * 1024 * 1024)
      )
        throw new BotError(
          "invalid-input",
          "maxBytes must be between 1 and 52428800.",
        );
      if (input.signal !== undefined && !(input.signal instanceof AbortSignal))
        throw new BotError("invalid-input", "Expected a download AbortSignal.");
      return request(
        "downloadFile",
        { ...input, signal: input.signal ?? options?.signal },
        options,
      );
    },
    async sendDocument(
      input: BotOperations["sendDocument"]["input"],
      options?: RequestOptions,
    ) {
      object(input);
      id(input.conversationId);
      validateReplyMarkup(input.replyMarkup, input.conversationId, true);
      validateCaption(input.caption);
      validateInputFile(input.document, "document");
      return request("sendDocument", input, options);
    },
    async sendVoice(
      input: BotOperations["sendVoice"]["input"],
      options?: RequestOptions,
    ) {
      object(input);
      id(input.conversationId);
      validateReplyMarkup(input.replyMarkup, input.conversationId, true);
      validateInputFile(input.voice, "voice");
      if (Object.hasOwn(input, "caption"))
        throw new BotError(
          "invalid-input",
          "LO voice messages do not support captions.",
        );
      return request("sendVoice", input, options);
    },
    async setChatMenuButton(
      input: BotOperations["setChatMenuButton"]["input"],
      options?: RequestOptions,
    ) {
      object(input);
      if (input.conversationId !== undefined) id(input.conversationId, true);
      validateMenuButton(input.menuButton);
      return request("setChatMenuButton", input, options);
    },
    /** Delete one stored message. */
    async deleteMessage(
      input: { conversationId: Identifier; messageId: Identifier },
      options?: RequestOptions,
    ) {
      object(input);
      id(input.conversationId);
      id(input.messageId, true);
      return request("deleteMessage", input, options);
    },
    /** Read configured commands. */
    getCommands: (options?: RequestOptions) =>
      request("getCommands", undefined, options),
    /** Replace configured commands. An empty array removes them. */
    async setCommands(
      commands: readonly BotCommand[],
      options?: RequestOptions,
    ) {
      if (
        !Array.isArray(commands) ||
        commands.length > 100 ||
        commands.some(
          (x) =>
            !x ||
            typeof x.name !== "string" ||
            !/^[a-z0-9_]{1,32}$/.test(x.name) ||
            typeof x.description !== "string" ||
            !x.description.trim() ||
            Array.from(x.description).length > 256,
        ) ||
        new Set(commands.map((x) => x.name)).size !== commands.length
      )
        throw new BotError(
          "invalid-input",
          "Expected up to 100 unique commands with names and descriptions.",
        );
      return request("setCommands", { commands }, options);
    },
    /** Read updates. Advance offset only after durable processing of an update. */
    async getUpdates(
      input: BotOperations["getUpdates"]["input"] = {},
      options?: RequestOptions,
    ) {
      object(input);
      if (
        input.offset !== undefined &&
        (typeof input.offset !== "string" || !/^[0-9]+$/.test(input.offset))
      )
        throw new BotError(
          "invalid-input",
          "offset must be a non-negative decimal identifier.",
        );
      if (
        input.limit !== undefined &&
        (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
      )
        throw new BotError("invalid-input", "limit must be between 1 and 100.");
      if (
        input.waitSeconds !== undefined &&
        (!Number.isInteger(input.waitSeconds) ||
          input.waitSeconds < 0 ||
          input.waitSeconds > 30)
      )
        throw new BotError(
          "invalid-input",
          "waitSeconds must be between 0 and 30.",
        );
      return request("getUpdates", input, options);
    },
  };
}
/** The ready client returned by {@link createBotClient}. */
export type BotClient = ReturnType<typeof createBotClient>;
