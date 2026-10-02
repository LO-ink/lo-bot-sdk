import { test } from "node:test";
import assert from "node:assert/strict";
import { createSecretaryClient, BotError } from "../dist/index.js";

const input = {
  connectionId: "e8b392e9-4ddc-4992-a235-d9f36cd892fc",
  requestId: "stable-reply-0001",
  context: {
    conversationId: "8",
    chatId: "22",
    policyVersion: "9007199254740993",
    sourceMessageId: "9007199254740995",
    sourceRevision: "2",
  },
  text: "Thank you",
};
test("draft proposals preserve the scoped key and reject unknown reasons or excessive UTF-16 text before transport", async () => {
  const calls = [];
  const client = createSecretaryClient({
    async executeSecretary(operation, value) {
      calls.push([operation, value]);
      return { id: "11111111-1111-4111-8111-111111111111", state: "draft" };
    },
  });
  await client.proposeDraft({ ...input, reason: "manual_review" });
  assert.equal(calls[0][0], "proposeDraft");
  assert.equal(calls[0][1].requestId, input.requestId);
  for (const change of [
    { reason: "auto" },
    { text: "😀".repeat(2049) },
    { requestId: "short" },
  ])
    await assert.rejects(
      client.proposeDraft({ ...input, reason: "template", ...change }),
      (error) => error.code === "invalid-input",
    );
  assert.equal(calls.length, 1);
});
test("secretary extension preserves exact version and stable keys without retrying unknown outcomes", async () => {
  const calls = [];
  const client = createSecretaryClient({
    async executeSecretary(...args) {
      calls.push(args);
      if (calls.length === 1) throw new BotError("unavailable", "Unavailable");
      return { id: "90", conversationId: "22", text: "Thank you" };
    },
  });
  await assert.rejects(
    client.sendText(input),
    (error) => error.code === "unavailable",
  );
  assert.equal(calls.length, 1);
  await client.sendText(input);
  assert.equal(calls[0][0], "sendText");
  assert.deepEqual(calls[0][1], calls[1][1]);
  assert.equal(calls[1][1].context.policyVersion, "9007199254740993");
  assert.ok(calls[1][2].signal instanceof AbortSignal);
});
test("invalid or unsafe delegation context is rejected before transport", async () => {
  let calls = 0;
  const client = createSecretaryClient({
    async executeSecretary() {
      calls++;
    },
  });
  for (const change of [
    { connectionId: "22" },
    { requestId: "short" },
    { context: { ...input.context, policyVersion: "1e3" } },
    { context: { ...input.context, sourceMessageId: "9223372036854775808" } },
    { context: { ...input.context, conversationId: "2147483648" } },
    { context: { ...input.context, chatId: "1000000000000000" } },
  ])
    await assert.rejects(
      client.sendText({ ...input, ...change }),
      (error) => error.code === "invalid-input",
    );
  assert.equal(calls, 0);
});
test("mark-read and delete-all are independent explicit operations", async () => {
  const calls = [];
  const client = createSecretaryClient({
    async executeSecretary(operation, value) {
      calls.push([operation, value]);
      return true;
    },
  });
  const action = {
    connectionId: input.connectionId,
    context: input.context,
    requestId: input.requestId,
  };
  await client.markRead(action);
  await client.deleteMessages({
    ...action,
    messageIds: ["90"],
    deleteAll: true,
  });
  assert.deepEqual(
    calls.map(([operation]) => operation),
    ["markRead", "deleteMessages"],
  );
  assert.equal(calls[1][1].deleteAll, true);
  await assert.rejects(
    client.deleteMessages({ ...action, messageIds: ["90", "90"] }),
    (error) => error.code === "invalid-input",
  );
  assert.equal(calls.length, 2);
});
test("secretary extension applies cancellation and sanitized deadline errors", async () => {
  let signal;
  const client = createSecretaryClient(
    {
      async executeSecretary(_operation, _input, options) {
        signal = options.signal;
        return new Promise(() => {});
      },
    },
    { timeoutMs: 5 },
  );
  await assert.rejects(
    client.sendText(input),
    (error) => error.code === "timeout",
  );
  assert.equal(signal.aborted, true);
});

test("selected quotes preserve UTF-16 offsets and reject malformed fragments before transport", async () => {
  const calls = [];
  const client = createSecretaryClient({
    async executeSecretary(op, value) {
      calls.push([op, value]);
      return {};
    },
  });
  const quote = { text: "question", offsetUtf16: 3 };
  await client.sendText({ ...input, quote });
  assert.deepEqual(calls[0][1].quote, quote);
  for (const selected of [
    null,
    { text: "question", offsetUtf16: -1 },
    { text: "question", offsetUtf16: 1.5 },
    { text: "😀".repeat(513), offsetUtf16: 0 },
  ]) {
    await assert.rejects(
      client.sendText({ ...input, quote: selected }),
      (error) => error.code === "invalid-input",
    );
  }
  assert.equal(calls.length, 1);
});

test("media extension accepts only bounded scoped references and captions before transport", async () => {
  const calls = [];
  const client = createSecretaryClient({
    async executeSecretary(op, value) {
      calls.push([op, value]);
      return {};
    },
  });
  const file = "secretary-v1:abc:" + "x".repeat(22);
  await client.sendMedia({ ...input, fileIds: [file], caption: "caption" });
  assert.equal(calls[0][0], "sendMedia");
  for (const change of [
    { fileIds: [] },
    { fileIds: [file, file] },
    { fileIds: ["https://storage.example/file"] },
    { caption: "😀".repeat(513) },
  ]) {
    await assert.rejects(
      client.sendMedia({ ...input, fileIds: [file], ...change }),
      (error) => error.code === "invalid-input",
    );
  }
  assert.equal(calls.length, 1);
});
