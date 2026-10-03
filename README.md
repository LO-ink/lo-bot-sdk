# LO Bot SDK

A typed server-side bot client. The client owns input validation, deadlines and cancellation. An explicitly supplied transport owns server serialization and credentials.

## Supported client operations

- Read bot identity and configured commands.
- Send, edit and delete plain-text messages.
- Send photos, documents and AAC voice messages by upload or cached file ID.
- Open registered mini-apps through typed keyboards and chat menu buttons.
- Replace the command list.
- Poll normalized updates with an explicit processing cursor.

The client surface is not the complete server API. Callback acknowledgement and some advanced server methods are outside this client surface. The LO HTTP adapter provides lossless webhook parsing; the application must authenticate each webhook first. Unrecognized polled updates are represented as `kind: 'unhandled'` with their cursor; callers must decide how to handle them before advancing the offset.

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

## LO-native secretary extension (0.2)

`createSecretaryClient` uses a separate `SecretaryTransport` extension. Existing
ordinary transports continue implementing `BotTransport` alone. Normalized
`BotUpdate` now also includes `secretary_connection`, `secretary_message`,
`secretary_message_edited` and `secretary_messages_deleted`; update exhaustive
switches when upgrading from 0.1.

Enable the bot's secretary capability explicitly in LO bot management. A human
owner must then select that bot, permitted private chats, and individual rights
and save consent. Capability alone grants no access. The six rights are
independent: receiving does not mark a message read, and sending does not permit
editing or deleting. `deleteAll: true` requires the separately granted destructive
right; it is never inferred from `delete_sent`.

```ts
import {
  createSecretaryClient,
  type SecretaryTransport,
  type SecretaryUpdate,
} from "@lo-ink/bot-sdk";

export async function reply(
  transport: SecretaryTransport,
  update: SecretaryUpdate,
  requestId: string,
) {
  if (update.kind !== "secretary_message" || update.message.secretaryBotId)
    return;
  const secretary = createSecretaryClient(transport);
  const connection = await secretary.getConnection(update.message.connectionId);
  if (
    !connection.enabled ||
    connection.policyVersion !== update.context.policyVersion ||
    !connection.rights.includes("send_messages")
  )
    return;
  return secretary.sendText({
    connectionId: connection.id,
    context: update.context,
    requestId, // Persist before sending; reuse the same key and body on uncertainty.
    text: "Your message was received.",
  });
}
```

The server rechecks current consent, token generation, chat scope, source revision,
manual takeover and the 24-hour incoming window at every action. A cached
connection never authorizes a write. Use context exactly as delivered: its
`conversationId` is the messenger conversation, while `chatId` and a normalized
message's `conversationId` identify the other human. Never substitute one for the
other or send an owner ID or token generation as a grant.

State must be isolated by bot ID + connection ID + chat ID. Deduplicate events
with their stable `eventId`, not polling cursor alone. Do not reply to delegated
messages or human owner echoes. Pause, revoke, edit/delete of the source, policy
changes and token rotation invalidate old work. Receiving and actions provide
new events only, with no history export. Credentials stay on the server.

Calls never retry automatically. A timeout or transport error may mean the
server already committed. Retry only the exact stored request ID/context/body;
never generate a replacement key. `BotError.code` classifies `forbidden`,
`conflict`, `invalid-input`, `rate-limited`, `timeout`, `aborted` and transport
failures. Respect `retryAfterSeconds`; do not log upstream bodies or credentials.

