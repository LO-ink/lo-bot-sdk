import test from "node:test";
import assert from "node:assert/strict";
import {
  createBotClient,
  createLoHttpBotTransport,
  decodeLoBotUpdate,
  parseLoBotWebhookUpdate,
} from "../dist/index.js";

const stored = {
  message_id: 7,
  date: 1,
  chat: { id: -42, type: "group" },
};
const target = { conversationId: "-42", messageId: "7" };
const empty = { inlineKeyboard: [] };
const signal = new AbortController().signal;
const decode = (message) =>
  decodeLoBotUpdate({ update_id: 1, message }).message;
const transport = (fetch) =>
  createLoHttpBotTransport({ token: "42:fixture", fetch });
const response = (result) => Response.json({ ok: true, result });

test("ordinary and callback messages expose only the server-provided author", () => {
  assert.equal(decode({ ...stored, text: "hello" }).senderId, undefined);
  for (const id of [1, "9007199254740993", "9223372036854775807"])
    assert.equal(decode({ ...stored, from: { id } }).senderId, String(id));
  const callback = decodeLoBotUpdate({
    update_id: 1,
    callback_query: {
      id: "query",
      from: { id: 5 },
      message: { ...stored, from: { id: 42 }, document: { file_id: "doc" } },
    },
  });
  assert.equal(callback.callback.userId, "5");
  assert.equal(callback.callback.message.senderId, "42");
  assert.equal(callback.callback.message.fileId, "doc");
});

test("webhook and poll bodies preserve unquoted int64 sender IDs", async () => {
  const body =
    '{"update_id":1,"message":{"message_id":7,"date":1,"chat":{"id":-42,"type":"group"},"from":{"id":9223372036854775807},"text":"hello"}}';
  assert.equal(
    parseLoBotWebhookUpdate(body).message.senderId,
    "9223372036854775807",
  );
  const bot = createBotClient(
    transport(async () => new Response('{"ok":true,"result":[' + body + "]}")),
  );
  assert.equal(
    (await bot.getUpdates())[0].message.senderId,
    "9223372036854775807",
  );
  assert.throws(
    () =>
      parseLoBotWebhookUpdate(
        body.replace("9223372036854775807", "9223372036854775808"),
      ),
    { code: "invalid-response" },
  );
});

test("present invalid authors fail decoding instead of becoming anonymous", () => {
  for (const from of [
    null,
    [],
    "42",
    {},
    ...[
      null,
      0,
      -1,
      1.5,
      9007199254740992,
      "0",
      "-1",
      "01",
      "+1",
      " 1",
      "1.0",
      "9223372036854775808",
      "1".repeat(100),
      "١",
    ].map((id) => ({ id })),
  ])
    assert.throws(() => decode({ ...stored, from }), {
      code: "invalid-response",
    });
});

test("keyboard edits preserve stored text and every supported media kind", async () => {
  const markup = { inlineKeyboard: [[{ text: "Done", callbackData: "done" }]] };
  for (const kind of ["text", "photo", "document", "voice", "video", "audio"]) {
    const fields =
      kind === "text"
        ? { text: "unchanged" }
        : {
            [kind]:
              kind === "photo"
                ? [{ file_id: "small" }, { file_id: "original" }]
                : { file_id: "original" },
            ...(kind !== "voice" ? { caption: "unchanged" } : {}),
          };
    let calls = 0;
    const bot = createBotClient(
      transport(async (url, request) => {
        calls++;
        assert.ok(url.endsWith("/editMessageReplyMarkup"));
        assert.deepEqual(JSON.parse(request.body), {
          chat_id: "-42",
          message_id: "7",
          reply_markup: {
            inline_keyboard: [[{ text: "Done", callback_data: "done" }]],
          },
        });
        return response({
          ...stored,
          ...fields,
          from: { id: "9223372036854775807" },
        });
      }),
    );
    assert.deepEqual(
      await bot.editReplyMarkup({ ...target, replyMarkup: markup }),
      {
        id: "7",
        conversationId: "-42",
        senderId: "9223372036854775807",
        ...(kind === "text"
          ? { text: "unchanged" }
          : {
              fileId: "original",
              mediaType: kind,
              ...(kind !== "voice" ? { caption: "unchanged" } : {}),
            }),
      },
    );
    assert.equal(calls, 1);
  }
});

