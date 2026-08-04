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
  console.log(`创建 Cortexa

用法：
  npm create cortexa@latest
  npm create cortexa@latest -- --template frontend --editors codex,cursor
  npm create cortexa@latest -- --yes
  npm create cortexa@latest -- --yes --task "fix login token expiration"

选项：
  --template <value>  使用 auto、minimal、frontend、backend 或 monorepo。
  --editors <value>   配置 codex、cursor、all 或逗号分隔的选择。
  --task <value>      在 setup 后立即构建 Context Packet。
  --yes               使用自动模板检测与 Codex 集成。
`);
  process.exit(0);
}

if (!existsSync(packageJsonPath)) {
  console.error("必须在包含 package.json 的已有 npm 项目中初始化 Cortexa。");
  console.error("请先运行 `npm init -y`，再重新运行 `npm create cortexa@latest`。");
  process.exit(1);
}

if (!commandAvailable(npmCommand, npmBaseArgs)) {
  console.error("未找到 npm，但安装 @cortexa-labs/cli 需要 npm。");
  console.error("请安装包含 npm 的 Node.js，或确保 npm 位于 PATH 中，然后重新运行 `npm create cortexa@latest`。");
  process.exit(1);
}

console.log("正在将 @cortexa-labs/cli 安装为开发依赖...");
const install = spawnSync(npmCommand, [...npmBaseArgs, "install", "--save-dev", cliSpec, "--ignore-scripts"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32"
});

if (install.status !== 0) {
  console.error("无法安装 @cortexa-labs/cli。");
  if (install.error) {
    console.error(install.error.message);
  }
  process.exit(install.status || 1);
}

if (!existsSync(cliPath)) {
  console.error("未在 node_modules 中找到已安装的 CLI 入口。");
  process.exit(1);
}

const automatic = args.includes("--yes") || args.includes("-y");
const task = parseTask(args);
const forwarded = stripInitializerOnlyArgs(args);
const hasSetupOptions = forwarded.some((arg) => arg === "--template" || arg.startsWith("--template=") || arg === "--editors" || arg.startsWith("--editors="));
const setupArgs = hasSetupOptions
  ? ["setup", ...forwarded]
  : automatic
    ? ["setup", "--template", "auto", "--editors", "codex"]
    : ["setup", "--interactive"];

console.log("\n正在为当前项目配置 Cortexa...\n");
const setup = spawnSync(process.execPath, [cliPath, ...setupArgs], {
  cwd: root,
  stdio: "inherit"
});

if (setup.status !== 0) {
  console.error("\nCortexa CLI 已安装，但工作区 setup 未完成。");
  if (setup.error) {
    console.error(setup.error.message);
  }
  console.error("请运行 `npx --no-install ctx setup --interactive` 继续。");
  process.exit(setup.status || 1);
}

if (task) {
  console.log("\n正在构建初始 Context Packet...\n");
  const pack = spawnSync(process.execPath, [cliPath, "pack", "--explain", task], {
    cwd: root,
    stdio: "inherit"
  });

  if (pack.status !== 0) {
    console.error("\nCortexa 已就绪，但无法创建初始 Context Packet。");
    process.exit(pack.status || 1);
  }
} else {
  console.log("\nCortexa 已就绪。使用 `npx --no-install ctx go \"<task>\"` 初始化或刷新上下文，并构建 Context Packet。");
}

function commandAvailable(command, baseArgs) {
  const result = spawnSync(command, [...baseArgs, "--version"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  return result.status === 0;
}

function parseTask(values) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--task") {
      return values[index + 1] || "";
    }

    if (value.startsWith("--task=")) {
      return value.slice(value.indexOf("=") + 1);
    }
  }

  return "";
}

function stripInitializerOnlyArgs(values) {
  const result = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--yes" || value === "-y") {
      continue;
    }

    if (value === "--task") {
      index += 1;
      continue;
    }

    if (value.startsWith("--task=")) {
      continue;
    }

    result.push(value);
  }

  return result;
}
