#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { analyzeProject, selectContextScope } from "./adapters/project/index.js";
import {
  adapterSnapshot,
  adaptersReadmeDocument,
  agentHandoffSchemaDocument,
  agentProfile,
  contractsReadmeDocument,
  contextPacketSchemaDocument,
  contextsReadmeDocument,
  domainsReadmeDocument,
  graphsReadmeDocument,
  memoryReadmeDocument,
  multiAgentCollaborationDocument,
  multiAgentProtocolDocument,
  multiAgentReadmeDocument,
  ownershipReadmeDocument,
  reportsReadmeDocument,
  runtimeReadmeDocument,
  sessionsReadmeDocument,
  skillDocument,
  specDesignDocument,
  specRequirementsDocument,
  specSnapshotEnd,
  specSnapshotStart,
  specTasksDocument,
  workflowDocument
} from "./documents/index.js";
import { createIntegrationRegistry, defaultEditorSelection, editorAliases, supportedEditors } from "./editor-integrations/index.js";
import { projectAgentRegistry, projectSkillRegistry, projectSpecRegistry, starterKits, supportedTemplates, templateAliases, templateRegistry } from "./registries/index.js";

const command = (process.argv[2] || "help").toLowerCase();
const args = process.argv.slice(3);
const cwd = process.cwd();
const managedStart = "<!-- cortexa:start -->";
const managedEnd = "<!-- cortexa:end -->";

const integrationRegistry = createIntegrationRegistry({ cursorRule, kiroRule, markdownRule, windsurfRule });

