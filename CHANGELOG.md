# Changelog

## 0.4.1

- Reject repeated cached document references in albums before sending; LO requires distinct documents.

- Accept signed LO media references returned by `getFile` as relative download paths while continuing to reject URLs and traversal.

## 0.4.0

- Add callback updates/answers, app-data events without fabricated message IDs, and reply keyboard removal.

- Use native LO keyboard fields; HTTP serialization stays in the adapter. Upgrade 0.3 keyboard objects alongside the HTTP package.
- Add an on-demand capability cache with explicit refresh; unknown installation flags remain unknown.

- Add video uploads/reference sends, audio references, homogeneous albums and streamed file downloads.
- Validate UTF-16 text limits, non-empty text, video metadata and inline-only media/edit keyboards before transport.
- Expose identity flags and optional installation capabilities; add structured failure details and one opt-in retry after confirmed refusal.
- Remove non-LO URL schemes from native keyboard validation.

## 0.3.0

- Added typed inline/reply Web App keyboards, chat menu buttons, sendPhoto/sendDocument/sendVoice and reusable fileId results.
- Added pre-transport keyboard, caption, file size, URL and voice-format validation.
- Added RateLimited, NotAllowed, BadRequest, Unavailable, BotApiError and platform limit constants.
- Existing BotError codes and retryAfterSeconds remain compatible. Mutations are never automatically retried.
- Validate the effective MIME of voice Blobs before transport, including inferred MIME types and explicit overrides.
