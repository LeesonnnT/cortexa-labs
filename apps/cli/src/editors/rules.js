import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { readJson, writeJson } from "../core/fs.js";
import { createIntegrationRegistry } from "../editor-integrations/index.js";

const managedStart = "<!-- cortexa:start -->";
const managedEnd = "<!-- cortexa:end -->";
const integrationRegistry = createIntegrationRegistry({ cursorRule, kiroRule, markdownRule, windsurfRule });

function managedInstructions(label) {
  return `${managedStart}
# Cortexa 上下文（${label}）

执行工程任务时，在大范围探索仓库前先使用 Cortexa：

1. 不清楚仓库结构时，运行 \`ctx discover\`。
2. 运行 \`ctx pack "<task>"\` 获取最小结构化 Context Packet。
3. 开始执行前检查 \`readiness\` 和 \`qualityGate\`。
4. 检查 \`phaseTransition\`，决定执行、复核或收窄任务。
5. 应用项目约定前，先读取 Packet 列出的 \`.cortexa/specs/\` 规范。
6. 存在 \`.cortexa/project-kit.json\` 或 \`.cortexa/starter-kit.json\` 时，为任务使用对应 Skill 或 Agent 档案。
7. 任务在 Agent 或阶段之间流转时使用 \`handoff\`。
8. 以 Packet 为依据，仅在任务确有需要时扩大范围。

CLI 作为本地依赖安装时，使用 \`npx --no-install ctx <command>\` 调用。
${managedEnd}`;
}

function markdownRule(label) {
  return `${managedInstructions(label)}\n`;
}

function cursorRule() {
  return `---
description: 在大范围探索仓库前使用 Cortexa 结构化上下文
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
description: 在大范围探索仓库前使用 Cortexa 结构化上下文
---

${managedInstructions("Windsurf")}
`;
}

function updateManagedSection(path, content) {
  mkdirSync(dirname(path), { recursive: true });

  if (!existsSync(path)) {
    writeFileSync(path, content);
    return "已创建";
  }

  const current = readFileSync(path, "utf8");
  const start = current.indexOf(managedStart);
  const end = current.indexOf(managedEnd);

  if (start === -1 || end === -1 || end < start) {
    writeFileSync(path, `${current.trimEnd()}\n\n${content}`);
    return "已扩展";
  }

  const afterEnd = end + managedEnd.length;
  writeFileSync(path, `${current.slice(0, start)}${content.trimEnd()}${current.slice(afterEnd)}`);
  return "已更新";
}

function writeGeneratedRule(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const existed = existsSync(path);

  if (existed && !readFileSync(path, "utf8").includes(managedStart)) {
    return "已跳过（存在自定义规则）";
  }

  writeFileSync(path, content);
  return existed ? "已更新" : "已创建";
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
    return "不存在";
  }

  const current = readFileSync(path, "utf8");
  const start = current.indexOf(managedStart);
  const end = current.indexOf(managedEnd);

  if (start === -1 || end === -1 || end < start) {
    return "已跳过（不存在受管内容）";
  }

  const afterEnd = end + managedEnd.length;
  const next = `${current.slice(0, start).trimEnd()}\n${current.slice(afterEnd).trimStart()}`.trim();

  if (!next || (options.generatedFile && isEmptyRuleShell(next))) {
    rmSync(path);
    return "已移除";
  }

  writeFileSync(path, `${next}\n`);
  return "已清理";
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
      status: "已移除"
    });
  }

  if (options.purge) {
    const cortexaDir = join(root, ".cortexa");
    if (existsSync(cortexaDir)) {
      rmSync(cortexaDir, { recursive: true, force: true });
      results.push({
        editor: "cortexa",
        path: relative(root, cortexaDir),
        status: "已清除"
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
