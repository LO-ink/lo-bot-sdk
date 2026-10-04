import test from "node:test";
import assert from "node:assert/strict";
import {
  createBotClient,
  retryRejected,
  RateLimited,
  Unavailable,
} from "../dist/index.js";

const upload = {
  data: new Uint8Array([1]),
  name: "fixture.mp4",
  mime: "video/mp4",
};
function fixture() {
  const calls = [];
  const bot = createBotClient({
    execute: async (operation, input) => {
      calls.push({ operation, input });
      return input;
    },
  });
  return { bot, calls };
}
test("video uploads carry metadata; cached videos reject upload-only metadata before transport", async () => {
  const { bot, calls } = fixture();
  await bot.sendVideo({
    conversationId: "42",
    video: upload,
    duration: 2,
    width: 640,
    height: 360,
    thumbnail: { data: new Uint8Array([2]), name: "poster.jpg" },
    supportsStreaming: true,
  });
  assert.equal(calls[0].input.width, 640);
  for (const field of ["duration", "width", "height", "thumbnail"]) {
    await assert.rejects(
      bot.sendVideo({
        conversationId: "42",
        video: { fileId: "fixture" },
        [field]: field === "thumbnail" ? upload : 1,
      }),
      { code: "invalid-input" },
    );
  }
  await bot.sendVideo({
    conversationId: "42",
    video: { fileId: "fixture" },
    supportsStreaming: false,
  });
  assert.equal(calls.length, 2);
});
test("video bounds, file thumbnails and audio reference-only semantics match LO", async () => {
  const { bot, calls } = fixture();
  for (const fields of [
    { duration: 86401 },
    { width: 16385 },
    { height: -1 },
    { duration: 1.5 },
    { thumbnail: { fileId: "poster" } },
    { supportsStreaming: "true" },
  ])
    await assert.rejects(
      bot.sendVideo({ conversationId: "42", video: upload, ...fields }),
      { code: "invalid-input" },
    );
  await assert.rejects(bot.sendAudio({ conversationId: "42", audio: upload }), {
    code: "invalid-input",
  });
  await bot.sendAudio({
    conversationId: "42",
    audio: { fileId: "audio-fixture" },
    caption: "Track",
  });
  assert.equal(calls.length, 1);
});
test("albums reject mixed media, size, later captions and unsupported fields before transport", async () => {
  const { bot, calls } = fixture();
  const item = { type: "photo", media: { fileId: "photo-fixture" } };
  for (const media of [
    [item],
    Array(11).fill(item),
    [item, { ...item, type: "video" }],
    [item, { ...item, type: "document" }],
    [item, { ...item, caption: "Second" }],
    [item, { ...item, has_spoiler: true }],
  ])
    await assert.rejects(bot.sendMediaGroup({ conversationId: "42", media }), {
      code: "invalid-input",
    });
  await bot.sendMediaGroup({
    conversationId: "42",
    media: [{ ...item, caption: "First" }, item],
  });
  assert.equal(calls.length, 1);
});
test("media and text edits accept inline keyboards, not reply keyboards", async () => {
  const { bot, calls } = fixture();
  const replyMarkup = { keyboard: [[{ text: "Open" }]] };
  await assert.rejects(
    bot.sendPhoto({
      conversationId: "42",
      photo: { fileId: "fixture" },
      replyMarkup,
    }),
    { code: "invalid-input" },
  );
  await assert.rejects(
    bot.editMessage({
      conversationId: "42",
      messageId: "1",
      text: "Text",
      replyMarkup,
    }),
    { code: "invalid-input" },
  );
  await bot.sendMessage({ conversationId: "42", text: "Text", replyMarkup });
  assert.equal(calls.length, 1);
});
test("downloads reject URL, traversal, encoded traversal and oversized budgets before transport", async () => {
  const { bot, calls } = fixture();
  for (const path of [
    "https://example.test/file",
    "../file",
    "a/../file",
    "%2e%2e/file",
    "%252e%252e/file",
    "/file",
    "file?token=x",
    "a\\file",
  ])
    await assert.rejects(bot.downloadFile({ path }), { code: "invalid-input" });
  await assert.rejects(
    bot.downloadFile({ path: "fixture", maxBytes: 52428801 }),
    { code: "invalid-input" },
  );
  await bot.getFile("fixture");
  await bot.downloadFile({ path: "files/fixture" });
  assert.equal(calls.length, 2);
});
test("text rejects empty whitespace and limits emoji by UTF-16", async () => {
  const { bot, calls } = fixture();
  for (const text of [" \n\t", "🌵".repeat(2049)])
    await assert.rejects(bot.sendMessage({ conversationId: "42", text }), {
      code: "invalid-input",
    });
  assert.equal(calls.length, 0);
});
test("retry helper retries exactly once only after a confirmed server refusal", async () => {
  let count = 0;
  assert.equal(
    await retryRejected(async () => {
      if (++count === 1)
        throw new RateLimited(0, 429, 429, { safeToRetry: true });
      return "ok";
    }),
    "ok",
  );
  assert.equal(count, 2);
  for (const error of [
    new RateLimited(0),
    new Unavailable(),
    new RateLimited(60, 429, 429, { safeToRetry: true }),
  ]) {
    count = 0;
    await assert.rejects(
      retryRejected(async () => {
        count++;
        throw error;
      }),
      (e) => e === error,
    );
    assert.equal(count, 1);
  }
  count = 0;
  await assert.rejects(
    retryRejected(async () => {
      count++;
      throw new RateLimited(0, 429, 429, { safeToRetry: true });
    }),
    RateLimited,
  );
  assert.equal(count, 2);
});
test("retry delay is cancellable without making another request", async () => {
  const controller = new AbortController();
  let count = 0;
  const pending = retryRejected(
    async () => {
      count++;
      throw new RateLimited(1, 429, 429, { safeToRetry: true });
    },
    { signal: controller.signal },
  );
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending, { code: "aborted" });
  assert.equal(count, 1);
});

