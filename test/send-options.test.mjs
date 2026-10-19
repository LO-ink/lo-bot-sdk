import test from "node:test";
import assert from "node:assert/strict";
import { createBotClient, createLoHttpBotTransport } from "../dist/index.js";

const token = "42:test-token";
const signal = new AbortController().signal;
const actions = [
  "typing",
  "choose_sticker",
  "find_location",
  "record_voice",
  "upload_voice",
  "record_video",
  "record_video_note",
  "upload_photo",
  "upload_video",
  "upload_document",
  "upload_video_note",
];
const sends = [
  ["sendMessage", { text: "Reply" }],
  ...["photo", "document", "video", "voice", "audio"].map((kind) => [
    "send" + kind[0].toUpperCase() + kind.slice(1),
    { [kind]: { fileId: "cached" } },
  ]),
  [
    "sendMediaGroup",
    {
      media: [
        { type: "photo", media: { fileId: "first" } },
        { type: "photo", media: { fileId: "second" } },
      ],
    },
  ],
];
function result(operation) {
  const message = { message_id: 5, date: 1, chat: { id: 42, type: "private" } };
  if (operation === "sendMessage") return { ...message, text: "Reply" };
  if (operation === "sendMediaGroup")
    return [1, 2].map((i) => ({
      ...message,
      photo: [{ file_id: "photo-" + i }],
    }));
  const kind = operation.slice(4).toLowerCase();
  return {
    ...message,
    [kind]: kind === "photo" ? [{ file_id: "file" }] : { file_id: "file" },
  };
}

test("all send operations preserve canonical options for injected transports", async () => {
  const calls = [];
  const bot = createBotClient({
    async execute(operation, input) {
      calls.push([operation, input]);
    },
  });
  const options = {
    replyToMessageId: "2147483647",
    allowSendingWithoutReply: false,
    disableNotification: true,
  };
  for (const [operation, fields] of sends)
    await bot[operation]({ conversationId: "42", ...fields, ...options });
  assert.equal(calls.length, sends.length);
  for (const [, input] of calls)
    for (const [key, value] of Object.entries(options))
      assert.equal(input[key], value);
});

test("all send options refuse invalid values before client transport or direct HTTP", async () => {
  let calls = 0;
  const transport = createLoHttpBotTransport({
    token,
    fetch: async () => {
      calls++;
      throw new Error("unexpected fetch");
    },
  });
  const bot = createBotClient({
    async execute() {
      calls++;
    },
  });
  const invalid = [
    ...[
      "0",
      "-1",
      "2147483648",
      "9007199254740993",
      "01",
      "+1",
      " 1",
      "1.0",
      "١",
      "1_0",
      "",
      1,
      null,
    ].map((replyToMessageId) => ({ replyToMessageId })),
    ...["false", 0, null].flatMap((value) => [
      { disableNotification: value },
      { allowSendingWithoutReply: value },
    ]),
  ];
  for (const [operation, fields] of sends)
    for (const options of invalid) {
      const input = { conversationId: "42", ...fields, ...options };
      await assert.rejects(bot[operation](input), { code: "invalid-input" });
      await assert.rejects(transport.execute(operation, input, { signal }), {
        code: "invalid-input",
      });
    }
  assert.equal(calls, 0);
});

test("JSON sends use one reply representation and preserve explicit false options", async () => {
  const requests = [];
  const bot = createBotClient(
    createLoHttpBotTransport({
      token,
      fetch: async (url, request) => {
        const operation = url.split("/").at(-1);
        requests.push(JSON.parse(request.body));
        return Response.json({ ok: true, result: result(operation) });
      },
    }),
  );
  for (const [operation, fields] of sends) {
    await bot[operation]({
      conversationId: "42",
      ...fields,
      replyToMessageId: "2147483647",
      allowSendingWithoutReply: false,
      disableNotification: false,
    });
    const body = requests.at(-1);
    assert.deepEqual(body.reply_parameters, {
      message_id: 2147483647,
      allow_sending_without_reply: false,
    });
    assert.equal(body.disable_notification, false);
    assert.equal(Object.hasOwn(body, "reply_to_message_id"), false);
    assert.equal(Object.hasOwn(body, "allow_sending_without_reply"), false);
  }
  await bot.sendMessage({
    conversationId: "42",
    text: "Reply",
    replyToMessageId: "1",
  });
  assert.deepEqual(requests.at(-1).reply_parameters, { message_id: 1 });
  assert.equal(Object.hasOwn(requests.at(-1), "disable_notification"), false);
  await bot.sendMessage({
    conversationId: "42",
    text: "Reply",
    allowSendingWithoutReply: true,
  });
  assert.deepEqual(requests.at(-1), { chat_id: "42", text: "Reply" });
});

