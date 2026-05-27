#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
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

const templateRegistry = [
  {
    id: "minimal",
    label: "Minimal",
    description: "General purpose context defaults for small or mixed projects.",
    defaults: {
      contextStrategy: "balanced",
      defaultScope: [],
      suggestedScopes: ["src", "lib", "app", "packages"],
      qualityGates: ["ctx discover", "ctx pack <task>"]
    }
  },
  {
    id: "frontend",
    label: "Frontend",
    description: "Frontend apps with routes, views, components, and browser-facing workflows.",
    defaults: {
      contextStrategy: "feature-first",
      defaultScope: ["src", "app", "pages", "components", "views"],
      suggestedScopes: ["src/views", "src/pages", "src/components", "app", "pages"],
      qualityGates: ["ctx discover", "ctx pack <task>", "npm run build"]
    }
  },
  {
    id: "backend",
    label: "Backend",
    description: "API services, server modules, jobs, and Node runtime projects.",
    defaults: {
      contextStrategy: "service-first",
      defaultScope: ["src", "server", "api", "routes"],
      suggestedScopes: ["src", "server", "src/modules", "src/routes", "api"],
      qualityGates: ["ctx discover", "ctx pack <task>", "npm test"]
    }
  },
  {
    id: "monorepo",
    label: "Monorepo",
    description: "Workspaces with multiple apps/packages and internal dependencies.",
    defaults: {
      contextStrategy: "package-first",
      defaultScope: ["apps", "packages"],
      suggestedScopes: ["apps/*", "packages/*", "workspace/*"],
      qualityGates: ["ctx discover", "ctx pack <task>", "npm run build"]
    }
  }
];

const templateAliases = new Map([
  ["auto", ["auto"]],
  ["default", ["auto"]],
  ["basic", ["minimal"]],
  ["front-end", ["frontend"]],
  ["web", ["frontend"]],
  ["vue", ["frontend"]],
  ["react", ["frontend"]],
  ["next", ["frontend"]],
  ["nextjs", ["frontend"]],
  ["server", ["backend"]],
  ["api", ["backend"]],
  ["node", ["backend"]],
  ["workspace", ["monorepo"]],
  ["packages", ["monorepo"]]
]);

const supportedTemplates = templateRegistry.map((template) => template.id).sort();

