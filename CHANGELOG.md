# Changelog

## 0.3.0

- Added typed inline/reply Web App keyboards, chat menu buttons, sendPhoto/sendDocument/sendVoice and reusable fileId results.
- Added pre-transport keyboard, caption, file size, URL and voice-format validation.
- Added RateLimited, NotAllowed, BadRequest, Unavailable, BotApiError and platform limit constants.
- Existing BotError codes and retryAfterSeconds remain compatible. Mutations are never automatically retried.