function readJson(path) {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeIfMissing(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    return "kept (existing)";
  }

  writeFileSync(path, content);
  return "created";
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
    sourceGraph: analysis.sourceGraph,
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
  const specs = selectSpecsForTask(root, task);
  const skills = [...new Set([...inferSkills(task), ...selectSkillsForTask(root, task, specs)])];
  const agents = selectAgentsForTask(root, task, skills, specs, scope);

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
    specs,
    skills,
    agents,
    multiAgent: selectMultiAgentPlan(task, workspace, scope, agents),
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

function selectSpecsForTask(root, task) {
  const available = listProjectSpecs(root);
  if (available.length === 0) {
    return [];
  }

  const taskValue = task.toLowerCase();
  const allSpecsRequested = includesAny(taskValue, ["spec", "规范", "convention", "standard"]);
  if (allSpecsRequested) {
    return available;
  }

  const selected = [];
  for (const id of ["project-overview", "coding-conventions"]) {
    const spec = available.find((candidate) => candidate.id === id);
    if (spec) {
      selected.push(spec);
    }
  }

  for (const spec of available) {
    if (selected.some((candidate) => candidate.id === spec.id)) {
      continue;
    }

    const registry = projectSpecRegistry.find((candidate) => candidate.id === spec.id);
    const keywords = registry?.keywords || [];
    if (keywords.some((keyword) => taskMatchesKeyword(taskValue, keyword))) {
      selected.push(spec);
    }
  }

  return selected.slice(0, 5);
}

function selectSkillsForTask(root, task, specs) {
  const available = new Set(listProjectSkills(root));
  const selected = [];

  function add(id) {
    if (available.has(id)) {
      selected.push(id);
    }
  }

  add("project-understanding");
  if (specs.length > 0) {
    add("spec-alignment");
  }

  const taskValue = task.toLowerCase();
  if (includesAny(taskValue, ["api", "interface", "接口", "contract", "request", "response"])) {
    add("api-contract-review");
  }

  if (includesAny(taskValue, ["ui", "ux", "frontend", "component", "页面", "组件", "视图", "样式"])) {
    add("ui-consistency-review");
  }

  if (includesAny(taskValue, ["doc", "docs", "readme", "文档", "说明"])) {
    add("documentation-quality");
  }

  return [...new Set(selected)];
}

function selectAgentsForTask(root, task, skills, specs, scope) {
  const available = new Set(listProjectAgents(root));
  const registryAgents = [...projectAgentRegistry, ...Object.values(starterKits).flatMap((kit) => kit.agents || [])];
  const selected = [];

  function add(id, reason) {
    if (!available.has(id) || selected.some((agent) => agent.id === id)) {
      return;
    }

    const registry = registryAgents.find((agent) => agent.id === id);
    selected.push({
      id,
      title: registry?.title || id,
      reason
    });
  }

  const taskValue = task.toLowerCase();
  add("project-context-analyst", "先确认最小上下文、包边界、功能边界和依赖关系。");

  if (includesAny(taskValue, ["review", "评审", "审查", "风险"])) {
    add("project-review-agent", "任务包含评审或风险判断。");
  }

  if (includesAny(taskValue, ["spec", "规范", "convention", "standard"]) || specs.length > 2) {
    add("project-spec-maintainer", "任务涉及项目规范沉淀或多项 spec 对齐。");
  }

  if (includesAny(taskValue, ["implement", "build", "fix", "update", "change", "refactor", "实现", "修复", "修改", "重构"])) {
    add("project-implementation-agent", "任务需要实际实现或修改代码。");
  }

  if (skills.includes("ui-consistency-review") || includesAny(taskValue, ["frontend", "ui", "页面", "组件", "样式"])) {
    add("frontend-builder", "任务包含前端 UI 或组件实现。");
    add("frontend-reviewer", "前端变更需要用户可见行为和可访问性检查。");
  }

  if (skills.includes("api-contract-review")) {
    add("frontend-data-integrator", "任务涉及请求、状态、缓存或 API 契约。");
  }

  if (scope.length > 3 && selected.length === 1) {
    add("project-implementation-agent", "scope 较多，建议由实现 agent 接续处理。");
  }

  return selected.slice(0, 5);
}

function listProjectAgents(root) {
  const agentsDir = join(root, ".cortexa", "agents");
  if (!existsSync(agentsDir)) {
    return [];
  }

  return readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
}

function selectMultiAgentPlan(task, workspace, scope, agents) {
  const taskValue = task.toLowerCase();
  const wantsReview = includesAny(taskValue, ["review", "评审", "审查"]);
  const wantsImplementation = includesAny(taskValue, ["implement", "build", "fix", "update", "change", "refactor", "实现", "修复", "修改", "重构"]);
  const broadScope = scope.length > 3 || workspace.packages.length > 1 || workspace.features.length > 3;
  const mode = broadScope && agents.length > 2 ? "parallel" : wantsReview && wantsImplementation ? "review-gate" : agents.length > 1 ? "pipeline" : "single";

  return {
    mode,
    protocol: ".cortexa/multi-agent/collaboration.md",
    handoffSchema: ".cortexa/multi-agent/handoff.schema.json",
    recommendedOrder: orderAgentsForMode(mode, agents).map((agent) => agent.id),
    notes: multiAgentNotes(mode)
  };
}

function orderAgentsForMode(mode, agents) {
  const priority = {
    "project-context-analyst": 10,
    "project-implementation-agent": 30,
    "frontend-builder": 35,
    "frontend-data-integrator": 35,
    "design-system-maintainer": 35,
    "accessibility-specialist": 40,
    "frontend-performance-engineer": 40,
    "frontend-test-engineer": 45,
    "frontend-reviewer": mode === "review-gate" ? 70 : 50,
    "project-review-agent": mode === "review-gate" ? 80 : 50,
    "project-spec-maintainer": 90
  };

  return [...agents].sort((a, b) => (priority[a.id] || 60) - (priority[b.id] || 60) || a.id.localeCompare(b.id));
}

function multiAgentNotes(mode) {
  if (mode === "parallel") {
    return "按互不重叠的 scope 分配 agent，并在合并前进行 review-gate。";
  }

  if (mode === "review-gate") {
    return "实现完成后必须交给 review agent 检查行为风险、约定漂移和验证缺口。";
  }

  if (mode === "pipeline") {
    return "按推荐顺序交接，每次交接使用 handoff schema 摘要上下文。";
  }

  return "单 agent 即可处理；如扩大 scope，再切换到 pipeline 或 review-gate。";
}

function listProjectSpecs(root) {
  const specsDir = join(root, ".cortexa", "specs");
  if (!existsSync(specsDir)) {
    return [];
  }

  return projectSpecRegistry
    .map((spec) => {
      const specDir = join(specsDir, spec.id);
      const files = ["requirements.md", "design.md", "tasks.md"].map((file) => join(specDir, file));
      if (!files.every((file) => existsSync(file))) {
        return null;
      }

      return {
        id: spec.id,
        title: spec.title,
        description: spec.description,
        path: relative(root, specDir),
        files: files.map((file) => relative(root, file))
      };
    })
    .filter(Boolean);
}

function listProjectSkills(root) {
  const skillsDir = join(root, ".cortexa", "skills");
  if (!existsSync(skillsDir)) {
    return [];
  }

  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsDir, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

function includesAny(value, keywords) {
  return keywords.some((keyword) => taskMatchesKeyword(value, keyword));
}

function taskMatchesKeyword(value, keyword) {
  const normalizedKeyword = keyword.toLowerCase();
  return value.includes(normalizedKeyword);
}

function inferTemplate(discovery) {
  if (discovery.workspace !== "single-package" || discovery.packages.length > 0) {
    return "monorepo";
  }

  if (discovery.frameworks.some((framework) => ["vue", "nuxt", "react", "nextjs", "vite"].includes(framework))) {
    return "frontend";
  }

  if (discovery.entrypoints.some((entrypoint) => entrypoint.kind === "server-entry") || discovery.frameworks.includes("nest")) {
    return "backend";
  }

  return "minimal";
}

function resolveTemplate(value, discovery) {
  const requested = (value || "auto").toLowerCase().trim();
  const resolved = templateAliases.get(requested)?.[0] || requested;
  const id = resolved === "auto" ? inferTemplate(discovery) : resolved;
  const template = templateRegistry.find((candidate) => candidate.id === id);

  if (!template) {
    throw new Error(`Unsupported template: ${requested}. Choose from ${supportedTemplates.join(", ")} or auto.`);
  }

  return template;
}

function parseTemplateSelection(values) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--template") {
      return values[index + 1] || "";
    }

    if (value.startsWith("--template=")) {
      return value.slice(value.indexOf("=") + 1);
    }
  }

  return "auto";
}

