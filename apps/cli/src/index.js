#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { analyzeProject, selectContextScope } from "./adapters/project.js";

const command = (process.argv[2] || "help").toLowerCase();
const args = process.argv.slice(3);
const cwd = process.cwd();
const managedStart = "<!-- cortexa:start -->";
const managedEnd = "<!-- cortexa:end -->";

const integrationRegistry = [
  { id: "agents", label: "AGENTS.md compatible agents", path: "AGENTS.md", content: () => markdownRule("AGENTS.md compatible agents"), mode: "section" },
  { id: "codex", label: "Codex", path: "AGENTS.md", content: () => markdownRule("AGENTS.md compatible agents"), mode: "section" },
  { id: "opencode", label: "OpenCode", path: "AGENTS.md", content: () => markdownRule("AGENTS.md compatible agents"), mode: "section" },
  { id: "cursor", label: "Cursor", path: ".cursor/rules/cortexa-context.mdc", content: () => cursorRule(), mode: "file" },
  { id: "kiro", label: "Kiro", path: ".kiro/steering/cortexa-context.md", content: () => kiroRule(), mode: "file" },
  { id: "trae", label: "Trae", path: ".trae/rules/cortexa-context.md", content: () => markdownRule("Trae"), mode: "file" },
  { id: "windsurf", label: "Windsurf", path: ".windsurf/rules/cortexa-context.md", content: () => windsurfRule(), mode: "file" },
  { id: "zed", label: "Zed", path: ".rules", content: () => markdownRule("Zed"), mode: "section" },
  { id: "claude", label: "Claude Code", path: "CLAUDE.md", content: () => markdownRule("Claude Code"), mode: "section" },
  { id: "gemini", label: "Gemini CLI", path: "GEMINI.md", content: () => markdownRule("Gemini CLI"), mode: "section" },
  { id: "copilot", label: "GitHub Copilot", path: ".github/copilot-instructions.md", content: () => markdownRule("GitHub Copilot"), mode: "section" },
  { id: "vscode", label: "VS Code Copilot", path: ".github/copilot-instructions.md", content: () => markdownRule("GitHub Copilot"), mode: "section" },
  { id: "clinerules", label: "Cline", path: ".clinerules/cortexa-context.md", content: () => markdownRule("Cline"), mode: "file" },
  { id: "cline", label: "Cline", path: ".clinerules/cortexa-context.md", content: () => markdownRule("Cline"), mode: "file" },
  { id: "roo", label: "Roo Code", path: ".roo/rules/cortexa-context.md", content: () => markdownRule("Roo Code"), mode: "file" },
  { id: "aider", label: "Aider", path: "CONVENTIONS.md", content: () => markdownRule("Aider"), mode: "section" },
  { id: "amazonq", label: "Amazon Q Developer", path: ".amazonq/rules/cortexa-context.md", content: () => markdownRule("Amazon Q Developer"), mode: "file" },
  { id: "junie", label: "JetBrains Junie", path: ".junie/guidelines.md", content: () => markdownRule("JetBrains Junie"), mode: "section" },
  { id: "continue", label: "Continue", path: ".continue/rules/cortexa-context.md", content: () => markdownRule("Continue"), mode: "file" }
];

const defaultIntegrations = [
  "agents",
  "codex",
  "opencode",
  "cursor",
  "kiro",
  "trae",
  "windsurf",
  "zed",
  "claude",
  "gemini",
  "copilot",
  "vscode",
  "clinerules",
  "cline",
  "roo",
  "aider",
  "amazonq",
  "junie",
  "continue"
];

const editorAliases = new Map([
  ["all", defaultIntegrations],
  ["default", defaultIntegrations],
  ["mainstream", defaultIntegrations],
  ["github-copilot", ["copilot"]],
  ["githubcopilot", ["copilot"]],
  ["visualstudio", ["copilot"]],
  ["visual-studio", ["copilot"]],
  ["vs-code", ["vscode"]],
  ["vs", ["vscode"]],
  ["cline-rules", ["clinerules"]],
  ["amazon-q", ["amazonq"]],
  ["amazon", ["amazonq"]],
  ["q", ["amazonq"]],
  ["claude-code", ["claude"]],
  ["gemini-cli", ["gemini"]],
  ["jetbrains", ["junie"]],
  ["jetbrains-junie", ["junie"]],
  ["roo-code", ["roo"]]
]);

const supportedEditors = [...new Set(integrationRegistry.map((integration) => integration.id))].sort();

