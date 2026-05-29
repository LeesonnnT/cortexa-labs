# Cortexa Labs

Cortexa adds structured AI workspace context to an existing project.

## Quick Start

```bash
npm create cortexa@latest
```

The initializer installs `@cortexa-labs/cli`, asks for your project template and AI editor integrations, then writes the selected context files.

## Common Commands

```bash
npm create cortexa@latest -- --yes
npm create cortexa@latest -- --template frontend --editors codex,cursor
npx --no-install ctx discover
npx --no-install ctx pack "<task>"
npx --no-install ctx update
npx --no-install ctx teardown
```

`--yes` uses automatic template detection and the Codex integration. Pass `--template` and `--editors` when you already know the setup you want.

## Uninstall

To remove Cortexa from a project, first clean up generated editor integrations and metadata:

```bash
npx --no-install ctx teardown --purge
```

Then uninstall the local CLI dependency:

```bash
npm uninstall --save-dev @cortexa-labs/cli
```

If you installed the CLI globally, remove it with:

```bash
npm uninstall -g @cortexa-labs/cli
```

## What Gets Created

Depending on your choices, Cortexa creates:

- `.cortexa/workspace.json`
- `.cortexa/project-kit.json`
- project specs under `.cortexa/specs/<spec>/requirements.md`, `design.md`, and `tasks.md`
- reusable project skills under `.cortexa/skills/<skill>/SKILL.md` and Claude-style agents under `.cortexa/agents/<agent>.md`
- `AGENTS.md` or editor-native rule files
- optional frontend starter skills and agents under `.cortexa/skills/` and `.cortexa/agents/`

Skills use a `SKILL.md` directory entrypoint, agents use Claude-style Markdown files with YAML frontmatter, and specs use Kiro-style `requirements.md`, `design.md`, and `tasks.md` files.

Run `ctx update` after adding packages, features, entrypoints, or dependencies. It refreshes Cortexa-managed adapter snapshots while preserving project-specific spec text.

## Packages

- `create-cortexa` - guided initializer used by `npm create cortexa@latest`
- `@cortexa-labs/cli` - local `ctx` command installed into your project

## Repository Layout

- `apps/` - initializer, CLI, and future dashboard entrypoints
- `workspace/` - runtime, graph, resolver, ownership
- `adapters/` - framework/project adapters
- `skills/` - normalized engineering skills
- `workflows/` - task pipelines
- `packages/` - shared utilities
