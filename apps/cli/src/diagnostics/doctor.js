import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { discoverWorkspace } from "../workspace/discovery.js";

export function createDoctorReport(root) {
  const discovery = discoverWorkspace(root);
  const checks = [
    nodeRuntimeCheck(),
    npmRuntimeCheck(),
    fileCheck(root, "package.json", "project.package-json", "warn", "package.json helps Cortexa detect scripts, dependencies, and workspace packages."),
    fileCheck(root, ".cortexa/workspace.json", "cortexa.workspace", "warn", "Run ctx setup before relying on ctx pack or editor integrations."),
    fileCheck(root, ".cortexa/context-manifest.json", "cortexa.manifest", "warn", "Run ctx setup or ctx update to create lifecycle metadata."),
    fileCheck(root, ".cortexa/contexts/context-packet.schema.json", "cortexa.packet-schema", "warn", "Run ctx update to refresh Context Packet schema metadata.")
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
    title: "Node.js runtime",
    message: ok ? `Node ${process.version} satisfies >=18.` : `Node ${process.version} is too old. Cortexa requires Node >=18.`,
    suggestion: ok ? null : "Install Node.js 18 or newer before running Cortexa.",
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
    ? `npm ${result.stdout.trim()} is available.`
    : "npm was not found. npm is required for npm create cortexa@latest and npm-based release checks.";

  return {
    id: "runtime.npm",
    status: ok ? "pass" : "warn",
    severity: ok ? "info" : "warn",
    title: "npm runtime",
    message,
    suggestion: ok ? null : "Install Node.js with npm, or ensure npm is available on PATH.",
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
    title: `${path} exists`,
    message: exists ? `${path} exists.` : `${path} is missing. ${missingMessage}`,
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
    actions.push("Install Node.js 18 or newer.");
  }

  if (byId.get("runtime.npm")?.status !== "pass") {
    actions.push("Install npm or add it to PATH before using npm create cortexa@latest.");
  }

  if (byId.get("cortexa.workspace")?.status !== "pass" || byId.get("cortexa.manifest")?.status !== "pass") {
    actions.push("Run ctx setup --template auto --editors codex to initialize Cortexa assets.");
  }

  if (actions.length === 0) {
    actions.push("Environment and Cortexa assets look ready.");
  }

  return actions;
}
