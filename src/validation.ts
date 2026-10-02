import { BotError } from "./errors.js";
import type { ChatMenuButton, InputFile, ReplyMarkup } from "./types.js";

/** Platform defaults; a deployment may configure stricter limits. */
export const BOT_SEND_LIMITS = Object.freeze({
  botPerSecond: 30,
  chatPerSecond: 1,
  chatBurst: 5,
  groupPerMinute: 20,
});
export const BOT_MEDIA_LIMITS = Object.freeze({
  photoBytes: 10 << 20,
  documentBytes: 50 << 20,
  voiceBytes: 50 << 20,
  captionLength: 1024,
});
const bytes = (s: string) => new TextEncoder().encode(s).length;
function fail(message: string): never {
  throw new BotError("invalid-input", message);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Expected an object.");
  return value as Record<string, unknown>;
}
function url(value: unknown, httpsOnly: boolean): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    /[\u0000\r\n\t]/.test(value)
  )
    fail("Expected a valid button URL.");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail("Expected an absolute button URL.");
  }
  if (
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    !(httpsOnly
      ? parsed.protocol === "https:"
      : ["https:", "http:", "tg:"].includes(parsed.protocol))
  )
    fail("Web App buttons require HTTPS without credentials.");
}
export function validateReplyMarkup(
  value: ReplyMarkup | undefined,
  conversationId: string,
): void {
  if (value === undefined) return;
  const markup = record(value);
  const inline = Object.hasOwn(markup, "inline_keyboard");
  const rows = inline ? markup.inline_keyboard : markup.keyboard;
  const allowed = inline
    ? ["inline_keyboard"]
    : [
        "keyboard",
        "resize_keyboard",
        "one_time_keyboard",
        "is_persistent",
        "selective",
        "input_field_placeholder",
      ];
  if (
    Object.keys(markup).some((k) => !allowed.includes(k)) ||
    !Array.isArray(rows)
  )
    fail("Invalid keyboard markup.");
  let count = 0;
  for (const row of rows) {
    if (
      !Array.isArray(row) ||
      row.length === 0 ||
      row.length > 8 ||
      (count += row.length) > 100
    )
      fail("Expected up to 100 buttons, with 1–8 buttons per row.");
    for (const raw of row) {
      const button = record(raw);
      if (typeof button.text !== "string" || !button.text)
        fail("Expected button text.");
      const actions = Object.keys(button).filter((k) => k !== "text");
      if ((inline && actions.length !== 1) || (!inline && actions.length > 1))
        fail("Expected exactly one inline button action.");
      for (const action of actions) {
        if (action === "web_app") {
          const app = record(button.web_app);
          if (Object.keys(app).length !== 1 || !Object.hasOwn(app, "url"))
            fail("Invalid Web App button.");
          url(app.url, true);
          if (conversationId.startsWith("-"))
            fail("Web App buttons are available only in private chats.");
          if (!inline && bytes(app.url as string) > 512)
            fail("Reply Web App URL exceeds 512 bytes.");
        } else if (inline && action === "url") url(button.url, false);
        else if (inline && action === "callback_data") {
          if (
            typeof button.callback_data !== "string" ||
            bytes(button.callback_data) < 1 ||
            bytes(button.callback_data) > 64
          )
            fail("callback_data must be 1–64 bytes.");
        } else fail("Unsupported keyboard action.");
      }
    }
  }
  for (const key of [
    "resize_keyboard",
    "one_time_keyboard",
    "is_persistent",
    "selective",
  ])
    if (markup[key] !== undefined && typeof markup[key] !== "boolean")
      fail("Expected boolean keyboard options.");
  if (
    markup.input_field_placeholder !== undefined &&
    (typeof markup.input_field_placeholder !== "string" ||
      Array.from(markup.input_field_placeholder).length > 64)
  )
    fail("Invalid keyboard placeholder.");
  if (bytes(JSON.stringify(markup)) > 32768)
    fail("Keyboard exceeds 32768 bytes.");
}
export function validateMenuButton(value: ChatMenuButton): void {
  const button = record(value);
  if (button.type === "web_app") {
    if (
      Object.keys(button).some(
        (k) => !["type", "text", "web_app"].includes(k),
      ) ||
      typeof button.text !== "string" ||
      !button.text.trim() ||
      Array.from(button.text).length > 64
    )
      fail("Invalid menu button text.");
    const app = record(button.web_app);
    if (Object.keys(app).length !== 1) fail("Invalid menu Web App.");
    url(app.url, true);
    if (bytes(app.url as string) > 512) fail("Menu URL exceeds 512 bytes.");
  } else if (
    !["commands", "default"].includes(button.type as string) ||
    Object.keys(button).length !== 1
  )
    fail("Invalid menu button.");
}
export function validateInputFile(
  input: InputFile,
  kind: "photo" | "document" | "voice",
): void {
  if (typeof input === "string" && /^https?:/i.test(input))
    fail("LO does not accept media URLs; upload a file or reuse a fileId.");
  const file = record(input);
  if (Object.hasOwn(file, "fileId")) {
    if (
      typeof file.fileId !== "string" ||
      !file.fileId ||
      file.data !== undefined
    )
      fail("Expected a non-empty fileId or file data.");
    if (/^https?:/i.test(file.fileId))
      fail("LO does not accept media URLs; upload a file or reuse a fileId.");
    return;
  }
  if (
    typeof file.name !== "string" ||
    !file.name ||
    /[\u0000\r\n]/.test(file.name)
  )
    fail("Expected a file name.");
  if (
    file.mime !== undefined &&
    (typeof file.mime !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(file.mime))
  )
    fail("Expected a MIME type.");
  const data = file.data;
  if (
    !(data instanceof Uint8Array) &&
    !(data instanceof Blob) &&
    !(data instanceof ReadableStream)
  )
    fail("Expected Uint8Array, Blob, or ReadableStream file data.");
  const size =
    data instanceof Uint8Array
      ? data.byteLength
      : data instanceof Blob
        ? data.size
        : undefined;
  if (size !== undefined && size > BOT_MEDIA_LIMITS[`${kind}Bytes`])
    fail("File exceeds the LO upload limit.");
  if (
    kind === "voice" &&
    (!/\.(?:m4a|mp4|aac)$/i.test(file.name) ||
      (file.mime !== undefined &&
        !["audio/mp4", "video/mp4", "audio/aac", "audio/x-m4a"].includes(
          file.mime as string,
        )))
  )
    fail(
      "LO voice uploads require AAC in M4A/MP4 or raw AAC; OGG/Opus is unsupported.",
    );
}
export function validateCaption(caption: unknown): void {
  if (
    caption !== undefined &&
    (typeof caption !== "string" ||
      caption.length > BOT_MEDIA_LIMITS.captionLength)
  )
    fail("Caption must be at most 1024 UTF-16 code units.");
}
