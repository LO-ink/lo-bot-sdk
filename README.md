# LO Bot SDK

A typed server-side bot client. The client owns input validation, deadlines and cancellation. Native LO HTTP transport is included; generic clients can also accept an explicitly supplied transport.

## Supported client operations

- Read bot identity and configured commands.
- Acknowledge callback button actions.
- Send, edit and delete plain-text messages.
- Reply to messages, send silently, and report typing or media activity.
- Send photos, documents, AAC voice messages and videos by upload or cached file ID.
- Send audio by file ID and homogeneous photo/document albums.
- Resolve file metadata and download a bounded byte stream.
- Open registered mini-apps through typed keyboards and chat menu buttons.
- Replace the command list.
- Poll normalized updates with an explicit processing cursor.

The client covers a subset of the server API. Unrecognized polled updates retain their cursor as `kind: 'unhandled'`; handle them before advancing the offset.

## Usage

```sh
npm install @lo-ink/bot-sdk
```

```ts
import { createLoBotClient } from "@lo-ink/bot-sdk";

const token = process.env.LO_BOT_TOKEN;
if (!token) throw new Error("LO_BOT_TOKEN is required");
const bot = createLoBotClient({ token });
const identity = await bot.getIdentity();
```

Use `createLoSecretaryClient(options)` for the secretary extension. For shared
transport ownership, pass `createLoHttpBotTransport(options)` to
`createBotClient(transport)` and `createSecretaryClient(transport)`.

The native HTTP implementation owns bounded responses/downloads, lossless IDs,
wire serialization and credential redaction. It never retries a mutation after
an uncertain delivery. `parseLoBotWebhookUpdate` parses normalized updates;
authenticate webhook requests before parsing or trusting them.

Identifiers are decimal strings. Do not convert them to JavaScript numbers. The default deadline covers polling waits up to 30 seconds. Each call can override the deadline and supply an `AbortSignal`.

The client does not retry sends: a network failure can occur after the server stores a message. Retrying a send can create a duplicate. Polling callers advance the cursor only after durable processing, and coordinate a single owner for each bot's polling stream.

Credentials must stay on the application server. Do not bundle this package or a bot transport with browser applications.

## Replies and chat activity

```ts
await bot.sendMessage({
  conversationId: verifiedUserId,
  text: "Your result is ready",
  replyToMessageId: receivedMessage.id,
  disableNotification: true,
});
await bot.sendChatAction({ conversationId: verifiedUserId, action: "typing" });
```

Text, media and album sends share `SendOptions`. `replyToMessageId` is a decimal
string from 1 to 2147483647 in the same conversation. Set
`allowSendingWithoutReply: true` to send if that target is missing; it has no
effect without a reply ID. Replies do not support quoted fragments or another
conversation. `disableNotification` controls notification sound.

`ChatAction` accepts `typing`, `choose_sticker`, `find_location`, `record_voice`,
`upload_voice`, `record_video`, `record_video_note`, `upload_photo`, `upload_video`,
`upload_document` and `upload_video_note`. Each call sends one action; the SDK does
not start a timer or retry it. Custom `BotTransport` implementations must handle
the new `sendChatAction` operation in SDK 0.7.

## LO-native secretary extension

`createSecretaryClient` uses a separate `SecretaryTransport` extension. Existing
ordinary transports continue implementing `BotTransport` alone. Normalized
`BotUpdate` includes `secretary_connection`, `secretary_message`,
`secretary_message_edited` and `secretary_messages_deleted`.

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

