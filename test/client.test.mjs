import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBotClient, BotError } from '../dist/index.js';

test('sends canonical operations with exact identifiers', async () => {
  let captured;
  const client = createBotClient({ async execute(...args) { captured = args; return { id: '2', conversationId: args[1].conversationId, text: args[1].text }; } });
  const sent = await client.sendMessage({ conversationId: '9007199254740993', text: 'Hello' });
  assert.equal(sent.conversationId, '9007199254740993');
  assert.equal(captured[0], 'sendMessage');
  assert.ok(captured[2].signal instanceof AbortSignal);
});
test('mutation failures are not retried and unknown failures do not leak credentials', async () => {
  let count = 0;
  const client = createBotClient({ async execute() { count++; throw new Error('secret token'); } });
  await assert.rejects(client.sendMessage({ conversationId: '1', text: 'Hello' }), e => e.code === 'transport' && !e.message.includes('secret'));
  assert.equal(count, 1);
});
test('falsy transport rejections remain failures', async () => {
  for (const error of [undefined, null, false, 0, '']) {
    const client = createBotClient({ execute() { return Promise.reject(error); } });
    await assert.rejects(client.getIdentity(), e => e.code === 'transport');
  }
});
test('timeout aborts transport and ignores late settlement', async () => {
  let signal; let complete;
  const client = createBotClient({ execute(_operation, _input, options) { signal = options.signal; return new Promise(resolve => { complete = resolve; }); } }, { timeoutMs: 5 });
  await assert.rejects(client.getIdentity(), e => e.code === 'timeout');
  assert.equal(signal.aborted, true);
  complete({ id: '1', name: 'Bot' });
});
test('cancelled requests never reach transport', async () => {
  const controller = new AbortController(); controller.abort();
  const client = createBotClient({ execute() { assert.fail('must not run'); } });
  await assert.rejects(client.getIdentity({ signal: controller.signal }), e => e.code === 'aborted');
});
test('in-flight cancellation aborts transport once and preserves typed server failures', async () => {
  const controller = new AbortController(); let signal;
  const client = createBotClient({ execute(_op, _input, options) { signal = options.signal; return new Promise(() => {}); } });
  const pending = client.getIdentity({ signal: controller.signal }); controller.abort();
  await assert.rejects(pending, e => e.code === 'aborted'); assert.equal(signal.aborted, true);
  const limited = createBotClient({ async execute() { throw new BotError('rate-limited', 'Rate limited.', 5); } });
  await assert.rejects(limited.getIdentity(), e => e.retryAfterSeconds === 5);
});
test('invalid message and command data never reaches transport', () => {
  const client = createBotClient({ execute() { assert.fail('must not run'); } });
  assert.throws(() => client.sendMessage({ conversationId: '0', text: 'Hello' }), e => e.code === 'invalid-input');
  assert.throws(() => client.sendMessage({ conversationId: '1', text: '' }), e => e.code === 'invalid-input');
  assert.throws(() => client.setCommands([{ name: 'start', description: 'Start' }, { name: 'start', description: 'Again' }]), e => e.code === 'invalid-input');
  assert.throws(() => client.getUpdates({ waitSeconds: 31 }), e => e.code === 'invalid-input');
});
