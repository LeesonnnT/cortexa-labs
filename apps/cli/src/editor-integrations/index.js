export const defaultIntegrations = [
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

export const defaultEditorSelection = ["codex"];

export const editorAliases = new Map([
  ["all", defaultIntegrations],
  ["default", defaultEditorSelection],
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

export const supportedEditors = [...defaultIntegrations].sort();

export function createIntegrationRegistry({ cursorRule, kiroRule, markdownRule, windsurfRule }) {
  return [
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
}