test("multipart uploads and mixed upload/file-ID albums retain reply and silent fields", async () => {
  const forms = [];
  const bot = createBotClient(
    createLoHttpBotTransport({
      token,
      fetch: async (url, request) => {
        const operation = url.split("/").at(-1);
        forms.push(request.body);
        return Response.json({ ok: true, result: result(operation) });
      },
    }),
  );
  const options = {
    conversationId: "42",
    replyToMessageId: "1",
    allowSendingWithoutReply: true,
    disableNotification: true,
  };
  for (const [kind, name] of [
    ["photo", "file.jpg"],
    ["document", "file.txt"],
    ["video", "file.mp4"],
    ["voice", "file.aac"],
  ]) {
    await bot["send" + kind[0].toUpperCase() + kind.slice(1)]({
      ...options,
      [kind]: { data: new Uint8Array([1]), name },
    });
    assert.equal(forms.at(-1).get(kind).name, name);
  }
  await bot.sendMediaGroup({
    ...options,
    media: [
      {
        type: "photo",
        media: { data: new Uint8Array([1]), name: "first.jpg" },
      },
      { type: "photo", media: { fileId: "second" } },
    ],
  });
  assert.deepEqual(JSON.parse(forms.at(-1).get("media")), [
    { type: "photo", media: "attach://media_0" },
    { type: "photo", media: "second" },
  ]);
  for (const form of forms) {
    assert.ok(form instanceof FormData);
    assert.deepEqual(JSON.parse(form.get("reply_parameters")), {
      message_id: 1,
      allow_sending_without_reply: true,
    });
    assert.equal(form.get("disable_notification"), "true");
    assert.equal(form.has("reply_to_message_id"), false);
  }
});

test("chat actions use all eleven server actions and require true responses", async () => {
  let calls = 0;
  const bot = createBotClient(
    createLoHttpBotTransport({
      token,
      fetch: async (url, request) => {
        assert.ok(url.endsWith("/sendChatAction"));
        assert.deepEqual(JSON.parse(request.body), {
          chat_id: "-42",
          action: actions[calls++],
        });
        return Response.json({ ok: true, result: true });
      },
    }),
  );
  for (const action of actions)
    assert.equal(
      await bot.sendChatAction({ conversationId: "-42", action }),
      true,
    );
  assert.equal(calls, 11);
  for (const response of [false, "true", {}, null]) {
    const invalid = createBotClient(
      createLoHttpBotTransport({
        token,
        fetch: async () => Response.json({ ok: true, result: response }),
      }),
    );
    await assert.rejects(
      invalid.sendChatAction({ conversationId: "42", action: "typing" }),
      { code: "invalid-response" },
    );
  }
});

test("chat action validation applies to injected clients and direct HTTP without sends", async () => {
  let calls = 0;
  const client = createBotClient({
    async execute() {
      calls++;
      return true;
    },
  });
  const transport = createLoHttpBotTransport({
    token,
    fetch: async () => {
      calls++;
      return Response.json({ ok: true, result: true });
    },
  });
  const invalid = [
    undefined,
    null,
    ...["", "unknown", "Typing", "typing ", null, 1].map((action) => ({
      conversationId: "42",
      action,
    })),
    ...["0", "01", "9223372036854775808", "-9223372036854775809", 42, null].map(
      (conversationId) => ({ conversationId, action: "typing" }),
    ),
  ];
  for (const input of invalid) {
    await assert.rejects(client.sendChatAction(input), {
      code: "invalid-input",
    });
    await assert.rejects(
      transport.execute("sendChatAction", input, { signal }),
      { code: "invalid-input" },
    );
  }
  assert.equal(calls, 0);
});
