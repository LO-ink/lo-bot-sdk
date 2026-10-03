import test from "node:test";
import assert from "node:assert/strict";
import {
  createBotClient,
  BOT_SEND_LIMITS,
  RateLimited,
  NotAllowed,
  BadRequest,
  Unavailable,
  BotError,
} from "../dist/index.js";
test("new media operations preserve canonical inputs and request cancellation", async () => {
  const calls = [];
  const client = createBotClient({
    execute: async (operation, input, options) => {
      calls.push({ operation, input, options });
      return {
        id: "1",
        conversationId: input.conversationId,
        fileId: "lo-file",
      };
    },
  });
  for (const [operation, field] of [
    ["sendPhoto", "photo"],
    ["sendDocument", "document"],
    ["sendVoice", "voice"],
  ]) {
    const input = { conversationId: "42", [field]: { fileId: "lo-file" } };
    assert.equal((await client[operation](input)).fileId, "lo-file");
    assert.equal(calls.at(-1).operation, operation);
    assert.deepEqual(calls.at(-1).input, input);
    assert.ok(calls.at(-1).options.signal instanceof AbortSignal);
  }
});
test("typed errors preserve existing BotError categories and platform limits", () => {
  for (const error of [
    new RateLimited(7),
    new NotAllowed(),
    new BadRequest("wrong file identifier"),
    new Unavailable(),
  ])
    assert.ok(error instanceof BotError);
  assert.equal(new RateLimited(7).retryAfterSeconds, 7);
  assert.deepEqual(BOT_SEND_LIMITS, {
    botPerSecond: 30,
    chatPerSecond: 1,
    chatBurst: 5,
    groupPerMinute: 20,
  });
});

test("menu text accepts 64 Unicode code points and rejects the next one before transport", async () => {
  let calls = 0;
  const bot = createBotClient({
    execute: async () => {
      calls++;
      return true;
    },
  });
  await bot.setChatMenuButton({
    menuButton: {
      type: "web_app",
      text: "Я".repeat(64),
      web_app: { url: "https://app.example.test/" },
    },
  });
  await assert.rejects(
    bot.setChatMenuButton({
      menuButton: {
        type: "web_app",
        text: "Я".repeat(65),
        web_app: { url: "https://app.example.test/" },
      },
    }),
    (error) => error.code === "invalid-input",
  );
  assert.equal(calls, 1);
});

test("voice validation uses Blob MIME unless explicitly overridden, before transport", async () => {
  let calls = 0;
  const bot = createBotClient({
    execute: async () => {
      calls++;
      return { id: "1", conversationId: "42", fileId: "fixture" };
    },
  });
  for (const type of ["audio/ogg", "audio/opus", "application/octet-stream"]) {
    await assert.rejects(
      bot.sendVoice({
        conversationId: "42",
        voice: { data: new Blob(["fixture"], { type }), name: "voice.m4a" },
      }),
      (e) => e.code === "invalid-input",
    );
  }
  assert.equal(calls, 0);
  await bot.sendVoice({
    conversationId: "42",
    voice: {
      data: new Blob(["fixture"], { type: "audio/mp4" }),
      name: "voice.m4a",
    },
  });
  await bot.sendVoice({
    conversationId: "42",
    voice: {
      data: new Blob(["fixture"], { type: "application/octet-stream" }),
      name: "voice.aac",
      mime: "audio/aac",
    },
  });
  await bot.sendVoice({
    conversationId: "42",
    voice: { data: new Blob(["fixture"]), name: "voice.aac" },
  });
  assert.equal(calls, 3);
});