test("empty keyboard removal is explicit and works with custom transports", async () => {
  const input = { ...target, replyMarkup: empty };
  const bot = createBotClient({
    async execute(operation, value) {
      assert.equal(operation, "editReplyMarkup");
      assert.deepEqual(value, input);
      return { id: "7", conversationId: "-42", text: "kept" };
    },
  });
  assert.equal((await bot.editReplyMarkup(input)).text, "kept");
  const http = createBotClient(
    transport(async (_url, request) => {
      assert.deepEqual(JSON.parse(request.body).reply_markup, {
        inline_keyboard: [],
      });
      return response({ ...stored, text: "kept" });
    }),
  );
  assert.equal((await http.editReplyMarkup(input)).text, "kept");
});

test("invalid keyboard edits never reach custom transport or HTTP", async () => {
  let calls = 0;
  const custom = createBotClient({
    async execute() {
      calls++;
    },
  });
  const http = transport(async () => {
    calls++;
    throw new Error("unexpected fetch");
  });
  const button = { text: "x", callbackData: "x" };
  const invalid = [
    null,
    undefined,
    {},
    ...[
      undefined,
      null,
      {},
      { removeKeyboard: true },
      { keyboard: [[{ text: "x" }]] },
      { inlineKeyboard: [[]] },
      { inlineKeyboard: [Array(9).fill(button)] },
      { inlineKeyboard: Array(101).fill([button]) },
      { inlineKeyboard: [[{ text: "x", callbackData: "я".repeat(33) }]] },
      {
        inlineKeyboard: [
          [{ text: "x", miniApp: { url: "https://example.test" } }],
        ],
      },
      { inlineKeyboard: [[{ text: "x".repeat(32769), callbackData: "x" }]] },
    ].map((replyMarkup) => ({ ...target, replyMarkup })),
    ...["0", "-1", "9223372036854775808", 7].map((messageId) => ({
      ...target,
      messageId,
      replyMarkup: empty,
    })),
    { ...target, conversationId: "0", replyMarkup: empty },
  ];
  for (const input of invalid) {
    await assert.rejects(custom.editReplyMarkup(input), {
      code: "invalid-input",
    });
    await assert.rejects(http.execute("editReplyMarkup", input, { signal }), {
      code: "invalid-input",
    });
  }
  assert.equal(calls, 0);
});

test("keyboard edit results require a stored message with matching target and valid content", async () => {
  for (const result of [
    true,
    { ...stored, message_id: 8 },
    { ...stored, chat: { id: 42, type: "private" } },
    { ...stored, from: null },
    { ...stored, text: 1 },
    { ...stored, caption: 1 },
    { ...stored, photo: [] },
    { ...stored, document: {} },
    { ...stored, photo: [{ file_id: "p" }], document: { file_id: "d" } },
  ]) {
    const bot = createBotClient(transport(async () => response(result)));
    await assert.rejects(
      bot.editReplyMarkup({ ...target, replyMarkup: empty }),
      { code: "invalid-response" },
    );
  }
});

test("keyboard edit failures are not retried implicitly", async () => {
  for (const status of [400, 429, 500]) {
    let calls = 0;
    const bot = createBotClient(
      transport(async () => {
        calls++;
        return Response.json(
          { ok: false, error_code: status, description: "refused" },
          { status },
        );
      }),
    );
    await assert.rejects(
      bot.editReplyMarkup({ ...target, replyMarkup: empty }),
    );
    assert.equal(calls, 1);
  }
});
