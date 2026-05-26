# @cortexa-labs/cli

CLI for workspace-centric context engineering.

## Install

```bash
npm install --save-dev @cortexa-labs/cli
```

## Setup

Connect the installed CLI to supported AI editors:

```bash
npx --no-install ctx setup
```

This creates `.cortexa/workspace.json` and integration rules for mainstream AI editors and coding agents, including:

- AGENTS.md-compatible agents: `AGENTS.md`
- Codex: `AGENTS.md`
- OpenCode: `AGENTS.md`
- Cursor: `.cursor/rules/cortexa-context.mdc`
- Kiro: `.kiro/steering/cortexa-context.md`
- Trae: `.trae/rules/cortexa-context.md`
- Windsurf: `.windsurf/rules/cortexa-context.md`
- Zed: `.rules`
- Claude Code: `CLAUDE.md`
- Gemini CLI: `GEMINI.md`
- GitHub Copilot / VS Code: `.github/copilot-instructions.md`
- Cline: `.clinerules/cortexa-context.md`
- Roo Code: `.roo/rules/cortexa-context.md`
- Aider: `CONVENTIONS.md`
- Amazon Q Developer: `.amazonq/rules/cortexa-context.md`
- JetBrains Junie: `.junie/guidelines.md`
- Continue: `.continue/rules/cortexa-context.md`

Use `--editors codex,cursor` to enable only selected targets, or `--list-editors` to print the supported registry. Existing custom editor rule files are not overwritten, and generated rules can be refreshed by running `setup` again.

For global CLI usage:

```bash
npm install -g @cortexa-labs/cli
ctx setup
```

## Teardown

Remove Cortexa editor integrations without touching project code:

```bash
npx --no-install ctx teardown
```

`teardown` removes only content between the Cortexa managed markers and deletes generated rule files that contain no other content. It also removes `.cortexa/integrations.json`, but keeps `.cortexa/workspace.json` so project discovery settings remain intact.

To remove all Cortexa metadata created by the CLI:

```bash
npx --no-install ctx teardown --purge
```

## Use

```bash
npx --no-install ctx discover
npx --no-install ctx pack billing-review
npx --no-install ctx doctor
```

`discover` runs the built-in project adapters and emits semantic fields such as `adapters`, `frameworks`, `features`, `packages`, `semanticEntrypoints`, and `dependencyGraph`.

Current adapter coverage:

- JavaScript / TypeScript source layout
- Vue / Nuxt and Vite Vue projects
- React / Next.js projects
- pnpm and package workspace monorepos
