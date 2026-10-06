import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
test("native bot SDK owns LO values and isolates HTTP wire codecs", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  );
  for (const field of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
  ])
    assert.deepEqual(Object.keys(manifest[field] ?? {}), []);
  for (const directory of ["src", "dist"]) {
    for (const file of readdirSync(resolve(root, directory), {
      recursive: true,
    })) {
      if (!/\.(ts|js)$/.test(file)) continue;
      const body = readFileSync(resolve(root, directory, file), "utf8");
      assert.doesNotMatch(body, /telegram|tgweb|vk\.com|t\.me\//i, file);
      if (!file.startsWith("http/"))
        assert.doesNotMatch(
          body,
          /inline_keyboard|callback_data|web_app/i,
          file,
        );
      assert.doesNotMatch(body, /from ["']@lo-ink\//, file);
      if (file.startsWith("http/"))
        assert.doesNotMatch(body, /from ["']\.\.\/index\.js/, file);
    }
  }
  assert.doesNotMatch(
    readFileSync(resolve(root, "README.md"), "utf8"),
    /telegram|vk\.com|t\.me\/|no-AI/i,
  );
});
