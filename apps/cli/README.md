# @cortexa-labs/cli

CLI for workspace-centric context engineering.

## Install

```bash
npm install --save-dev @cortexa-labs/cli
```

During install, Cortexa starts guided setup when npm provides an interactive terminal. When npm runs lifecycle scripts without an interactive terminal, Cortexa still completes a default setup automatically with the detected template and the Codex integration. For a guided first run:

```bash
npx --no-install ctx setup --interactive
```

To force npm lifecycle scripts into the foreground for interactive prompts, use:

```bash
npm install --save-dev @cortexa-labs/cli --foreground-scripts
```

## Setup

Connect the installed CLI to Codex with the default lightweight setup:

```bash
npx --no-install ctx setup
```

Use `--interactive` to choose the project template and editor integrations from prompts:

```bash
npx --no-install ctx setup --interactive
```

Setup can seed `.cortexa/workspace.json` from a base template. Use `auto` to infer from the current project, or choose one explicitly:

```bash
npx --no-install ctx setup --template frontend
npx --no-install ctx setup --template backend
npx --no-install ctx setup --list-templates
```

Available templates:

- `minimal` - general purpose context defaults for small or mixed projects
- `frontend` - routes, views, components, and browser-facing workflows
- `backend` - API services, server modules, jobs, and Node runtime projects
- `monorepo` - multiple apps/packages and internal dependencies

The `frontend` template preinstalls commonly used profiles:

- Skills: components, pages, design systems, responsive layouts, forms, API integration, state management, accessibility, performance, testing, build debugging, and UI review in `.cortexa/skills/*.json`
- Agents: frontend builder, design-system maintainer, data integrator, accessibility specialist, performance engineer, test engineer, and reviewer in `.cortexa/agents/*.md`
- Registry: `.cortexa/starter-kit.json`

Generated starter profiles are created only when missing, so subsequent setup runs keep project-specific edits.

This creates `.cortexa/workspace.json` and `AGENTS.md` by default. Pass `--editors` to generate rules for more AI editors and coding agents, including:

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

Use `--editors codex,cursor` to enable selected targets, `--editors all` to generate every supported integration, or `--list-editors` to print the supported registry. Existing custom editor rule files are not overwritten, and generated rules can be refreshed by running `setup` again.

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
