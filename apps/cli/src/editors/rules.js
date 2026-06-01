import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { readJson, writeJson } from "../core/fs.js";
import { createIntegrationRegistry } from "../editor-integrations/index.js";

const managedStart = "<!-- cortexa:start -->";
const managedEnd = "<!-- cortexa:end -->";
const integrationRegistry = createIntegrationRegistry({ cursorRule, kiroRule, markdownRule, windsurfRule });

function managedInstructions(label) {
  return `${managedStart}
# Cortexa Context (${label})

Use Cortexa before broad repository exploration for engineering tasks:

1. Run \`ctx discover\` when repository structure is unknown.
2. Run \`ctx pack "<task>"\` to obtain the minimal structured context packet.
3. Read the specs listed in the packet from \`.cortexa/specs/\` before applying project conventions.
4. If \`.cortexa/project-kit.json\` or \`.cortexa/starter-kit.json\` exists, use its matching skill or agent profile for the task.
5. Work from that packet and expand scope only when the task requires it.

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

function isEmptyRuleShell(content) {
  const value = content.trim();

  if (!value) {
    return true;
  }

  return /^---\r?\n[\s\S]*?\r?\n---$/.test(value);
}

function removeManagedSection(path, options = {}) {
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

  if (!next || (options.generatedFile && isEmptyRuleShell(next))) {
    rmSync(path);
    return "removed";
  }

  writeFileSync(path, `${next}\n`);
  return "cleaned";
}

export function setupEditors(root, editors) {
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

export function teardownEditors(root, options = {}) {
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
      status: removeManagedSection(path, { generatedFile: integration.mode === "file" })
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

export function listEditorIntegrations() {
  for (const integration of integrationRegistry) {
    console.log(`${integration.id.padEnd(12)} ${integration.path} (${integration.label})`);
  }
}
