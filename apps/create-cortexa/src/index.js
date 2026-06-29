#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const args = process.argv.slice(2);
const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath?.endsWith(".js")
  ? process.execPath
  : npmExecPath || join(dirname(process.execPath), process.platform === "win32" ? "npm.cmd" : "npm");
const npmBaseArgs = npmExecPath?.endsWith(".js") ? [npmExecPath] : [];
const cliSpec = process.env.CORTEXA_CLI_SPEC || "@cortexa-labs/cli@latest";
const packageJsonPath = join(root, "package.json");
const cliPath = join(root, "node_modules", "@cortexa-labs", "cli", "src", "index.js");

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Create Cortexa

Usage:
  npm create cortexa@latest
  npm create cortexa@latest -- --template frontend --editors codex,cursor
  npm create cortexa@latest -- --yes

Options:
  --template <value>  Use auto, minimal, frontend, backend, or monorepo.
  --editors <value>   Configure codex, cursor, all, or a comma-separated selection.
  --yes               Use automatic template detection and the Codex integration.
`);
  process.exit(0);
}

if (!existsSync(packageJsonPath)) {
  console.error("Cortexa must be initialized inside an existing npm project with a package.json.");
  console.error("Run `npm init -y` first, then run `npm create cortexa@latest` again.");
  process.exit(1);
}

if (!commandAvailable(npmCommand, npmBaseArgs)) {
  console.error("npm was not found, but it is required to install @cortexa-labs/cli.");
  console.error("Install Node.js with npm, or ensure npm is available on PATH, then run `npm create cortexa@latest` again.");
  process.exit(1);
}

console.log("Installing @cortexa-labs/cli as a development dependency...");
const install = spawnSync(npmCommand, [...npmBaseArgs, "install", "--save-dev", cliSpec, "--ignore-scripts"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32"
});

if (install.status !== 0) {
  console.error("Unable to install @cortexa-labs/cli.");
  if (install.error) {
    console.error(install.error.message);
  }
  process.exit(install.status || 1);
}

if (!existsSync(cliPath)) {
  console.error("Installed CLI entrypoint was not found in node_modules.");
  process.exit(1);
}

const automatic = args.includes("--yes") || args.includes("-y");
const forwarded = args.filter((arg) => arg !== "--yes" && arg !== "-y");
const hasSetupOptions = forwarded.some((arg) => arg === "--template" || arg.startsWith("--template=") || arg === "--editors" || arg.startsWith("--editors="));
const setupArgs = hasSetupOptions
  ? ["setup", ...forwarded]
  : automatic
    ? ["setup", "--template", "auto", "--editors", "codex"]
    : ["setup", "--interactive"];

console.log("\nConfiguring Cortexa in this project...\n");
const setup = spawnSync(process.execPath, [cliPath, ...setupArgs], {
  cwd: root,
  stdio: "inherit"
});

if (setup.status !== 0) {
  console.error("\nCortexa CLI was installed, but workspace setup did not complete.");
  if (setup.error) {
    console.error(setup.error.message);
  }
  console.error("Run `npx --no-install ctx setup --interactive` to continue.");
  process.exit(setup.status || 1);
}

console.log("\nCortexa is ready. Use `npx --no-install ctx pack \"<task>\"` to build task context.");

function commandAvailable(command, baseArgs) {
  const result = spawnSync(command, [...baseArgs, "--version"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  return result.status === 0;
}