// Invoke only after the bot has authenticated the owner's approval and
// atomically claimed the exact persisted proposal. Approval lives in the bot.
export async function sendApprovedReply(
  transport: SecretaryTransport,
  update: SecretaryUpdate,
  requestId: string,
  text: string,
) {
  if (update.kind !== "secretary_message" || update.message.secretaryBotId)
    return;
  const { connectionId, senderId } = update.message;
  const context = { ...update.context };
  const secretary = createSecretaryClient(transport);
  const connection = await secretary.getConnection(connectionId);
  if (
    !connection.enabled ||
    connection.policyVersion !== context.policyVersion ||
    connection.ownerId === senderId ||
    !connection.rights.includes("receive_messages") ||
    !connection.rights.includes("send_messages")
  )
    return;
  return secretary.sendText({
    connectionId: connection.id,
    context,
    requestId, // Persist this exact key, source context and text before sending.
    text,
  });
}
```

AI replies, pending proposals and their approval belong to the bot application.
Present the proposal in the owner's private bot chat; authenticate the callback,
match the owner and exact proposal/message, and atomically claim that persisted
proposal before calling this helper. An owner ID alone is not an approval proof.
The helper rechecks delegated consent; it does not implement a universal approval
gate. Retain the original context, text and request ID on uncertain outcomes,
and retry only that already approved operation. Never turn a legacy native draft
or an unapproved job into a delegated send.

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

Secretary messages may include `caption`, `attachments`, `albumId` and
`mediaStatus`. Supported incoming files use `secretary-v1` read capabilities
bound to their connection, chat, policy and exact source revision. `getFile(fileId)`
returns a relative `path` and `expiresAt`; download from the Bot API's authenticated
`/file/bot<TOKEN>/<path>` route using `bot.downloadFile({ path: file.path })`,
where `bot` and the Secretary client share the same transport. Each GET checks
current consent again. URLs last five minutes and downloads are capped at 50 MiB. File references cannot be used as
ordinary bot media grants. `unsupported` and `unavailable` media statuses carry no
usable file grant.

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

### Bot-owned replies and native templates

Native `proposeDraft` and `SecretaryDraft` are retired; do not replay their pending
jobs as sends. Bots manage their own proposals, authenticated owner approvals,
cancellation, expiry and recovery. Use delegated `sendText` only after
the bot's approval policy permits that exact persisted reply; the server checks
current permission and source context again.

Pause/revoke, a changed policy or source, a newer incoming message and manual
owner takeover must invalidate pending bot proposals. Do not regenerate request
IDs, replace source context, or fall back to a send after a rejected/unknown
native proposal. Historical sources with platform draft tombstones can remain
closed; use a new incoming source instead of bypassing the fence.

Owner-configured exact templates, schedules and cooldown remain native LO
features. SDK settings, AI text and bot payloads cannot authorize an automatic
rule. AI/Q&A replies and their management remain the bot developer's responsibility.

## Open a mini-app from a bot

The included native HTTP transport supports registered Mini App buttons and menus.

```ts
await bot.sendMessage({
  conversationId: verifiedUserId,
  text: "Time to play!",
  replyMarkup: {
    inlineKeyboard: [
      [
        {
          text: "Open",
          miniApp: { url: registeredAppUrl },
        },
      ],
    ],
  },
});
await bot.setChatMenuButton({
  menuButton: {
    type: "miniApp",
    text: "Open",
    miniApp: { url: registeredAppUrl },
  },
});
```

`registeredAppUrl` must match the LO Connect URL **byte for byte**, including query
and trailing slash, to receive registered signed launch data. Web App buttons
require HTTPS and a private chat; reply-keyboard Web App URLs are limited to 512
UTF-8 bytes. Inline keyboards support `url`, `callbackData` (1–64 bytes) and
`miniApp`. `replyMarkup` is optional on text edits and all media sends.

## Upload once, reuse a file

```ts
const sent = await bot.sendPhoto({
  conversationId: verifiedUserId,
  photo: { data: bytes, name: "result.png", mime: "image/png" },
  caption: "Your result",
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
bounds streams before fetch. Photo `fileId` comes from the final, largest size. Media sends and text edits accept inline keyboards; reply keyboards are supported only by `sendMessage`.

Cache references per bot. On `BadRequest` describing `wrong file identifier`,
forget the cached ID and explicitly upload the original again. No automatic
retry: another upload can create another message, and uploads lack Idempotency-Key.

## Error decisions and send limits

| Error class                                                   | Existing code                                                | Application decision                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `RateLimited` with `retryAfterSec` (also `retryAfterSeconds`) | `rate-limited`                                               | Schedule after `parameters.retry_after`; no automatic retry       |
| `NotAllowed`                                                  | `forbidden`                                                  | Stop sending and revoke stored consent                            |
| `BadRequest` with sanitized `description`                     | `invalid-input`                                              | Fix the request; do not blindly repeat                            |
| `Unavailable`                                                 | `unavailable`, network `transport`, or `unsupported` for 501 | Back off; account for an ambiguous outcome and possible duplicate |

All extend `BotError`; API failures also extend `BotApiError`, exported by the
HTTP transport as the existing `HttpBotError`. Local validation remains
`BotError("invalid-input")`. Aborts/timeouts retain their existing categories.
`BOT_SEND_LIMITS`: 30 messages/s per bot, 1/s per chat (burst 5), 20/min per group.
An installation may configure stricter limits. Queue pacing is application-owned.

## Video, albums and downloads

```ts
const video = await bot.sendVideo({
  conversationId: verifiedUserId,
  video: { data: videoBytes, name: "clip.mp4", mime: "video/mp4" },
  duration: 3,
  width: 640,
  height: 360,
  thumbnail: { data: posterBytes, name: "poster.jpg", mime: "image/jpeg" },
  supportsStreaming: true,
});
await bot.sendVideo({
  conversationId: verifiedUserId,
  video: { fileId: video.fileId },
});
await bot.sendMediaGroup({
  conversationId: verifiedUserId,
  media: [
    { type: "photo", media: { fileId: firstPhotoId }, caption: "Album" },
    { type: "photo", media: { fileId: secondPhotoId } },
  ],
});
const file = await bot.getFile(receivedFileId);
if (file.path) {
  const stream = await bot.downloadFile({
    path: file.path,
    signal: abortController.signal,
  });
  // Consume or cancel the stream. The signal also cancels an ongoing download.
}
```

Video metadata and thumbnails apply only to uploads. Video uploads depend on the installation; audio uploads are unavailable. `sendAudio` accepts only `fileId`. Albums require 2–10 photos or 2–10 documents, with one caption on the first item. Cached document references must be distinct. LO stores an album as one message: its returned items may share a message ID.

Video defaults to a 90-second request deadline because transcoding can wait 45 seconds. An explicit client or request deadline takes precedence. Other calls retain their 35-second default. File downloads stay on the authenticated LO file route, refuse redirects and stop at 50 MiB by default. A missing `path` means this media has no direct downloadable file. Download refusals use the same HTTP error categories as API calls, including `unauthenticated` for 401, `RateLimited` for 429 and `unsupported` for 501. Valid positive integer `Retry-After` headers provide retry guidance; error bodies and credential URLs are never exposed, and downloads are not retried automatically.

`getIdentity()` exposes group-reading and inline-query flags separately from installation capabilities.

`BotApiError.details` carries structured `parameter` and `reason` when provided. Server descriptions are classified only in the native HTTP transport. `retryRejected(() => bot.sendVideo(input))` is opt-in and retries once after an explicit 429 refusal marked `safeToRetry`, within `maxWaitSeconds` (30 by default). It never retries network failures or uncertain outcomes. The operation must create a fresh stream for each attempt or use replayable bytes/Blob.

Call `await bot.getCapabilities()` at startup and before jobs that depend on installation features. Results refresh on demand after five minutes; `getCapabilities({refresh: true})` bypasses the cache. `undefined` on older servers means unknown. Bot permissions remain separate identity fields. No background polling or timers are installed.

Incoming updates distinguish ordinary messages, callback buttons and `appData` events. Ordinary messages expose `senderId` when the server identifies their author; it may be absent. App data from older LO installations may omit a stored message ID; the event retains its real update cursor and conversation. Treat `data` as user input, and verify signed launch data separately for application authorization. Incoming media messages also expose `mediaType` and a reusable `fileId` when available. Cache references per bot. Reply keyboards can be cleared with `{removeKeyboard: true}`.

```ts
for (const update of await bot.getUpdates()) {
  if (update.kind === "callback") {
    await bot.answerCallback({ callbackId: update.callback.id, text: "Done" });
  }
}
```

`editReplyMarkup` changes an existing message's inline buttons without resending its text or media. Custom `BotTransport` implementations must handle this operation in SDK 0.8. Pass an empty keyboard to remove them:

```ts
const message = await bot.editReplyMarkup({
  conversationId: "42",
  messageId: "7",
  replyMarkup: { inlineKeyboard: [] },
});
```

Download paths include signed LO media references returned by `getFile`. Pass the returned path unchanged to `downloadFile`; it stays on the authenticated file route. URLs and traversal are refused.

## Quality checks

Run `make install` and `make ci` with Node.js 22.13 or newer. The same targets run
in GitHub Actions. CI checks formatting, ESLint (including typed promises),
TypeScript, dependency cycles and package boundaries, tests, published package
contents, vulnerable dependencies and secrets. Documentation and comments must be English.

Coverage includes all runtime modules and fails below 90% lines, statements and
functions, or 80% branches. Reports are uploaded as CI artifacts. Policy checks
require Python 3; secret scanning uses the repository Gitleaks configuration.
