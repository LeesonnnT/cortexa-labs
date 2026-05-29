#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { analyzeProject, selectContextScope } from "./adapters/project/index.js";
import { adapterSnapshot, agentProfile, skillDocument, specDesignDocument, specRequirementsDocument, specSnapshotEnd, specSnapshotStart, specTasksDocument } from "./documents/index.js";
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
  const results = [];

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

function writeProjectKitRegistry(root, discovery, template) {
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
    agents: projectAgentRegistry.map((agent) => agent.id)
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
