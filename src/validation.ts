import { BotError } from "./errors.js";
import type {
  AlbumItem,
  ChatMenuButton,
  InputFile,
  ReplyMarkup,
  VideoInput,
} from "./types.js";

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
  videoBytes: 50 << 20,
  audioBytes: 50 << 20,
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
    // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted input.
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
      : ["https:", "http:"].includes(parsed.protocol))
  )
    fail("Mini App buttons require HTTPS without credentials.");
}
export function validateReplyMarkup(
  value: ReplyMarkup | undefined,
  conversationId: string,
  inlineOnly = false,
): void {
  if (value === undefined) return;
  const markup = record(value);
  if (Object.hasOwn(markup, "removeKeyboard")) {
    if (
      inlineOnly ||
      markup.removeKeyboard !== true ||
      Object.keys(markup).some(
        (key) => !["removeKeyboard", "selective"].includes(key),
      ) ||
      (markup.selective !== undefined && markup.selective !== false)
    )
      fail("Invalid reply keyboard removal.");
    return;
  }
  const inline = Object.hasOwn(markup, "inlineKeyboard");
  if (inlineOnly && !inline)
    fail("This LO operation accepts only an inline keyboard.");
  const rows = inline ? markup.inlineKeyboard : markup.keyboard;
  const allowed = inline
    ? ["inlineKeyboard"]
    : [
        "keyboard",
        "resize",
        "oneTime",
        "persistent",
        "selective",
        "placeholder",
      ];
  if (
    Object.keys(markup).some((k) => !allowed.includes(k)) ||
    !Array.isArray(rows) ||
    (!inline &&
      (rows.length === 0 || rows.length > 12 || markup.selective === true))
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
      if (
        typeof button.text !== "string" ||
        !button.text.trim() ||
        (!inline && Array.from(button.text).length > 64)
      )
        fail("Expected button text.");
      const actions = Object.keys(button).filter((k) => k !== "text");
      if ((inline && actions.length !== 1) || (!inline && actions.length > 1))
        fail("Expected exactly one inline button action.");
      for (const action of actions) {
        if (action === "miniApp") {
          const app = record(button.miniApp);
          if (Object.keys(app).length !== 1 || !Object.hasOwn(app, "url"))
            fail("Invalid Mini App button.");
          url(app.url, true);
          if (conversationId.startsWith("-"))
            fail("Mini App buttons are available only in private chats.");
          if (!inline && bytes(app.url as string) > 512)
            fail("Reply Mini App URL exceeds 512 bytes.");
        } else if (inline && action === "url") url(button.url, false);
        else if (inline && action === "callbackData") {
          if (
            typeof button.callbackData !== "string" ||
            bytes(button.callbackData) < 1 ||
            bytes(button.callbackData) > 64
          )
            fail("callbackData must be 1–64 bytes.");
        } else fail("Unsupported keyboard action.");
      }
    }
  }
  for (const key of ["resize", "oneTime", "persistent", "selective"])
    if (markup[key] !== undefined && typeof markup[key] !== "boolean")
      fail("Expected boolean keyboard options.");
  if (
    markup.placeholder !== undefined &&
    (typeof markup.placeholder !== "string" ||
      Array.from(markup.placeholder).length > 64)
  )
    fail("Invalid keyboard placeholder.");
  if (bytes(JSON.stringify(markup)) > 32768)
    fail("Keyboard exceeds 32768 bytes.");
}
export function validateMenuButton(value: ChatMenuButton): void {
  const button = record(value);
  if (button.type === "miniApp") {
    if (
      Object.keys(button).some(
        (k) => !["type", "text", "miniApp"].includes(k),
      ) ||
      typeof button.text !== "string" ||
      !button.text.trim() ||
      Array.from(button.text).length > 64
    )
      fail("Invalid menu button text.");
    const app = record(button.miniApp);
    if (Object.keys(app).length !== 1) fail("Invalid menu Mini App.");
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
  kind: "photo" | "document" | "voice" | "video" | "audio",
): void {
  if (typeof input === "string" && /^https?:/i.test(input))
    fail("LO does not accept media URLs; upload a file or reuse a fileId.");
  const file = record(input);
  if (Object.hasOwn(file, "fileId")) {
    if (Object.keys(file).some((key) => !["fileId", "data"].includes(key)))
      fail("Unsupported cached-file option.");
    if (
      typeof file.fileId !== "string" ||
      !file.fileId ||
      file.data !== undefined
    )
      fail("Expected a non-empty fileId or file data.");
    if (
      /^(?:https?:|attach:)/i.test(file.fileId) ||
      file.fileId.trim() !== file.fileId ||
      // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted input.
      /[\u0000\r\n]/.test(file.fileId)
    )
      fail("LO does not accept media URLs; upload a file or reuse a fileId.");
    return;
  }
  if (
    Object.keys(file).some(
      (key) => !["data", "name", "mime", "fileId"].includes(key),
    )
  )
    fail("Unsupported upload option.");
  if (
    typeof file.name !== "string" ||
    !file.name ||
    // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted input.
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
  const effectiveMime =
    file.mime ?? (data instanceof Blob && data.type ? data.type : undefined);
  if (
    kind === "voice" &&
    (!/\.(?:m4a|mp4|aac)$/i.test(file.name) ||
      (effectiveMime !== undefined &&
        !["audio/mp4", "video/mp4", "audio/aac", "audio/x-m4a"].includes(
          effectiveMime as string,
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

export function validateVideo(input: VideoInput): void {
  validateInputFile(input.video, "video");
  validateCaption(input.caption);
  for (const field of ["duration", "width", "height", "thumbnail"] as const) {
    if (input[field] !== undefined && "fileId" in input.video)
      fail(`${field} applies only to an uploaded video.`);
  }
  for (const [field, max] of [
    ["duration", 86400],
    ["width", 16384],
    ["height", 16384],
  ] as const) {
    const value = input[field];
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value < 0 || value > max)
    )
      fail(`${field} must be an integer between 0 and ${max}.`);
  }
  if (
    input.supportsStreaming !== undefined &&
    typeof input.supportsStreaming !== "boolean"
  )
    fail("supportsStreaming must be a boolean.");
  if (input.thumbnail !== undefined) {
    validateInputFile(input.thumbnail, "photo");
    if ("fileId" in input.thumbnail)
      fail("A thumbnail must be uploaded as a new file.");
  }
}

export function validateAlbum(media: readonly AlbumItem[]): void {
  if (!Array.isArray(media) || media.length < 2 || media.length > 10)
    fail("LO albums require 2–10 items.");
  let type: string | undefined;
  const documents = new Set<string>();
  for (let i = 0; i < media.length; i++) {
    const item = record(media[i]);
    if (
      Object.keys(item).some(
        (k) => !["type", "media", "caption"].includes(k),
      ) ||
      !["photo", "document"].includes(item.type as string)
    )
      fail("LO albums accept photos or documents.");
    if (type !== undefined && item.type !== type)
      fail("LO albums cannot mix media types.");
    type = item.type as string;
    validateInputFile(item.media as InputFile, type as "photo" | "document");
    if (type === "document" && "fileId" in (item.media as InputFile)) {
      const fileId = (item.media as { fileId: string }).fileId;
      if (documents.has(fileId))
        fail("LO document albums require distinct file references.");
      documents.add(fileId);
    }
    validateCaption(item.caption);
    if (i > 0 && item.caption !== undefined && item.caption !== "")
      fail("Only the first album item may have a caption.");
  }
}

/** Keep file downloads on the authenticated file route, without URL or path injection. */
export function validateFilePath(path: string): void {
  if (
    typeof path !== "string" ||
    !path ||
    path.length > 4096 ||
    path.startsWith("/") ||
    // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted input.
    /[\\\u0000-\u0020?#]/.test(path)
  )
    fail("Expected a relative LO file path.");
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    fail("Invalid file path encoding.");
  }
  if (
    // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted input.
    /[\\\u0000-\u0020?#%]/.test(decoded) ||
    decoded.startsWith("/") ||
    decoded.split("/").some((part) => !part || part === "." || part === "..") ||
    (/^[a-z][a-z0-9+.-]*:/i.test(decoded) &&
      !/^(?:photo:[1-9]\d{0,18}:[A-Za-z0-9_-]{1,32}|(?:file|voice|audio):[1-9]\d{0,18}|video:-?[1-9]\d{0,18}):[A-Za-z0-9_-]{22}$/.test(
        decoded,
      ))
  )
    fail("Expected a relative LO file path without traversal.");
}
