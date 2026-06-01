import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join } from "node:path";
import { discoverWorkspace } from "../workspace/discovery.js";
import { writeJson } from "../core/fs.js";
import { defaultEditorSelection, editorAliases, supportedEditors } from "../editor-integrations/index.js";
import { supportedTemplates, templateAliases } from "../registries/index.js";

export function inferTemplate(discovery) {
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

export function resolveTemplate(value, discovery) {
  const requested = (value || "auto").toLowerCase().trim();
  const resolved = templateAliases.get(requested)?.[0] || requested;
  const id = resolved === "auto" ? inferTemplate(discovery) : resolved;
  const template = templateRegistry.find((candidate) => candidate.id === id);

  if (!template) {
    throw new Error(`Unsupported template: ${requested}. Choose from ${supportedTemplates.join(", ")} or auto.`);
  }

  return template;
}

export function parseTemplateSelection(values) {
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

export function existingScope(discovery, template) {
  const discovered = discovery.entrypoints;
  const templateScope = template.defaults.defaultScope.filter((scope) => existsSync(join(discovery.root, scope)));
  const scope = [...discovered, ...templateScope];

  if (scope.length > 0) {
    return [...new Set(scope)];
  }

  return template.defaults.defaultScope;
}

export function initializeWorkspace(root, templateValue = "auto") {
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

export function parseEditorSelection(values) {
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

export function hasFlag(values, ...flags) {
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

export async function promptSetupOptions(root) {
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
