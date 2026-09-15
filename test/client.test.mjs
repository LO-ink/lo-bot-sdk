import { test } from "node:test";
import assert from "node:assert/strict";
import { createBotClient, BotError } from "../dist/index.js";

test("sends canonical operations with exact identifiers", async () => {
  let captured;
  const client = createBotClient({
    async execute(...args) {
      captured = args;
      return {
        id: "2",
        conversationId: args[1].conversationId,
        text: args[1].text,
      };
    },
  });
  const sent = await client.sendMessage({
    conversationId: "9007199254740993",
    text: "Hello",
  });
  assert.equal(sent.conversationId, "9007199254740993");
  assert.equal(captured[0], "sendMessage");
  assert.ok(captured[2].signal instanceof AbortSignal);
});
test("mutation failures are not retried and unknown failures do not leak credentials", async () => {
  let count = 0;
  const client = createBotClient({
    async execute() {
      count++;
      throw new Error("secret token");
    },
  });
  await assert.rejects(
    client.sendMessage({ conversationId: "1", text: "Hello" }),
    (e) => e.code === "transport" && !e.message.includes("secret"),
  );
  assert.equal(count, 1);
});
test("falsy transport rejections remain failures", async () => {
  for (const error of [undefined, null, false, 0, ""]) {
    const client = createBotClient({
      execute() {
        return Promise.reject(error);
      },
    });
    await assert.rejects(client.getIdentity(), (e) => e.code === "transport");
  }
});
test("timeout aborts transport and ignores late settlement", async () => {
  let signal;
  let complete;
  const client = createBotClient(
    {
      execute(_operation, _input, options) {
        signal = options.signal;
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    },
    { timeoutMs: 5 },
  );
  await assert.rejects(client.getIdentity(), (e) => e.code === "timeout");
  assert.equal(signal.aborted, true);
  complete({ id: "1", name: "Bot" });
});
test("cancelled requests never reach transport", async () => {
  const controller = new AbortController();
  controller.abort();
  const client = createBotClient({
    execute() {
      assert.fail("must not run");
    },
  });
  await assert.rejects(
    client.getIdentity({ signal: controller.signal }),
    (e) => e.code === "aborted",
  );
});
test("in-flight cancellation aborts transport once and preserves typed server failures", async () => {
  const controller = new AbortController();
  let signal;
  const client = createBotClient({
    execute(_op, _input, options) {
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  const pending = client.getIdentity({ signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (e) => e.code === "aborted");
  assert.equal(signal.aborted, true);
  const limited = createBotClient({
    async execute() {
      throw new BotError("rate-limited", "Rate limited.", 5);
    },
  });
  await assert.rejects(limited.getIdentity(), (e) => e.retryAfterSeconds === 5);
});
test("invalid message and command data reject without reaching transport", async () => {
  const client = createBotClient({
    execute() {
      assert.fail("must not run");
    },
  });
  for (const request of [
    () => client.sendMessage({ conversationId: "0", text: "Hello" }),
    () => client.sendMessage({ conversationId: "1", text: "" }),
    () =>
      client.setCommands([
        { name: "start", description: "Start" },
        { name: "start", description: "Again" },
      ]),
    () => client.getUpdates({ waitSeconds: 31 }),
    () => client.getUpdates({ offset: 12 }),
    () => client.sendMessage(undefined),
    () => client.editMessage(null),
    () => client.deleteMessage({ conversationId: "1", messageId: "-1" }),
    () => client.getUpdates(null),
    () => client.setCommands([null]),
    () => client.setCommands([{ name: 123, description: "Start" }]),
  ]) {
    let pending;
    assert.doesNotThrow(() => {
      pending = request();
    });
    await assert.rejects(
      pending,
      (e) => e instanceof BotError && e.code === "invalid-input",
    );
  }
});
test("deadlines are bounded integers without timer overflow", async () => {
  const transport = {
    async execute() {
      return { id: "1", name: "Bot" };
    },
  };
  for (const timeoutMs of [
    0,
    -1,
    0.5,
    2147483648,
    Number.MAX_VALUE,
    NaN,
    Infinity,
  ]) {
    assert.throws(
      () => createBotClient(transport, { timeoutMs }),
      (e) => e.code === "invalid-input",
    );
    await assert.rejects(
      createBotClient(transport).getIdentity({ timeoutMs }),
      (e) => e.code === "invalid-input",
    );
  }
  assert.equal(
    (await createBotClient(transport, { timeoutMs: 2147483647 }).getIdentity())
      .id,
    "1",
  );
});

test("invalid cancellation signals reject before reaching transport", async () => {
  const client = createBotClient({
    execute() {
      assert.fail("must not run");
    },
  });
  for (const signal of [
    null,
    {},
    true,
    { aborted: false },
    { aborted: "false", addEventListener() {}, removeEventListener() {} },
  ]) {
    await assert.rejects(
      client.getIdentity({ signal }),
      (error) => error instanceof BotError && error.code === "invalid-input",
    );
  }
});
test("text limits count Unicode code points", async () => {
  const client = createBotClient({
    async execute(_operation, input) {
      return input;
    },
  });
  const valid = "🌵".repeat(4096);
  assert.equal(
    (await client.sendMessage({ conversationId: "1", text: valid })).text,
    valid,
  );
  await assert.rejects(
    client.sendMessage({ conversationId: "1", text: valid + "x" }),
    (e) => e.code === "invalid-input",
  );
  await client.setCommands([{ name: "start", description: "🌵".repeat(256) }]);
  await assert.rejects(
    client.setCommands([{ name: "start", description: "🌵".repeat(257) }]),
    (e) => e.code === "invalid-input",
  );
});

test("caller option changes cannot detach cancellation from the original signal", async () => {
  const controller = new AbortController();
  let removed = 0;
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.removeEventListener = (...args) => {
    removed++;
    remove(...args);
  };
  let resolve;
  const client = createBotClient({
    execute: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  const options = { signal: controller.signal };
  const pending = client.getIdentity(options);
  options.signal = {
    removeEventListener() {
      throw new Error("reused options");
    },
  };
  resolve({ id: "1", name: "Bot" });
  assert.equal((await pending).id, "1");
  assert.equal(removed, 1);
});

test("listener cleanup failure cannot leave the request pending", async () => {
  const controller = new AbortController();
  controller.signal.removeEventListener = () => {
    throw new Error("cleanup");
  };
  const client = createBotClient({
    async execute() {
      return { id: "1", name: "Bot" };
    },
  });
  assert.equal(
    (await client.getIdentity({ signal: controller.signal })).id,
    "1",
  );
});