const starterKits = {
  frontend: {
    skills: [
      {
        id: "component-implementation",
        description: "Build or update reusable UI components with states, accessibility, and styling consistency.",
        instructions: [
          "Locate the closest existing component pattern before adding a new component.",
          "Cover loading, empty, error, disabled, and interactive states when relevant.",
          "Preserve accessibility semantics and keyboard behavior.",
          "Validate with the project's available typecheck, test, lint, or build command."
        ]
      },
      {
        id: "page-feature-delivery",
        description: "Deliver a frontend page or feature through route, data, state, and UI boundaries.",
        instructions: [
          "Identify the route or feature entrypoint and its existing data-flow conventions.",
          "Keep requests, state ownership, display components, and user feedback aligned with local patterns.",
          "Check responsive layout and user-visible failure states.",
          "Summarize affected routes, APIs, and validation performed."
        ]
      },
      {
        id: "design-system",
        description: "Extend design-system primitives, tokens, and composable UI patterns consistently.",
        instructions: [
          "Reuse existing tokens, variants, slots, and composition conventions.",
          "Avoid feature-specific behavior inside reusable design primitives.",
          "Document new variants or usage constraints when the public component surface changes.",
          "Check visual states, theming, and backward compatibility."
        ]
      },
      {
        id: "responsive-layout",
        description: "Build layouts that remain usable across mobile, tablet, desktop, and dense content states.",
        instructions: [
          "Follow the project's breakpoint, spacing, grid, and overflow conventions.",
          "Check long labels, empty content, large tables, and narrow viewports.",
          "Prefer layout primitives over duplicated per-page CSS.",
          "Validate interaction reachability and readable information hierarchy."
        ]
      },
      {
        id: "form-validation",
        description: "Implement frontend forms with validation, submission state, and reliable user feedback.",
        instructions: [
          "Reuse the local form library, schemas, validation rules, and field components.",
          "Handle initialization, dirty state, client/server validation, submit loading, and retries.",
          "Preserve accessible labels and error announcements.",
          "Avoid silently dropping user input on request failures."
        ]
      },
      {
        id: "api-integration",
        description: "Connect UI features to APIs with typed contracts, loading behavior, and error handling.",
        instructions: [
          "Identify the project's request client, query cache, types, and authentication handling.",
          "Keep request transformation separate from presentation where local patterns support it.",
          "Implement loading, empty, error, stale, and mutation feedback states.",
          "Review cache invalidation, cancellation, races, and permission failures."
        ]
      },
      {
        id: "state-management",
        description: "Model local and shared frontend state with predictable ownership and updates.",
        instructions: [
          "Keep ephemeral UI state local unless multiple consumers require shared ownership.",
          "Reuse the installed store, hooks, composables, or context conventions.",
          "Make derived values explicit and avoid duplicated sources of truth.",
          "Check navigation, refresh, concurrent updates, and persistence behavior."
        ]
      },
      {
        id: "accessibility-audit",
        description: "Improve keyboard access, semantics, focus handling, and assistive-technology behavior.",
        instructions: [
          "Use native elements and semantics before custom ARIA behavior.",
          "Check focus order, dialogs, menus, forms, live feedback, and keyboard-only operation.",
          "Preserve visible focus and sufficient information beyond color alone.",
          "Report limitations that require browser or screen-reader validation."
        ]
      },
      {
        id: "frontend-performance",
        description: "Optimize frontend rendering, bundles, assets, and data loading without behavior loss.",
        instructions: [
          "Find measurable hot paths or bundle/data-loading costs before optimizing.",
          "Limit avoidable rerenders, excessive watchers, heavy dependencies, and duplicated requests.",
          "Apply lazy loading, memoization, caching, or virtualization only where justified.",
          "Verify loading behavior and note the measurement used for confidence."
        ]
      },
      {
        id: "frontend-testing",
        description: "Add focused tests for components, user flows, and frontend regressions.",
        instructions: [
          "Follow the project's existing test runner, utilities, fixtures, and query style.",
          "Assert behavior from a user's perspective for important interactions.",
          "Cover bug regressions, critical state transitions, and validation/error behavior.",
          "Keep mocks bounded to external boundaries rather than implementation detail."
        ]
      },
      {
        id: "build-debugging",
        description: "Diagnose frontend lint, typecheck, bundling, runtime, and dependency integration failures.",
        instructions: [
          "Capture the exact failure and identify whether it is config, types, build, runtime, or dependency related.",
          "Trace the smallest responsible module or configuration path.",
          "Change only the necessary fix and avoid masking diagnostics.",
          "Rerun the narrow failure plus the relevant build validation."
        ]
      },
      {
        id: "ui-review",
        description: "Review frontend changes for behavior, usability, maintainability, and regression risks.",
        instructions: [
          "Prioritize runtime bugs, state edge cases, accessibility failures, and missing tests.",
          "Inspect component reuse and unexpected styling or layout regressions.",
          "Ground findings in specific files and user-observable impact.",
          "State residual validation gaps when no issue is found."
        ]
      }
    ],
    agents: [
      {
        id: "frontend-builder",
        title: "Frontend Builder",
        role: "Implement frontend product changes with local component, routing, styling, and data-fetching conventions.",
        recommendedSkills: ["component-implementation", "page-feature-delivery", "responsive-layout", "form-validation"]
      },
      {
        id: "design-system-maintainer",
        title: "Design System Maintainer",
        role: "Create and maintain reusable primitives, tokens, variants, documentation, and consistent visual behavior.",
        recommendedSkills: ["design-system", "component-implementation", "responsive-layout", "accessibility-audit"]
      },
      {
        id: "frontend-data-integrator",
        title: "Frontend Data Integrator",
        role: "Implement request, state, cache, form submission, and data-driven interaction flows.",
        recommendedSkills: ["api-integration", "state-management", "form-validation", "page-feature-delivery"]
      },
      {
        id: "accessibility-specialist",
        title: "Accessibility Specialist",
        role: "Audit and improve frontend semantics, keyboard interaction, focus behavior, and inclusive feedback.",
        recommendedSkills: ["accessibility-audit", "component-implementation", "ui-review"]
      },
      {
        id: "frontend-performance-engineer",
        title: "Frontend Performance Engineer",
        role: "Investigate and improve rendering, loading, assets, bundles, and runtime responsiveness.",
        recommendedSkills: ["frontend-performance", "api-integration", "build-debugging"]
      },
      {
        id: "frontend-test-engineer",
        title: "Frontend Test Engineer",
        role: "Create focused behavioral checks and diagnose frontend build or regression failures.",
        recommendedSkills: ["frontend-testing", "build-debugging", "ui-review"]
      },
      {
        id: "frontend-reviewer",
        title: "Frontend Reviewer",
        role: "Review frontend changes for user-visible regressions, state correctness, accessibility, and test coverage.",
        recommendedSkills: ["ui-review", "accessibility-audit", "frontend-performance", "frontend-testing"]
      }
    ]
  }
};

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

