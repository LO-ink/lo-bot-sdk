import {
  mkdtemp,
  cp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "lo-bot-package-"));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
try {
  const source = join(temp, "source");
  const consumer = join(temp, "consumer");
  await mkdir(source);
  await mkdir(consumer);
  for (const file of [
    "src",
    "scripts",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "LICENSE",
    "README.md",
  ]) {
    await cp(join(root, file), join(source, file), { recursive: true });
  }
  // Build dependencies are shared; source deliberately has no dist directory.
  await symlink(
    join(root, "node_modules"),
    join(source, "node_modules"),
    "dir",
  );
  const packed = JSON.parse(
    run("npm", ["pack", "--json", "--cache", join(temp, "cache")], source),
  )[0];
  assert.equal(packed.name, "@lo-ink/bot-sdk");
  assert.equal(
    packed.version,
    JSON.parse(await readFile(join(root, "package.json"), "utf8")).version,
  );
  assert.ok(packed.files.some((file) => file.path === "dist/index.js"));
  assert.ok(packed.files.some((file) => file.path === "dist/index.d.ts"));
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--cache",
      join(temp, "cache"),
      join(source, packed.filename),
    ],
    consumer,
  );
  const name = JSON.parse(
    await readFile(join(source, "package.json"), "utf8"),
  ).name;
  assert.equal(name, "@lo-ink/bot-sdk");
  await writeFile(
    join(consumer, "check.mjs"),
    `import { createBotClient, createLoBotClient } from '${name}';\nconst client = createBotClient({async execute() { return {id: '1', name: 'Example'}; }});\nconst native = createLoBotClient({ token: '42:test-token', fetch: async () => Response.json({ ok: true, result: {id: 42, is_bot: true, first_name: 'Example', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false} }) });\nif ((await native.getIdentity()).id !== '42') throw new Error('Native package import failed');\nif ((await client.getIdentity()).id !== '1') throw new Error('Package import failed');\n`,
  );
  run(process.execPath, ["check.mjs"], consumer);
  await writeFile(
    join(consumer, "check.ts"),
    `import { createLoBotClient, createLoSecretaryClient, createBotClient, type BotTransport, type Message, createSecretaryClient, type SecretaryTransport, type SecretaryContext } from '${name}';\ndeclare const transport: BotTransport;\nconst message: Promise<Message> = createBotClient(transport).sendMessage({conversationId:'1', text:'Hello'});\nvoid message;\nconst native = createLoBotClient({token:'42:test-token'});\nvoid native;\nconst nativeSecretary = createLoSecretaryClient({token:'42:test-token'});\nvoid nativeSecretary;\ndeclare const secretaryTransport: SecretaryTransport;\ndeclare const context: SecretaryContext;\nconst secretaryReply: Promise<Message> = createSecretaryClient(secretaryTransport).sendText({connectionId:'e8b392e9-4ddc-4992-a235-d9f36cd892fc', context, requestId:'stable-request-id', text:'Answer'});\nvoid secretaryReply;\n`,
  );
  await writeFile(
    join(consumer, "check.ts"),
    `${await readFile(join(consumer, "check.ts"), "utf8")}
// @ts-expect-error Native proposal receipts are retired in SDK 0.6.
import type { SecretaryDraft } from '${name}';
import type { SecretaryOperations } from '${name}';
const secretary = createSecretaryClient(secretaryTransport);
// @ts-expect-error No native proposal method or implicit send fallback.
void secretary.proposeDraft;
// @ts-expect-error The removed operation is not part of the transport contract.
const retiredOperation: keyof SecretaryOperations = 'proposeDraft';
void retiredOperation;
`,
  );
  await writeFile(
    join(consumer, "check.ts"),
    `${await readFile(join(consumer, "check.ts"), "utf8")}
import type { SendOptions, ChatAction, BotOperations } from '${name}';
const sendOptions: SendOptions = {replyToMessageId: '2147483647', allowSendingWithoutReply: false, disableNotification: true};
const action: ChatAction = 'upload_video_note';
const activity: Promise<boolean> = native.sendChatAction({conversationId:'1', action});
void activity;
void native.sendMessage({conversationId:'1', text:'Reply', ...sendOptions});
void native.sendPhoto({conversationId:'1', photo:{fileId:'photo'}, ...sendOptions});
void native.sendDocument({conversationId:'1', document:{fileId:'doc'}, ...sendOptions});
void native.sendVoice({conversationId:'1', voice:{fileId:'voice'}, ...sendOptions});
void native.sendVideo({conversationId:'1', video:{fileId:'video'}, ...sendOptions});
void native.sendAudio({conversationId:'1', audio:{fileId:'audio'}, ...sendOptions});
void native.sendMediaGroup({conversationId:'1', media:[{type:'photo',media:{fileId:'one'}},{type:'photo',media:{fileId:'two'}}], ...sendOptions});
const operations: Record<keyof BotOperations, true> = {
  getIdentity:true, answerCallback:true, sendChatAction:true, sendMessage:true,
  editMessage:true, deleteMessage:true, sendPhoto:true, sendDocument:true,
  sendVoice:true, sendVideo:true, sendAudio:true, sendMediaGroup:true, getFile:true,
  downloadFile:true, setChatMenuButton:true, getCommands:true, setCommands:true,
  getUpdates:true,
};
const customTransport: BotTransport = {async execute(operation, input) {
  void operations[operation]; void input; throw new Error('fixture');
}};
void createBotClient(customTransport).sendChatAction({conversationId:'1', action:'typing'});
// @ts-expect-error IDs stay decimal strings in the public API.
const numericReply: SendOptions = {replyToMessageId: 1};
// @ts-expect-error Unsupported chat actions cannot be sent.
void native.sendChatAction({conversationId:'1', action:'unknown'});
// @ts-expect-error Ordinary replies have no quote options.
const quotedReply: SendOptions = {replyToMessageId:'1', quote:'fragment'};
// @ts-expect-error Ordinary replies stay in their target conversation.
const crossChatReply: SendOptions = {replyToMessageId:'1', replyChatId:'2'};
void numericReply; void quotedReply; void crossChatReply;
`,
  );
  for (const resolution of ["NodeNext", "Bundler"]) {
    run(
      process.execPath,
      [
        join(root, "node_modules/typescript/bin/tsc"),
        "--noEmit",
        "--strict",
        "--target",
        "ES2022",
        "--module",
        resolution === "NodeNext" ? "NodeNext" : "ESNext",
        "--moduleResolution",
        resolution,
        "check.ts",
      ],
      consumer,
    );
  }
  console.log("Clean tarball: ESM import and NodeNext/Bundler types pass.");
} finally {
  await rm(temp, { recursive: true, force: true });
}