function existingScope(discovery, template) {
  const discovered = discovery.entrypoints;
  const templateScope = template.defaults.defaultScope.filter((scope) => existsSync(join(discovery.root, scope)));
  const scope = [...discovered, ...templateScope];

  if (scope.length > 0) {
    return [...new Set(scope)];
  }

  return template.defaults.defaultScope;
}

function initializeWorkspace(root, templateValue = "auto") {
  const cortexaDir = join(root, ".cortexa");
  const workspacePath = join(cortexaDir, "workspace.json");
  const discovery = discoverWorkspace(root);
  const template = resolveTemplate(templateValue, discovery);

  mkdirSync(cortexaDir, { recursive: true });

  if (!existsSync(workspacePath)) {
    writeJson(workspacePath, {
      name: discovery.name,
      contextVersion: 1,
      template: template.id,
      contextStrategy: template.defaults.contextStrategy,
      defaultScope: existingScope(discovery, template),
      suggestedScopes: template.defaults.suggestedScopes,
      qualityGates: template.defaults.qualityGates,
      ignore: ["node_modules", ".git", "dist", "build", "coverage"]
    });
  }

  return { path: workspacePath, template };
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

  const tokens = (requested.length === 0 ? ["default"] : requested)
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

function hasFlag(values, ...flags) {
  return values.some((value) => flags.includes(value));
}

function formatChoice(choice, index, defaultId) {
  const marker = choice.id === defaultId ? " (default)" : "";
  return `  ${index + 1}. ${choice.id}${marker} - ${choice.description}`;
}

async function promptChoice(rl, question, choices, defaultId) {
  while (true) {
    console.log("");
    for (let index = 0; index < choices.length; index += 1) {
      console.log(formatChoice(choices[index], index, defaultId));
    }

    const answer = (await rl.question(`${question} [${defaultId}]: `)).trim().toLowerCase();
    const value = answer || defaultId;
    const byNumber = Number.parseInt(value, 10);
    const choice = Number.isInteger(byNumber)
      ? choices[byNumber - 1]
      : choices.find((candidate) => candidate.id === value);

    if (choice) {
      return choice.id;
    }

    console.log(`Choose one of: ${choices.map((choice) => choice.id).join(", ")}`);
  }
}

async function promptEditors(rl, defaultValue = "codex") {
  console.log("");
  console.log("Editor integrations:");
  console.log("  all - generate rules for every supported editor");
  console.log("  common picks - codex | cursor | codex,cursor | copilot | claude");
  console.log(`  supported - ${supportedEditors.join(", ")}`);

  while (true) {
    const answer = (await rl.question(`Editors to configure [${defaultValue}]: `)).trim();
    const value = answer || defaultValue;

    try {
      return parseEditorSelection(["--editors", value]);
    } catch (error) {
      console.log(error.message);
    }
  }
}

async function promptSetupOptions(root) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Interactive setup requires a TTY. Run `ctx setup --template frontend --editors codex,cursor` instead.");
  }

  const discovery = discoverWorkspace(root);
  const inferredTemplate = inferTemplate(discovery);
  const rl = createInterface({ input, output });

  try {
    console.log("Cortexa setup");
    console.log(`Project: ${discovery.name}`);
    console.log(`Detected template: ${inferredTemplate}`);

    const template = await promptChoice(
      rl,
      "Template",
      [
        { id: "auto", description: `use detected template (${inferredTemplate})` },
        ...templateRegistry.map((template) => ({ id: template.id, description: template.description }))
      ],
      "auto"
    );
    const editors = await promptEditors(rl);

    return { template, editors };
  } finally {
    rl.close();
  }
}

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

