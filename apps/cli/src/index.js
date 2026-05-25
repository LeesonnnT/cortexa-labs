#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

const command = (process.argv[2] || "help").toLowerCase();
const args = process.argv.slice(3);
const cwd = process.cwd();

function readJson(path) {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function listTopLevelDirs(root) {
  const ignored = new Set([".git", ".cortexa", "node_modules", "dist", "build", "coverage"]);

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !ignored.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function detectPackageManager(root) {
  if (existsSync(join(root, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (existsSync(join(root, "yarn.lock"))) {
    return "yarn";
  }

  if (existsSync(join(root, "package-lock.json"))) {
    return "npm";
  }

  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) {
    return "bun";
  }

  return "unknown";
}

function detectFramework(packageJson) {
  const deps = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies
  };

  if (deps.next) {
    return "nextjs";
  }

  if (deps.nuxt) {
    return "nuxt";
  }

  if (deps["@nestjs/core"]) {
    return "nest";
  }

  if (deps.vue) {
    return "vue";
  }

  if (deps.react) {
    return "react";
  }

  if (deps.vite) {
    return "vite";
  }

  return "unknown";
}

function discoverWorkspace(root) {
  const packageJsonPath = join(root, "package.json");
  const packageJson = readJson(packageJsonPath);
  const directories = listTopLevelDirs(root);
  const workspaceConfig = readJson(join(root, ".cortexa", "workspace.json"));

  return {
    name: packageJson?.name || basename(root),
    root,
    packageManager: detectPackageManager(root),
    framework: detectFramework(packageJson),
    workspaces: packageJson?.workspaces || [],
    directories,
    entrypoints: ["src", "app", "pages", "server", "lib", "packages", "apps"].filter((name) =>
      existsSync(join(root, name))
    ),
    dependencies: Object.keys(packageJson?.dependencies || {}).sort(),
    devDependencies: Object.keys(packageJson?.devDependencies || {}).sort(),
    config: workspaceConfig
  };
}

function createContextPacket(root, task) {
  const workspace = discoverWorkspace(root);
  const scope = workspace.entrypoints.length > 0 ? workspace.entrypoints : workspace.directories;

  return {
    task,
    workspace: {
      name: workspace.name,
      packageManager: workspace.packageManager,
      framework: workspace.framework
    },
    scope,
    dependencies: workspace.dependencies,
    devDependencies: workspace.devDependencies,
    specs: [],
    skills: inferSkills(task),
    generatedAt: new Date().toISOString()
  };
}

function inferSkills(task) {
  const value = task.toLowerCase();

  if (value.includes("review")) {
    return ["review"];
  }

  if (value.includes("audit")) {
    return ["dependency-audit"];
  }

  if (value.includes("spec")) {
    return ["spec-generate"];
  }

  return [];
}

const commands = {
  help() {
    console.log(`Context Engineering CLI

Usage:
  ctx help
  ctx version
  ctx doctor
  ctx init
  ctx discover
  ctx pack <task>

Commands:
  help      Show this help.
  version   Show CLI version.
  doctor    Validate workspace skeleton.
  init      Initialize workspace metadata.
  discover  Inspect workspace shape.
  pack      Build a minimal context packet.
`);
  },
  version() {
    const packageJsonPath = new URL("../package.json", import.meta.url);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    console.log(packageJson.version);
  },
  doctor() {
    const checks = {
      cli: true,
      packageJson: existsSync(join(cwd, "package.json")),
      cortexaConfig: existsSync(join(cwd, ".cortexa", "workspace.json"))
    };

    console.log(JSON.stringify(checks, null, 2));
  },
  init() {
    const cortexaDir = join(cwd, ".cortexa");
    const workspacePath = join(cortexaDir, "workspace.json");
    const discovery = discoverWorkspace(cwd);

    mkdirSync(cortexaDir, { recursive: true });

    if (!existsSync(workspacePath)) {
      writeJson(workspacePath, {
        name: discovery.name,
        contextVersion: 1,
        defaultScope: discovery.entrypoints,
        ignore: ["node_modules", ".git", "dist", "build", "coverage"]
      });
    }

    console.log(`initialized ${relative(cwd, workspacePath)}`);
  },
  discover() {
    console.log(JSON.stringify(discoverWorkspace(cwd), null, 2));
  },
  pack() {
    const task = args[0] || "default-task";
    console.log(JSON.stringify(createContextPacket(cwd, task), null, 2));
  }
};

if (!commands[command]) {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
} else {
  commands[command]();
}
