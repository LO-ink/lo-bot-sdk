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
  await writeFile(
    join(consumer, "check.mjs"),
    `import { createBotClient } from '${name}';\nconst client = createBotClient({async execute() { return {id: '1', name: 'Example'}; }});\nif ((await client.getIdentity()).id !== '1') throw new Error('Package import failed');\n`,
  );
  run(process.execPath, ["check.mjs"], consumer);
  await writeFile(
    join(consumer, "check.ts"),
    `import { createBotClient, type BotTransport, type Message } from '${name}';\ndeclare const transport: BotTransport;\nconst message: Promise<Message> = createBotClient(transport).sendMessage({conversationId:'1', text:'Hello'});\nvoid message;\n`,
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
