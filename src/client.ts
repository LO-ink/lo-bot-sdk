import { createOperationRequester } from "./request.js";
import { BotError } from "./errors.js";
import type {
  BotCommand,
  BotOperations,
  BotTransport,
  Identifier,
  RequestOptions,
} from "./types.js";

function id(value: string, positive = false): void {
  const pattern = positive ? /^[1-9][0-9]*$/ : /^-?[1-9][0-9]*$/;
  if (typeof value !== "string" || !pattern.test(value))
    throw new BotError("invalid-input", "Expected a valid decimal identifier.");
}
function text(value: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Array.from(value).length > 4096
  )
    throw new BotError(
      "invalid-input",
      "Expected text between 1 and 4096 Unicode code points.",
    );
}
function object(value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new BotError("invalid-input", "Expected an input object.");
}
/** Create a client over an explicitly chosen transport. Credentials stay in the transport. */
export function createBotClient(
  transport: BotTransport,
  options: { timeoutMs?: number } = {},
) {
  const request = createOperationRequester<BotOperations>(transport, options);
  return {
    /** Fetch the authenticated bot identity. */
    getIdentity: (options?: RequestOptions) =>
      request("getIdentity", undefined, options),
    /** Send one plain-text message. Retrying can create another message. */
    async sendMessage(
      input: BotOperations["sendMessage"]["input"],
      options?: RequestOptions,
    ) {
      object(input);
      id(input.conversationId);
      text(input.text);
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
      return request("editMessage", input, options);
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
