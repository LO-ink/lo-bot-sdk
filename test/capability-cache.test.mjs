import test from "node:test";
import assert from "node:assert/strict";
import { createBotClient, Unavailable } from "../dist/index.js";

function fixture() {
  const requests = [];
  const bot = createBotClient({
    execute: () =>
      new Promise((resolve, reject) => requests.push({ resolve, reject })),
  });
  const identity = (enabled) => ({
    id: "7",
    name: "Fixture",
    ...(enabled === undefined
      ? {}
      : { capabilities: { videoUploads: enabled } }),
  });
  return { bot, requests, identity };
}

test("an older identity response cannot overwrite an explicit capability refresh", async () => {
  const { bot, requests, identity } = fixture();
  const old = bot.getIdentity();
  const refresh = bot.getCapabilities({ refresh: true });
  requests[1].resolve(identity(true));
  assert.deepEqual(await refresh, { videoUploads: true });
  requests[0].resolve(identity(false));
  assert.deepEqual((await old).capabilities, { videoUploads: false });
  assert.deepEqual(await bot.getCapabilities(), { videoUploads: true });
  assert.equal(requests.length, 2);
});

test("a latest response with unknown capabilities cannot be filled by an older response", async () => {
  const { bot, requests, identity } = fixture();
  const old = bot.getCapabilities();
  const refresh = bot.getCapabilities({ refresh: true });
  requests[1].resolve(identity(undefined));
  assert.equal(await refresh, undefined);
  requests[0].resolve(identity(true));
  assert.equal(await old, undefined);
  assert.equal(await bot.getCapabilities(), undefined);
  assert.equal(requests.length, 2);
});

test("a failed refresh preserves the established cache and fences older pending reads", async () => {
  const { bot, requests, identity } = fixture();
  const initial = bot.getCapabilities();
  requests[0].resolve(identity(true));
  await initial;
  const old = bot.getIdentity();
  const refresh = bot.getCapabilities({ refresh: true });
  requests[2].reject(new Unavailable("Fixture refusal"));
  await assert.rejects(refresh, Unavailable);
  requests[1].resolve(identity(false));
  await old;
  assert.deepEqual(await bot.getCapabilities(), { videoUploads: true });
  assert.equal(requests.length, 3);
});

test("an older failure and an aborted refresh's late success cannot invalidate a newer cache", async () => {
  const { bot, requests, identity } = fixture();
  const old = bot.getIdentity();
  const controller = new AbortController();
  const aborted = bot.getCapabilities({
    refresh: true,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(aborted, { code: "aborted" });
  const refresh = bot.getCapabilities({ refresh: true });
  requests[2].resolve(identity(true));
  await refresh;
  requests[0].reject(new Unavailable("Older failure"));
  await assert.rejects(old, Unavailable);
  requests[1].resolve(identity(false));
  await Promise.resolve();
  assert.deepEqual(await bot.getCapabilities(), { videoUploads: true });
  assert.equal(requests.length, 3);
});

test("a stale response cannot extend the current capability cache lifetime", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  const { bot, requests, identity } = fixture();
  const old = bot.getIdentity({ timeoutMs: 600_000 });
  const refresh = bot.getCapabilities({ refresh: true });
  requests[1].resolve(identity(true));
  await refresh;
  t.mock.timers.tick(299_000);
  requests[0].resolve(identity(false));
  await old;
  t.mock.timers.tick(1000);
  const expired = bot.getCapabilities();
  assert.equal(requests.length, 3);
  requests[2].resolve(identity(false));
  assert.deepEqual(await expired, { videoUploads: false });
});

test("an older cold-cache caller receives its own result while the newer read is pending", async () => {
  const { bot, requests, identity } = fixture();
  const old = bot.getCapabilities();
  const refresh = bot.getCapabilities();
  requests[0].resolve(identity(true));
  const own = await old;
  assert.deepEqual(own, { videoUploads: true });
  assert.equal(Object.isFrozen(own), true);
  requests[1].resolve(identity(false));
  assert.deepEqual(await refresh, { videoUploads: false });
  assert.deepEqual(await bot.getCapabilities(), { videoUploads: false });
  assert.equal(requests.length, 2);
});

test("invalid and pre-aborted identity reads do not steal pending cache ownership", async () => {
  const { bot, requests, identity } = fixture();
  const pending = bot.getCapabilities();
  for (const options of [null, [], { timeoutMs: 1.5 }, { signal: {} }]) {
    await assert.rejects(bot.getIdentity(options), { code: "invalid-input" });
  }
  await assert.rejects(bot.getIdentity({ signal: AbortSignal.abort() }), {
    code: "aborted",
  });
  assert.equal(requests.length, 1);
  requests[0].resolve(identity(true));
  assert.deepEqual(await pending, { videoUploads: true });
  assert.deepEqual(await bot.getCapabilities(), { videoUploads: true });
  assert.equal(requests.length, 1);
});

test("identity validation retains the timeout captured when the client was created", async () => {
  const options = { timeoutMs: 1000 };
  let calls = 0;
  const bot = createBotClient(
    {
      execute: async () => {
        calls++;
        return {
          id: "7",
          name: "Fixture",
          capabilities: { videoUploads: true },
        };
      },
    },
    options,
  );
  options.timeoutMs = 0;
  assert.deepEqual(await bot.getCapabilities(), { videoUploads: true });
  assert.equal(calls, 1);
});