function setupSkill(root, skill) {
  const skillPath = join(root, ".cortexa", "skills", skill.id, "SKILL.md");
  return {
    path: skillPath,
    status: writeIfMissing(skillPath, skillDocument(skill))
  };
}

function setupStarterKit(root, template) {
  const kit = starterKits[template.id];
  if (!kit) {
    return [];
  }

  const results = [];
  for (const skill of kit.skills) {
    const written = setupSkill(root, skill);
    results.push({
      type: "skill",
      id: skill.id,
      path: relative(root, written.path),
      status: written.status
    });
  }

  for (const agent of kit.agents) {
    const path = join(root, ".cortexa", "agents", `${agent.id}.md`);
    results.push({
      type: "agent",
      id: agent.id,
      path: relative(root, path),
      status: writeIfMissing(path, agentProfile(agent))
    });
  }

  writeJson(join(root, ".cortexa", "starter-kit.json"), {
    version: 1,
    template: template.id,
    skills: kit.skills.map((skill) => skill.id),
    agents: kit.agents.map((agent) => agent.id)
  });

  return results;
}

function setupProjectKit(root, template) {
  const discovery = discoverWorkspace(root);
  return writeProjectKit(root, discovery, template, { updateSpecs: false });
}

function updateProjectKit(root, templateValue = "auto") {
  const discovery = discoverWorkspace(root);
  const template = resolveTemplate(templateValue, discovery);
  const results = writeProjectKit(root, discovery, template, { updateSpecs: true });

  return { path: join(root, ".cortexa", "project-kit.json"), template, results };
}

function writeProjectKit(root, discovery, template, options = {}) {
  const results = writeRuntimeStructure(root, discovery, template);

  for (const spec of projectSpecRegistry) {
    const path = join(root, ".cortexa", "specs", spec.id);
    results.push({
      type: "spec",
      id: spec.id,
      path: relative(root, path),
      status: writeProjectSpec(path, spec, discovery, template, { update: Boolean(options.updateSpecs) })
    });
  }

  for (const skill of projectSkillRegistry) {
    const written = setupSkill(root, skill);
    results.push({
      type: "skill",
      id: skill.id,
      path: relative(root, written.path),
      status: written.status
    });
  }

  for (const agent of projectAgentRegistry) {
    const path = join(root, ".cortexa", "agents", `${agent.id}.md`);
    results.push({
      type: "agent",
      id: agent.id,
      path: relative(root, path),
      status: writeIfMissing(path, agentProfile(agent))
    });
  }

  writeProjectKitRegistry(root, discovery, template);
  return results;
}