function readJson(path) {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function listTopLevelDirs(root) {
  const ignored = new Set([".git", ".cortexa", "node_modules", "dist", "build", "coverage"]);

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !ignored.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function discoverWorkspace(root) {
  const packageJsonPath = join(root, "package.json");
  const packageJson = readJson(packageJsonPath);
  const directories = listTopLevelDirs(root);
  const workspaceConfig = readJson(join(root, ".cortexa", "workspace.json"));
  const analysis = analyzeProject(root);

  return {
    name: packageJson?.name || basename(root),
    root,
    packageManager: analysis.packageManager,
    framework: analysis.framework,
    frameworks: analysis.frameworks,
    workspace: analysis.workspace,
    workspaces: analysis.workspaces,
    directories,
    adapters: analysis.adapters,
    entrypoints: analysis.entrypoints,
    semanticEntrypoints: analysis.semanticEntrypoints,
    features: analysis.features,
    packages: analysis.packages,
    dependencyGraph: analysis.dependencyGraph,
    languages: analysis.languages,
    sourceSummary: analysis.sourceSummary,
    dependencies: Object.keys(packageJson?.dependencies || {}).sort(),
    devDependencies: Object.keys(packageJson?.devDependencies || {}).sort(),
    config: workspaceConfig
  };
}

function createContextPacket(root, task) {
  const workspace = discoverWorkspace(root);
  const scope = selectContextScope(workspace, task);

  return {
    task,
    workspace: {
      name: workspace.name,
      packageManager: workspace.packageManager,
      framework: workspace.framework,
      frameworks: workspace.frameworks,
      workspace: workspace.workspace,
      adapters: workspace.adapters
    },
    scope,
    entrypoints: workspace.semanticEntrypoints,
    features: workspace.features,
    packages: workspace.packages,
    dependencyGraph: workspace.dependencyGraph,
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

function initializeWorkspace(root) {
  const cortexaDir = join(root, ".cortexa");
  const workspacePath = join(cortexaDir, "workspace.json");
  const discovery = discoverWorkspace(root);

  mkdirSync(cortexaDir, { recursive: true });

  if (!existsSync(workspacePath)) {
    writeJson(workspacePath, {
      name: discovery.name,
      contextVersion: 1,
      defaultScope: discovery.entrypoints,
      ignore: ["node_modules", ".git", "dist", "build", "coverage"]
    });
  }

  return workspacePath;
}

function parseEditorSelection(values) {
  const requested = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--editors" || value === "--editor") {
      requested.push(values[index + 1] || "");
      index += 1;
    } else if (value.startsWith("--editors=") || value.startsWith("--editor=")) {
      requested.push(value.slice(value.indexOf("=") + 1));
    }
  }

  const tokens = (requested.length === 0 ? ["all"] : requested)
    .flatMap((value) => value.toLowerCase().split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error(`No editor selected. Choose from ${supportedEditors.join(", ")} or all.`);
  }

  const selected = tokens.flatMap((editor) => editorAliases.get(editor) || [editor]);
  const invalid = selected.filter((editor) => !supportedEditors.includes(editor));
  if (invalid.length > 0) {
    throw new Error(`Unsupported editor: ${invalid.join(", ")}. Choose from ${supportedEditors.join(", ")} or all.`);
  }

  return [...new Set(selected)];
}

function managedInstructions(label) {
  return `${managedStart}
# Cortexa Context (${label})

Use Cortexa before broad repository exploration for engineering tasks:

1. Run \`ctx discover\` when repository structure is unknown.
2. Run \`ctx pack "<task>"\` to obtain the minimal structured context packet.
3. Work from that packet and expand scope only when the task requires it.

When the CLI is installed as a local dependency, invoke it as \`npx --no-install ctx <command>\`.
${managedEnd}`;
}

function markdownRule(label) {
  return `${managedInstructions(label)}\n`;
}

function cursorRule() {
  return `---
description: Use Cortexa structured context before broad repository exploration
alwaysApply: true
---

${managedInstructions("Cursor")}
`;
}

function kiroRule() {
  return `---
inclusion: always
---

${managedInstructions("Kiro")}
`;
}

function windsurfRule() {
  return `---
trigger: always_on
description: Use Cortexa structured context before broad repository exploration
---

${managedInstructions("Windsurf")}
`;
}

function updateManagedSection(path, content) {
  mkdirSync(dirname(path), { recursive: true });

  if (!existsSync(path)) {
    writeFileSync(path, content);
    return "created";
  }

  const current = readFileSync(path, "utf8");
  const start = current.indexOf(managedStart);
  const end = current.indexOf(managedEnd);

  if (start === -1 || end === -1 || end < start) {
    writeFileSync(path, `${current.trimEnd()}\n\n${content}`);
    return "extended";
  }

  const afterEnd = end + managedEnd.length;
  writeFileSync(path, `${current.slice(0, start)}${content.trimEnd()}${current.slice(afterEnd)}`);
  return "updated";
}

function writeGeneratedRule(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const existed = existsSync(path);

  if (existed && !readFileSync(path, "utf8").includes(managedStart)) {
    return "skipped (existing custom rule)";
  }

  writeFileSync(path, content);
  return existed ? "updated" : "created";
}

function removeManagedSection(path) {
  if (!existsSync(path)) {
    return "missing";
  }

  const current = readFileSync(path, "utf8");
  const start = current.indexOf(managedStart);
  const end = current.indexOf(managedEnd);

  if (start === -1 || end === -1 || end < start) {
    return "skipped (no managed content)";
  }

  const afterEnd = end + managedEnd.length;
  const next = `${current.slice(0, start).trimEnd()}\n${current.slice(afterEnd).trimStart()}`.trim();

  if (!next) {
    rmSync(path);
    return "removed";
  }

  writeFileSync(path, `${next}\n`);
  return "cleaned";
}

function setupEditors(root, editors) {
  const results = [];
  const integrations = new Map(integrationRegistry.map((integration) => [integration.id, integration]));
  const written = new Set();

  for (const editor of editors) {
    const integration = integrations.get(editor);
    const path = join(root, integration.path);
    const content = integration.content();
    const writer = integration.mode === "section" ? updateManagedSection : writeGeneratedRule;
    const fingerprint = `${integration.mode}:${path}:${content}`;

    if (written.has(fingerprint)) {
      continue;
    }

    written.add(fingerprint);
    results.push({
      editor,
      path: relative(root, path),
      status: writer(path, content)
    });
  }

  writeJson(join(root, ".cortexa", "integrations.json"), {
    version: 1,
    editors
  });

  return results;
}

function teardownEditors(root, options = {}) {
  const integrations = new Map(integrationRegistry.map((integration) => [integration.id, integration]));
  const configured = readJson(join(root, ".cortexa", "integrations.json"));
  const editors = configured?.editors?.length ? configured.editors : defaultIntegrations;
  const results = [];
  const visited = new Set();

  for (const editor of editors) {
    const integration = integrations.get(editor);
    if (!integration) {
      continue;
    }

    const path = join(root, integration.path);
    if (visited.has(path)) {
      continue;
    }

    visited.add(path);
    results.push({
      editor,
      path: relative(root, path),
      status: removeManagedSection(path)
    });
  }

  const integrationsPath = join(root, ".cortexa", "integrations.json");
  if (existsSync(integrationsPath)) {
    rmSync(integrationsPath);
    results.push({
      editor: "cortexa",
      path: relative(root, integrationsPath),
      status: "removed"
    });
  }

  if (options.purge) {
    const cortexaDir = join(root, ".cortexa");
    if (existsSync(cortexaDir)) {
      rmSync(cortexaDir, { recursive: true, force: true });
      results.push({
        editor: "cortexa",
        path: relative(root, cortexaDir),
        status: "purged"
      });
    }
  }

  return results;
}

function listEditorIntegrations() {
  for (const integration of integrationRegistry) {
    console.log(`${integration.id.padEnd(12)} ${integration.path} (${integration.label})`);
  }
}

const commands = {
  help() {
    console.log(`Context Engineering CLI

Usage:
  ctx help
  ctx version
  ctx doctor
  ctx init
  ctx setup [--editors all|codex,cursor,kiro,trae,...]
  ctx setup --list-editors
  ctx teardown [--purge]
  ctx discover
  ctx pack <task>

Commands:
  help      Show this help.
  version   Show CLI version.
  doctor    Validate workspace skeleton.
  init      Initialize workspace metadata.
  setup     Initialize metadata and add editor-native context rules.
  teardown  Remove Cortexa-managed editor rules without touching project code.
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
    const workspacePath = initializeWorkspace(cwd);
    console.log(`initialized ${relative(cwd, workspacePath)}`);
  },
  setup() {
    try {
      if (args.includes("--list-editors")) {
        listEditorIntegrations();
        return;
      }

      const editors = parseEditorSelection(args);
      const workspacePath = initializeWorkspace(cwd);
      const results = setupEditors(cwd, editors);

      console.log(`initialized ${relative(cwd, workspacePath)}`);
      for (const result of results) {
        console.log(`${result.editor}: ${result.status} ${result.path}`);
      }
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  },
  teardown() {
    const results = teardownEditors(cwd, { purge: args.includes("--purge") });

    for (const result of results) {
      console.log(`${result.editor}: ${result.status} ${result.path}`);
    }
  },
  uninstall() {
    commands.teardown();
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
