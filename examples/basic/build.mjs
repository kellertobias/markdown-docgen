import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const result = spawnSync(
  process.execPath,
  [
    path.resolve(directory, "../../dist/cli.js"),
    "build",
    "--source",
    path.join(directory, "docs"),
    "--config",
    path.join(directory, "manual.config.json"),
    "--allowed-env-vars",
    "EXAMPLE_VERSION",
  ],
  {
    env: { ...process.env, EXAMPLE_VERSION: process.env.EXAMPLE_VERSION ?? "0.1.0-example" },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
