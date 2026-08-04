import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { discoverWorkspace } from "../workspace/discovery.js";

export function createDoctorReport(root) {
  const discovery = discoverWorkspace(root);
  const checks = [
    nodeRuntimeCheck(),
    npmRuntimeCheck(),
    fileCheck(root, "package.json", "project.package-json", "warn", "package.json 用于帮助 Cortexa 识别脚本、依赖和工作区包。"),
    fileCheck(root, ".cortexa/workspace.json", "cortexa.workspace", "warn", "依赖 ctx pack 或编辑器集成前，请运行 ctx setup。"),
    fileCheck(root, ".cortexa/context-manifest.json", "cortexa.manifest", "warn", "请运行 ctx setup 或 ctx update 创建生命周期元数据。"),
    fileCheck(root, ".cortexa/contexts/context-packet.schema.json", "cortexa.packet-schema", "warn", "请运行 ctx update 刷新 Context Packet schema 元数据。")
  ];
  const summary = summarizeChecks(checks);

  return {
    version: 1,
    status: summary.status,
    summary,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      npm: checks.find((check) => check.id === "runtime.npm")?.details?.version || null
    },
    project: {
      name: discovery.name,
      packageManager: discovery.packageManager,
      workspace: discovery.workspace,
      frameworks: discovery.frameworks,
      adapters: discovery.adapters
    },
    checks,
    recommendations: recommendActions(checks)
  };
}

function nodeRuntimeCheck() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  const ok = major >= 18;

  return {
    id: "runtime.node",
    status: ok ? "pass" : "fail",
    severity: ok ? "info" : "fail",
    title: "Node.js 运行时",
    message: ok ? `Node ${process.version} 满足 >=18 的要求。` : `Node ${process.version} 版本过低，Cortexa 要求 Node >=18。`,
    suggestion: ok ? null : "运行 Cortexa 前请安装 Node.js 18 或更高版本。",
    details: {
      version: process.version,
      required: ">=18"
    }
  };
}

function npmRuntimeCheck() {
  const npm = resolveNpmCommand();
  const result = spawnSync(npm.command, [...npm.args, "--version"], {
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  const ok = result.status === 0;
  const message = ok
    ? `npm ${result.stdout.trim()} 可用。`
    : "未找到 npm。运行 npm create cortexa@latest 和基于 npm 的发布检查需要 npm。";

  return {
    id: "runtime.npm",
    status: ok ? "pass" : "warn",
    severity: ok ? "info" : "warn",
    title: "npm 运行时",
    message,
    suggestion: ok ? null : "请安装包含 npm 的 Node.js，或确保 npm 位于 PATH 中。",
    details: {
      command: npm.display,
      version: ok ? result.stdout.trim() : null,
      error: ok ? null : result.error?.message || result.stderr?.trim() || null
    }
  };
}

function resolveNpmCommand() {
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath?.endsWith(".js")) {
    return {
      command: process.execPath,
      args: [npmExecPath],
      display: `${process.execPath} ${npmExecPath}`
    };
  }

  if (npmExecPath) {
    return {
      command: npmExecPath,
      args: [],
      display: npmExecPath
    };
  }

  const bundled = join(dirname(process.execPath), process.platform === "win32" ? "npm.cmd" : "npm");
  return {
    command: existsSync(bundled) ? bundled : "npm",
    args: [],
    display: existsSync(bundled) ? bundled : "npm"
  };
}

function fileCheck(root, path, id, missingSeverity, missingMessage) {
  const exists = existsSync(join(root, path));

  return {
    id,
    status: exists ? "pass" : missingSeverity,
    severity: exists ? "info" : missingSeverity,
    title: `${path} 是否存在`,
    message: exists ? `${path} 存在。` : `${path} 不存在。${missingMessage}`,
    path,
    suggestion: exists ? null : missingMessage
  };
}

function summarizeChecks(checks) {
  const counts = checks.reduce(
    (summary, check) => {
      summary[check.status] = (summary[check.status] || 0) + 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0 }
  );

  return {
    total: checks.length,
    pass: counts.pass || 0,
    warn: counts.warn || 0,
    fail: counts.fail || 0,
    status: counts.fail > 0 ? "fail" : counts.warn > 0 ? "warn" : "pass"
  };
}

function recommendActions(checks) {
  const actions = [];
  const byId = new Map(checks.map((check) => [check.id, check]));

  if (byId.get("runtime.node")?.status === "fail") {
    actions.push("安装 Node.js 18 或更高版本。");
  }

  if (byId.get("runtime.npm")?.status !== "pass") {
    actions.push("使用 npm create cortexa@latest 前，请安装 npm 或将其加入 PATH。");
  }

  if (byId.get("cortexa.workspace")?.status !== "pass" || byId.get("cortexa.manifest")?.status !== "pass") {
    actions.push("运行 ctx setup --template auto --editors codex 初始化 Cortexa 资产。");
  }

  if (actions.length === 0) {
    actions.push("环境和 Cortexa 资产已就绪。");
  }

  return actions;
}
