import { createBotClient, type BotClient } from "./client.js";
import { createSecretaryClient, type SecretaryClient } from "./secretary.js";
import {
  createLoHttpBotTransport,
  type LoHttpBotTransportOptions,
} from "./http/index.js";

/** Creates a native LO Bot API client; credentials stay on the server. */
export function createLoBotClient(
  options: LoHttpBotTransportOptions,
  clientOptions?: Parameters<typeof createBotClient>[1],
): BotClient {
  return createBotClient(createLoHttpBotTransport(options), clientOptions);
}

/** Creates the native LO secretary client using the same HTTP transport. */
export function createLoSecretaryClient(
  options: LoHttpBotTransportOptions,
  clientOptions?: Parameters<typeof createSecretaryClient>[1],
): SecretaryClient {
  return createSecretaryClient(
    createLoHttpBotTransport(options),
    clientOptions,
  );
}