test("invalid identifiers, signals and unknown file options stop before transport", async () => {
  const { bot, calls } = fixture();
  for (const conversationId of [
    "9223372036854775808",
    "-9223372036854775809",
    "1".repeat(10000),
  ])
    await assert.rejects(bot.sendMessage({ conversationId, text: "Fixture" }), {
      code: "invalid-input",
    });
  await assert.rejects(
    bot.downloadFile({ path: "fixture", signal: { aborted: false } }),
    { code: "invalid-input" },
  );
  await assert.rejects(
    bot.sendDocument({
      conversationId: "42",
      document: { fileId: "fixture", url: "https://example.test" },
    }),
    { code: "invalid-input" },
  );
  await assert.rejects(
    retryRejected(async () => 1, { signal: { aborted: false } }),
    { code: "invalid-input" },
  );
  assert.equal(calls.length, 0);
});

test("installation capability cache keeps unknown separate from disabled and permits explicit refresh", async () => {
  let calls = 0;
  const bot = createBotClient({
    execute: async () => ({
      id: "7",
      name: "Fixture",
      ...(++calls === 1 ? {} : { capabilities: { videoUploads: false } }),
    }),
  });
  assert.equal(await bot.getCapabilities(), undefined);
  assert.equal(await bot.getCapabilities(), undefined);
  assert.equal(calls, 1);
  assert.deepEqual(await bot.getCapabilities({ refresh: true }), {
    videoUploads: false,
  });
  const cached = await bot.getCapabilities();
  assert.equal(calls, 2);
  assert.throws(() => {
    cached.videoUploads = true;
  }, TypeError);
  await assert.rejects(bot.getCapabilities({ signal: { aborted: false } }), {
    code: "invalid-input",
  });
  const expired = createBotClient(
    {
      execute: async () => ({
        id: "7",
        name: "Fixture",
        capabilities: { videoUploads: ++calls % 2 === 0 },
      }),
    },
    { capabilitiesTtlMs: 0 },
  );
  const first = await expired.getCapabilities();
  const second = await expired.getCapabilities();
  assert.notEqual(first.videoUploads, second.videoUploads);
});

test("callback answers and reply keyboard removal validate before transport", async () => {
  const { bot, calls } = fixture();
  await bot.answerCallback({
    callbackId: "fixture-query",
    text: "Done",
    showAlert: false,
  });
  await bot.sendMessage({
    conversationId: "42",
    text: "Removed",
    replyMarkup: { removeKeyboard: true },
  });
  for (const input of [
    { callbackId: "" },
    { callbackId: "x", text: "a".repeat(201) },
    { callbackId: "x", showAlert: "true" },
  ])
    await assert.rejects(bot.answerCallback(input), { code: "invalid-input" });
  for (const replyMarkup of [
    { keyboard: [] },
    { keyboard: Array.from({ length: 13 }, () => [{ text: "x" }]) },
    { keyboard: [[{ text: "x" }]], selective: true },
    { removeKeyboard: true, keyboard: [] },
  ])
    await assert.rejects(
      bot.sendMessage({ conversationId: "42", text: "Fixture", replyMarkup }),
      { code: "invalid-input" },
    );
  assert.equal(calls.length, 2);
});