function writeRuntimeStructure(root, discovery, template) {
  const results = [];
  const cortexaDir = join(root, ".cortexa");
  const manifest = createContextManifest(root, discovery, template);

  const docs = [
    {
      type: "context",
      id: "readme",
      path: join(cortexaDir, "contexts", "README.md"),
      content: contextsReadmeDocument()
    },
    {
      type: "adapter",
      id: "readme",
      path: join(cortexaDir, "adapters", "README.md"),
      content: adaptersReadmeDocument()
    },
    {
      type: "graph",
      id: "readme",
      path: join(cortexaDir, "graphs", "README.md"),
      content: graphsReadmeDocument()
    },
    {
      type: "workflow",
      id: "context-flow",
      path: join(cortexaDir, "workflows", "context-flow.md"),
      content: workflowDocument()
    },
    {
      type: "runtime",
      id: "readme",
      path: join(cortexaDir, "runtime", "README.md"),
      content: runtimeReadmeDocument()
    },
    {
      type: "runtime",
      id: "sessions",
      path: join(cortexaDir, "runtime", "sessions", "README.md"),
      content: sessionsReadmeDocument()
    },
    {
      type: "ownership",
      id: "readme",
      path: join(cortexaDir, "ownership", "README.md"),
      content: ownershipReadmeDocument()
    },
    {
      type: "multi-agent",
      id: "readme",
      path: join(cortexaDir, "multi-agent", "README.md"),
      content: multiAgentReadmeDocument()
    },
    {
      type: "multi-agent",
      id: "collaboration",
      path: join(cortexaDir, "multi-agent", "collaboration.md"),
      content: multiAgentCollaborationDocument()
    }
  ];

  for (const [layer, asset] of Object.entries(manifest.generatedAssets)) {
    if (!asset.enabled || !asset.createDirectory || !asset.readme) {
      continue;
    }

    docs.push({
      type: layer,
      id: "readme",
      path: join(cortexaDir, layer, "README.md"),
      content: asset.readme
    });
  }

  for (const doc of docs) {
    results.push({
      type: doc.type,
      id: doc.id,
      path: relative(root, doc.path),
      status: writeIfMissing(doc.path, doc.content)
    });
  }

  const generated = [
    {
      type: "context",
      id: "context-packet-schema",
      path: join(cortexaDir, "contexts", "context-packet.schema.json"),
      value: contextPacketSchemaDocument()
    },
    {
      type: "adapter",
      id: "discovery",
      path: join(cortexaDir, "adapters", "discovery.json"),
      value: adapterDiscoverySnapshot(discovery, template)
    },
    {
      type: "graph",
      id: "repo-graph",
      path: join(cortexaDir, "graphs", "repo-graph.json"),
      value: repoGraphSnapshot(discovery)
    },
    {
      type: "multi-agent",
      id: "protocol",
      path: join(cortexaDir, "multi-agent", "protocol.json"),
      value: multiAgentProtocolDocument([...projectAgentRegistry, ...Object.values(starterKits).flatMap((kit) => kit.agents || [])])
    },
    {
      type: "multi-agent",
      id: "handoff-schema",
      path: join(cortexaDir, "multi-agent", "handoff.schema.json"),
      value: agentHandoffSchemaDocument()
    }
  ];

  for (const item of generated) {
    writeJson(item.path, item.value);
    results.push({
      type: item.type,
      id: item.id,
      path: relative(root, item.path),
      status: "updated"
    });
  }

  const ownershipPath = join(cortexaDir, "ownership", "ownership-map.json");
  results.push({
    type: "ownership",
    id: "ownership-map",
    path: relative(root, ownershipPath),
    status: writeIfMissing(ownershipPath, `${JSON.stringify(ownershipMapSnapshot(discovery), null, 2)}\n`)
  });

  const manifestPath = join(cortexaDir, "context-manifest.json");
  writeJson(manifestPath, stripManifestRuntimeFields(manifest));
  results.push({
    type: "manifest",
    id: "context-manifest",
    path: relative(root, manifestPath),
    status: "updated"
  });

  mkdirSync(join(cortexaDir, "runtime", "cache"), { recursive: true });
  return results;
}

