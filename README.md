# Cortexa Labs

Monorepo for a context-first AI workspace manager.

## Layout

- `apps/` - CLI and future dashboard entrypoints
- `workspace/` - runtime, graph, resolver, ownership
- `adapters/` - framework/project adapters
- `skills/` - normalized engineering skills
- `workflows/` - task pipelines
- `packages/` - shared utilities

## Run

The publishable npm package lives in `apps/cli`.

## Install And Connect

Install the CLI in a project and connect its AI editor integrations in one step:

```bash
npm install --save-dev @cortexa-labs/cli
npx --no-install ctx setup
```

`ctx setup` initializes `.cortexa/workspace.json` and creates thin native rules for mainstream AI editors and coding agents. The rules tell each editor to obtain a minimal Context Packet through `ctx discover` and `ctx pack "<task>"`; business logic remains in the CLI.

`ctx discover` uses built-in adapters for JavaScript/TypeScript, Vue, React/Next.js, and pnpm monorepos, then exposes semantic features, packages, entrypoints, and dependency graph data to every editor integration.

To configure only selected editors:

```bash
npx --no-install ctx setup --editors codex,cursor
npx --no-install ctx setup --list-editors
```

Remove generated integrations without affecting project code:

```bash
npx --no-install ctx teardown
npx --no-install ctx teardown --purge
```
