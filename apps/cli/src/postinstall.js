#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const isCi = Boolean(process.env.CI);
const isSilent = ["silent", "error"].includes((process.env.npm_config_loglevel || "").toLowerCase());
const projectRoot = process.env.INIT_CWD || process.cwd();
const cliPath = join(dirname(fileURLToPath(import.meta.url)), "index.js");
const canPrompt = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const template = process.env.CORTEXA_TEMPLATE || "auto";
const editors = process.env.CORTEXA_EDITORS || "codex";

if (isCi || isSilent) {
  process.exit(0);
}

console.log("\nCortexa CLI installed.");

function runSetup(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    stdio: "inherit"
  });
}

if (canPrompt) {
  console.log("\nStarting guided setup. Press Ctrl+C to skip.\n");
  const result = runSetup(["setup", "--interactive"]);

  if (result.status === 0) {
    process.exit(0);
  }

  if (result.signal) {
    console.log("\nGuided setup skipped. You can run it again later:");
    printManualSetup();
    process.exit(0);
  }

  console.log("\nGuided setup did not complete. Falling back to the default setup.");
} else {
  console.log("\nThis npm run does not provide an interactive terminal.");
  console.log(`Running default setup instead: template=${template}, editors=${editors}`);
}

const fallback = runSetup(["setup", "--template", template, "--editors", editors]);
if (fallback.status === 0) {
  process.exit(0);
}

console.log("\nAutomatic setup did not complete. You can run it manually:");
printManualSetup();

function printManualSetup() {
  console.log(`
  npx --no-install ctx setup --interactive

For a quick frontend setup:

  npx --no-install ctx setup --template frontend --editors codex

If you want prompts during npm install, run npm with foreground scripts:

  npm install --save-dev @cortexa-labs/cli --foreground-scripts

Project detected: ${projectRoot}
`);
}