function createContextManifest(root, discovery, template) {
  const capabilities = detectContextCapabilities(root, discovery);
  const coreLayers = ["agents", "skills", "specs", "contexts", "adapters", "graphs", "runtime", "ownership", "multi-agent"];
  const generatedAssets = {
    agents: managedAsset("human", "core collaboration entrypoint", false, true, null, false),
    skills: managedAsset("human", "core engineering capability entrypoint", false, true, null, false),
    specs: managedAsset("hybrid", "core project conventions with managed adapter snapshots", false, true, null, false),
    contexts: managedAsset("machine", "Context Packet definitions are required by ctx pack", true, true, null, false),
    adapters: managedAsset("machine", "adapter discovery snapshot is required by workspace discovery", true, true, null, false),
    graphs: managedAsset("machine", "repo graph snapshot is required by graph-driven context resolve", true, true, null, false),
    runtime: managedAsset("machine", "runtime sessions and cache are reserved for task isolation", true, true, null, false),
    ownership: managedAsset("human", "ownership map guides context boundaries and should preserve team edits", false, true, null, false),
    "multi-agent": managedAsset("hybrid", "multi-agent collaboration protocol and handoff schema", true, true, null, false),
    workflows: managedAsset("human", "default Context Flow is useful for all project types", false, true),
    contracts: managedAsset("human", capabilityReason(capabilities, "contracts"), false, capabilities.includes("contracts"), contractsReadmeDocument()),
    domains: managedAsset("human", capabilityReason(capabilities, "domains"), false, capabilities.includes("domains"), domainsReadmeDocument()),
    memory: managedAsset("human", capabilityReason(capabilities, "memory"), false, capabilities.includes("memory"), memoryReadmeDocument()),
    reports: managedAsset("machine", "reports are created by analyze, audit, or review commands", true, false, reportsReadmeDocument())
  };
  const enabledLayers = [
    ...coreLayers,
    "workflows",
    ...["contracts", "domains", "memory", "reports"].filter((layer) => generatedAssets[layer].enabled)
  ];

  return {
    version: 1,
    template: template.id,
    updatedAt: new Date().toISOString(),
    lifecycle: {
      human: "人工维护资产。setup/update 只创建缺失文件，不覆盖团队修改。",
      machine: "机器生成资产。setup/update 或分析命令可以刷新。",
      hybrid: "混合资产。仅刷新受管区块，保留人工内容。"
    },
    enabledLayers,
    detectedCapabilities: capabilities,
    generatedAssets
  };
}

function managedAsset(owner, reason, refreshable, enabled = true, readme = null, createDirectory = enabled) {
  return {
    enabled,
    owner,
    refreshable,
    createDirectory,
    reason,
    readme
  };
}

function stripManifestRuntimeFields(manifest) {
  return {
    ...manifest,
    generatedAssets: Object.fromEntries(
      Object.entries(manifest.generatedAssets).map(([layer, asset]) => [
        layer,
        {
          enabled: asset.enabled,
          owner: asset.owner,
          refreshable: asset.refreshable,
          createDirectory: asset.createDirectory,
          reason: asset.reason
        }
      ])
    )
  };
}

function capabilityReason(capabilities, layer) {
  if (capabilities.includes(layer)) {
    return `detected ${layer} signals in this project`;
  }

  return `no ${layer} signals detected yet`;
}