The [LO HTTP adapter and no-AI reference bot](https://github.com/lo-ink/lo-platform-adapters/tree/main/examples/secretary)
show polling and authenticated webhooks, private durable state, replay handling,
revoke and explicit per-chat auto opt-in. This is LO-native delegation: familiar
business wire names do not imply Telegram accounts, Telegram profile permissions,
history access, money/gifts, or a Telegram connector. AI is not enabled.

Secretary messages may include `caption`, `attachments`, `albumId` and
`mediaStatus`. Supported incoming files use `secretary-v1` read capabilities
bound to their connection, chat, policy and exact source revision. `getFile(fileId)`
returns a relative `path` and `expiresAt`; download from the Bot API's authenticated
`/file/bot<TOKEN>/<path>` route. Each GET checks current consent again. URLs last
five minutes and downloads are capped at 50 MiB. File references cannot be used as
ordinary bot media grants. `unsupported` and `unavailable` media statuses carry no
usable file grant. The reference bot deliberately answers text only.

`sendText` accepts an optional `quote: { text, offsetUtf16 }`, selecting at most
1024 UTF-16 units of the **exact source message**. The server checks the fragment
and source revision; another message or chat cannot be used as a quote source.
The returned message exposes `replyToMessageId` and `quote`.

`sendMedia({ ...action, fileIds, caption?, quote? })` reuses 1..10 distinct scoped
file references from that same source. Its LO `sendBusinessMedia` wire method
checks both current receive and send consent before writing the reply. Photos,
audio and video may share one native album; documents form a separate album.
Voice is sent alone without a caption. Captions are limited to 1024 UTF-16 units.
The result keeps the human `senderId`, `secretaryBotId`, `mediaFileIds`, caption
and album ID. It accepts no arbitrary URL, uploaded file, ordinary file ID or
expiring download path. There is no grant to browse the owner's media library.
Reuse the exact request ID/body after an uncertain outcome. The native reply
store currently limits source IDs for sending to positive int32; larger IDs
receive a typed unsupported response.

### Review drafts and owner-controlled automatic templates

`client.proposeDraft({ connection, requestId, text, reason: 'template' })`
creates a text draft bound to the delivered source/context. Reasons are
`template`, `manual_review`, or `cannot_answer`; text is at most 4096 UTF-16
units. The receipt carries draft ID, revision, state, mode and expiry. Retry an
uncertain result with the same request ID and identical input.

Review is the default for this proposal workflow. Only the human owner can
approve/cancel drafts or enable a separate per-chat automatic rule in LO.
Automatic mode requires the exact stored template, selected days/hours/timezone
and cooldown. `cannot_answer` always needs review. Revocation, source changes,
a newer incoming message and the owner's manual reply cancel pending drafts.
Once a source has a draft, `sendText` cannot bypass its approval.

The existing direct send methods remain available under the owner's explicit
`send_messages` permission for sources without a draft. SDK settings and bot
payloads cannot authorize an automatic rule. This reference workflow has no AI
provider or model calls.

## Open a mini-app from a bot

Requires `@lo-ink/bot-http-lo` 0.3.0 or a transport implementing the new operations.

```ts
await bot.sendMessage({
  conversationId: verifiedUserId,
  text: "Пора сыграть!",
  replyMarkup: {
    inline_keyboard: [
      [
        {
          text: "Открыть",
          web_app: { url: registeredAppUrl },
        },
      ],
    ],
  },
});
await bot.setChatMenuButton({
  menuButton: {
    type: "web_app",
    text: "Открыть",
    web_app: { url: registeredAppUrl },
  },
});
```

`registeredAppUrl` must match the LO Connect URL **byte for byte**, including query
and trailing slash, to receive registered signed launch data. Web App buttons
require HTTPS and a private chat; reply-keyboard Web App URLs are limited to 512
UTF-8 bytes. Inline keyboards support `url`, `callback_data` (1–64 bytes) and
`web_app`. `replyMarkup` is optional on text edits and all media sends.

## Upload once, reuse a file

```ts
const sent = await bot.sendPhoto({
  conversationId: verifiedUserId,
  photo: { data: bytes, name: "result.png", mime: "image/png" },
  caption: "Ваш результат",
  replyMarkup,
});
await bot.sendPhoto({
  conversationId: verifiedUserId,
  photo: { fileId: sent.fileId },
});
```

`InputFile` accepts `{ fileId }` or `{ data: Uint8Array | Blob | ReadableStream,
name, mime? }`. LO accepts no media HTTP(S) URLs. Photo limit is 10 MiB; document
and voice limits are 50 MiB. Photo/document captions allow 1024 UTF-16 units. A
voice must contain AAC in M4A/MP4 or raw AAC; OGG/Opus and voice captions are not
supported. Filename/MIME checks do not replace the server's content validation.
The HTTP transport builds multipart, including JSON-string `reply_markup`, and
bounds streams before fetch. Photo `fileId` comes from the final, largest size.

Cache references per bot. On `BadRequest` describing `wrong file identifier`,
forget the cached ID and explicitly upload the original again. No automatic
retry: another upload can create another message, and uploads lack Idempotency-Key.

## Error decisions and send limits

| Error class                                                   | Existing code                                                       | Application decision                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `RateLimited` with `retryAfterSec` (also `retryAfterSeconds`) | `rate-limited`                                                      | Schedule after `parameters.retry_after`; no automatic retry       |
| `NotAllowed`                                                  | `forbidden`                                                         | Stop sending and revoke stored consent                            |
| `BadRequest` with sanitized `description`                     | `invalid-input`                                                     | Fix the request; do not blindly repeat                            |
| `Unavailable`                                                 | `unavailable`, legacy network `transport`, or `unsupported` for 501 | Back off; account for an ambiguous outcome and possible duplicate |

All extend `BotError`; API failures also extend `BotApiError`, exported by the
HTTP transport as the existing `HttpBotError`. Local validation remains
`BotError("invalid-input")`. Aborts/timeouts retain their existing categories.
`BOT_SEND_LIMITS`: 30 messages/s per bot, 1/s per chat (burst 5), 20/min per group.
An installation may configure stricter limits. Queue pacing is application-owned.
