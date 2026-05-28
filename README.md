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
npx --no-install ctx teardown
```

`--yes` uses automatic template detection and the Codex integration. Pass `--template` and `--editors` when you already know the setup you want.

## What Gets Created

Depending on your choices, Cortexa creates:

- `.cortexa/workspace.json`
- `AGENTS.md` or editor-native rule files
- optional frontend starter skills and agents under `.cortexa/skills/` and `.cortexa/agents/`

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