function detectContextCapabilities(root, discovery) {
  const capabilities = new Set();
  const packageJson = readJson(join(root, "package.json"));
  const files = listWorkspaceFiles(root, 1000);
  const names = new Set(files.map((file) => file.toLowerCase()));
  const includesFile = (...candidates) => candidates.some((candidate) => names.has(candidate.toLowerCase()));
  const includesPattern = (pattern) => files.some((file) => pattern.test(file));

  if (discovery.frameworks.some((framework) => ["vue", "nuxt", "react", "nextjs", "vite"].includes(framework))) {
    capabilities.add("frontend");
  }

  if (discovery.frameworks.includes("nest") || discovery.semanticEntrypoints.some((entrypoint) => entrypoint.kind === "server-entry")) {
    capabilities.add("backend");
  }

  if (discovery.workspace !== "single-package" || discovery.packages.length > 0) {
    capabilities.add("monorepo");
  }

  if (
    includesFile("openapi.json", "openapi.yaml", "openapi.yml", "swagger.json", "swagger.yaml", "swagger.yml", "schema.prisma") ||
    includesPattern(/(^|\/)(schema|api|openapi|swagger)\.(graphql|gql|proto)$/i) ||
    includesPattern(/\.(graphql|gql|proto)$/i)
  ) {
    capabilities.add("contracts");
  }

  if (
    discovery.features.some((feature) => ["feature", "module-feature"].includes(feature.kind)) ||
    files.some((file) => /(^|\/)(domain|domains|modules|features)\//i.test(file))
  ) {
    capabilities.add("domains");
  }

  if (
    includesPattern(/(^|\/)\.github\/workflows\//i) ||
    includesFile(".gitlab-ci.yml", ".gitlab-ci.yaml") ||
    discovery.semanticEntrypoints.some((entrypoint) => entrypoint.kind === "script" && /deploy|release|migrat|ci|test|build/i.test(entrypoint.command || "")) ||
    Object.values(packageJson?.scripts || {}).some((script) => /deploy|release|migrat|ci|test|build/i.test(script))
  ) {
    capabilities.add("workflows");
  }

  if (
    includesFile("CHANGELOG.md", "HISTORY.md") ||
    files.some((file) => /(^|\/)(adr|adrs|decisions|decision-records)\//i.test(file)) ||
    files.some((file) => /(^|\/)docs\/(adr|adrs|decisions)\//i.test(file))
  ) {
    capabilities.add("memory");
  }

  return [...capabilities].sort();
}

function listWorkspaceFiles(root, limit = 1000) {
  const ignored = new Set([".git", ".cortexa", "node_modules", "dist", "build", "coverage", ".next", ".nuxt", "out"]);
  const files = [];

  function visit(directory, prefix = "") {
    if (files.length >= limit || !existsSync(directory)) {
      return;
    }

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (files.length >= limit) {
        return;
      }

      const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      const childPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) {
          visit(childPath, childPrefix);
        }
        continue;
      }

      if (entry.isFile()) {
        files.push(childPrefix);
      }
    }
  }

  visit(root);
  return files.sort();
}

function adapterDiscoverySnapshot(discovery, template) {
  return {
    version: 1,
    template: template.id,
    updatedAt: new Date().toISOString(),
    project: discovery.name,
    packageManager: discovery.packageManager,
    framework: discovery.framework,
    frameworks: discovery.frameworks,
    workspace: discovery.workspace,
    workspaces: discovery.workspaces,
    adapters: discovery.adapters,
    directories: discovery.directories,
    languages: discovery.languages,
    sourceSummary: discovery.sourceSummary,
    packages: discovery.packages,
    entrypoints: discovery.semanticEntrypoints,
    features: discovery.features
  };
}

function repoGraphSnapshot(discovery) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    project: discovery.name,
    nodes: {
      packages: discovery.packages.map((pkg) => ({
        id: pkg.name,
        path: pkg.path,
        framework: pkg.framework
      })),
      entrypoints: discovery.semanticEntrypoints.map((entrypoint) => ({
        id: entrypoint.path,
        path: entrypoint.path,
        kind: entrypoint.kind
      })),
      features: discovery.features.map((feature) => ({
        id: feature.path,
        name: feature.name,
        path: feature.path,
        kind: feature.kind
      }))
    },
    edges: {
      dependencies: discovery.dependencyGraph || {},
      sourceImports: discovery.sourceGraph || {}
    }
  };
}

function ownershipMapSnapshot(discovery) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    project: discovery.name,
    owners: [],
    boundaries: {
      packages: discovery.packages.map((pkg) => ({
        path: pkg.path,
        owner: null,
        notes: ""
      })),
      features: discovery.features.map((feature) => ({
        path: feature.path,
        owner: null,
        notes: ""
      })),
      lowTrust: [],
      generated: ["dist", "build", "coverage"]
    },
    openQuestions: [
      "哪些包负责公共 API、共享工具和面向用户的应用？",
      "哪些目录应视为生成产物、历史代码或低可信上下文？",
      "常见变更的最低验证命令是什么？"
    ]
  };
}

function writeProjectKitRegistry(root, discovery, template) {
  const manifest = readJson(join(root, ".cortexa", "context-manifest.json"));
  writeJson(join(root, ".cortexa", "project-kit.json"), {
    version: 1,
    template: template.id,
    updatedAt: new Date().toISOString(),
    generatedFrom: {
      adapters: discovery.adapters,
      framework: discovery.framework,
      frameworks: discovery.frameworks,
      workspace: discovery.workspace,
      packageManager: discovery.packageManager,
      packages: discovery.packages.map((pkg) => ({
        name: pkg.name,
        path: pkg.path,
        framework: pkg.framework
      })),
      features: discovery.features.map((feature) => ({
        name: feature.name,
        path: feature.path,
        kind: feature.kind
      })),
      entrypoints: discovery.semanticEntrypoints.map((entrypoint) => ({
        path: entrypoint.path,
        kind: entrypoint.kind
      }))
    },
    specs: projectSpecRegistry.map((spec) => spec.id),
    skills: projectSkillRegistry.map((skill) => skill.id),
    agents: projectAgentRegistry.map((agent) => agent.id),
    contexts: ["context-packet.schema.json"],
    adapters: ["discovery.json"],
    graphs: ["repo-graph.json"],
    multiAgent: ["collaboration.md", "protocol.json", "handoff.schema.json"],
    workflows: ["context-flow.md"],
    ownership: ["ownership-map.json"],
    enabledLayers: manifest?.enabledLayers || [],
    detectedCapabilities: manifest?.detectedCapabilities || []
  });
}

