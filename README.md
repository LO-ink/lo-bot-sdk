# LO Bot SDK

A typed server-side bot client. The client owns input validation, deadlines and cancellation. An explicitly supplied transport owns server serialization and credentials.

## Supported client operations

- Read bot identity and configured commands.
- Send, edit and delete plain-text messages.
- Replace the command list.
- Poll normalized updates with an explicit processing cursor.

This initial client surface is not the complete server API. Media, callbacks, markup and webhook handling require subsequent typed modules. Unrecognized polled updates are represented as `kind: 'unhandled'` with their cursor; callers must decide how to handle them before advancing the offset.

## Usage

```ts
import { createBotClient, type BotTransport } from "@lo-ink/bot-sdk";

export async function identifyBot(transport: BotTransport) {
  const bot = createBotClient(transport, { timeoutMs: 35_000 });
  const identity = await bot.getIdentity();
  return identity;
}
```

Identifiers are decimal strings. Do not convert them to JavaScript numbers. The default deadline covers polling waits up to 30 seconds. Each call can override the deadline and supply an `AbortSignal`.

The client does not retry sends: a network failure can occur after the server stores a message. Retrying a send can create a duplicate. Polling callers advance the cursor only after durable processing, and coordinate a single owner for each bot's polling stream.

Credentials must stay on the application server. Do not bundle this package or a bot transport with browser applications.

## Development

```sh
npm ci
npm run check
npm test
npm pack --dry-run
```

Transport integration and upstream-library compatibility are maintained in [lo-platform-adapters](https://github.com/lo-ink/lo-platform-adapters). Their test results are separate from this client's unit tests.
