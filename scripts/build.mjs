import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/typescript/bin/tsc", import.meta.url),
    ),
  ],
  { cwd: new URL("../", import.meta.url), stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