function writeProjectSpec(path, spec, discovery, template, options = {}) {
  mkdirSync(path, { recursive: true });

  const requirementsPath = join(path, "requirements.md");
  const designPath = join(path, "design.md");
  const tasksPath = join(path, "tasks.md");
  const statuses = [
    writeIfMissing(requirementsPath, specRequirementsDocument(spec, discovery, template)),
    writeIfMissing(designPath, specDesignDocument(spec, discovery, template)),
    writeIfMissing(tasksPath, specTasksDocument(spec, discovery, template))
  ];

  if (!options.update) {
    return summarizeStatuses(statuses);
  }

  const current = readFileSync(designPath, "utf8");
  const snapshot = adapterSnapshot(spec, discovery, template);
  const start = current.indexOf(specSnapshotStart);
  const end = current.indexOf(specSnapshotEnd);

  if (start !== -1 && end !== -1 && end > start) {
    const afterEnd = end + specSnapshotEnd.length;
    writeFileSync(designPath, `${current.slice(0, start)}${snapshot}${current.slice(afterEnd)}`);
    statuses[1] = "updated adapter snapshot";
    return summarizeStatuses(statuses);
  }

  writeFileSync(designPath, `${current.trimEnd()}\n\n${snapshot}\n`);
  statuses[1] = "added adapter snapshot";
  return summarizeStatuses(statuses);
}

function summarizeStatuses(statuses) {
  const unique = [...new Set(statuses)];
  return unique.length === 1 ? unique[0] : unique.join("; ");
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

function listEditorIntegrations() {
  for (const integration of integrationRegistry) {
    console.log(`${integration.id.padEnd(12)} ${integration.path} (${integration.label})`);
  }
}

function listTemplates() {
  console.log("auto         Detect the best template from the current project.");
  for (const template of templateRegistry) {
    console.log(`${template.id.padEnd(12)} ${template.description}`);
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
  ctx setup [--template auto|minimal|frontend|backend|monorepo] [--editors codex|cursor|all|codex,cursor,...]
  ctx setup --interactive
  ctx setup --list-editors
  ctx setup --list-templates
  ctx update [--template auto|minimal|frontend|backend|monorepo]
  ctx teardown [--purge]
  ctx discover
  ctx pack <task>

Commands:
  help      Show this help.
  version   Show CLI version.
  doctor    Validate workspace skeleton.
  init      Initialize workspace metadata.
  setup     Initialize metadata and add editor-native context rules. Use --interactive for guided setup.
  update    Refresh Cortexa adapter snapshots and add missing project specs, skills, and agents.
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
    try {
      const workspace = initializeWorkspace(cwd, parseTemplateSelection(args));
      console.log(`initialized ${relative(cwd, workspace.path)} (${workspace.template.id} template)`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  },
  async setup() {
    try {
      if (args.includes("--list-editors")) {
        listEditorIntegrations();
        return;
      }

      if (args.includes("--list-templates")) {
        listTemplates();
        return;
      }

      const interactive = hasFlag(args, "--interactive", "-i");
      const options = interactive
        ? await promptSetupOptions(cwd)
        : {
            template: parseTemplateSelection(args),
            editors: parseEditorSelection(args)
          };
      const workspace = initializeWorkspace(cwd, options.template);
      const results = setupEditors(cwd, options.editors);
      const projectKit = setupProjectKit(cwd, workspace.template);
      const starters = setupStarterKit(cwd, workspace.template);

      console.log(`initialized ${relative(cwd, workspace.path)} (${workspace.template.id} template)`);
      for (const result of results) {
        console.log(`${result.editor}: ${result.status} ${result.path}`);
      }
      for (const item of projectKit) {
        console.log(`${item.type} ${item.id}: ${item.status} ${item.path}`);
      }
      for (const starter of starters) {
        console.log(`${starter.type} ${starter.id}: ${starter.status} ${starter.path}`);
      }
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  },
  update() {
    try {
      const projectKit = updateProjectKit(cwd, parseTemplateSelection(args));

      console.log(`updated ${relative(cwd, projectKit.path)} (${projectKit.template.id} template)`);
      for (const item of projectKit.results) {
        console.log(`${item.type} ${item.id}: ${item.status} ${item.path}`);
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
  await commands[command]();
}