async function promptEditors(rl, defaultValue = "codex,cursor") {
  console.log("");
  console.log("Editor integrations:");
  console.log("  all - generate rules for every supported editor");
  console.log("  common picks - codex,cursor | codex | cursor | copilot | claude");
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
3. If \`.cortexa/starter-kit.json\` exists, use its matching skill or agent profile for the task.
4. Work from that packet and expand scope only when the task requires it.

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

function skillManifest(skill) {
  return `${JSON.stringify({
    name: skill.id,
    description: skill.description,
    instructions: skill.instructions
  }, null, 2)}\n`;
}

function agentProfile(agent) {
  return `# ${agent.title}

${agent.role}

## Recommended Skills

${agent.recommendedSkills.map((skill) => `- \`${skill}\``).join("\n")}

## Workflow

1. Run \`ctx pack "<task>"\` before broad exploration.
2. Read the matching skill manifest from \`.cortexa/skills/\`.
3. Follow repository conventions and report validation performed.
`;
}

function setupStarterKit(root, template) {
  const kit = starterKits[template.id];
  if (!kit) {
    return [];
  }

  const results = [];
  for (const skill of kit.skills) {
    const path = join(root, ".cortexa", "skills", `${skill.id}.json`);
    results.push({
      type: "skill",
      id: skill.id,
      path: relative(root, path),
      status: writeIfMissing(path, skillManifest(skill))
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
  ctx setup [--template auto|minimal|frontend|backend|monorepo] [--editors all|codex,cursor,kiro,trae,...]
  ctx setup --interactive
  ctx setup --list-editors
  ctx setup --list-templates
  ctx teardown [--purge]
  ctx discover
  ctx pack <task>

Commands:
  help      Show this help.
  version   Show CLI version.
  doctor    Validate workspace skeleton.
  init      Initialize workspace metadata.
  setup     Initialize metadata and add editor-native context rules. Use --interactive for guided setup.
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
      const starters = setupStarterKit(cwd, workspace.template);

      console.log(`initialized ${relative(cwd, workspace.path)} (${workspace.template.id} template)`);
      for (const result of results) {
        console.log(`${result.editor}: ${result.status} ${result.path}`);
      }
      for (const starter of starters) {
        console.log(`${starter.type} ${starter.id}: ${starter.status} ${starter.path}`);
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
