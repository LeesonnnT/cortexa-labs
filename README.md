# Cortexa Labs

Monorepo for a context-first AI workspace manager.

## Layout

- `apps/` - CLI, initializer, and future dashboard entrypoints
- `workspace/` - runtime, graph, resolver, ownership
- `adapters/` - framework/project adapters
- `skills/` - normalized engineering skills
- `workflows/` - task pipelines
- `packages/` - shared utilities

## Run

The publishable npm packages live in `apps/cli` (`@cortexa-labs/cli`) and `apps/create-cortexa` (`create-cortexa`).

## Add To A Project

Use the initializer to install the CLI and configure your workspace in one guided flow:

```bash
npm create cortexa@latest
```

This prompts for the project template and target editors, installs `@cortexa-labs/cli` as a development dependency, and writes only the selected integrations.

For an automatic minimal setup:

```bash
npm create cortexa@latest -- --yes
```

If you already know the target setup, pass the options directly:

```bash
npm create cortexa@latest -- --template frontend --editors codex,cursor
```

`ctx setup` initializes `.cortexa/workspace.json` and creates a thin native rule for Codex by default. During setup, Cortexa chooses a base template automatically from the project shape, or you can select one explicitly:

```bash
npx --no-install ctx setup --template frontend
npx --no-install ctx setup --list-templates
```

Available templates are `minimal`, `frontend`, `backend`, and `monorepo`. The selected template seeds context strategy, default scopes, suggested scopes, and quality gates in `.cortexa/workspace.json`.

The `frontend` template also preinstalls a practical starter kit:

- Skills: `component-implementation`, `page-feature-delivery`, `design-system`, `responsive-layout`, `form-validation`, `api-integration`, `state-management`, `accessibility-audit`, `frontend-performance`, `frontend-testing`, `build-debugging`, `ui-review`
- Agents: `frontend-builder`, `design-system-maintainer`, `frontend-data-integrator`, `accessibility-specialist`, `frontend-performance-engineer`, `frontend-test-engineer`, `frontend-reviewer`

These profiles are written to `.cortexa/skills/`, `.cortexa/agents/`, and indexed in `.cortexa/starter-kit.json`. Existing customized profiles are kept when setup runs again. The editor rules tell each editor to obtain a minimal Context Packet through `ctx discover` and `ctx pack "<task>"`, then apply a relevant starter profile when available; business logic remains in the CLI.

`ctx discover` uses built-in adapters for JavaScript/TypeScript, Vue, React/Next.js, and pnpm monorepos, then exposes semantic features, packages, entrypoints, and dependency graph data to every editor integration.

To configure only selected editors:

```bash
npx --no-install ctx setup --editors codex,cursor
npx --no-install ctx setup --editors all
npx --no-install ctx setup --list-editors
```

Remove generated integrations without affecting project code:

```bash
npx --no-install ctx teardown
npx --no-install ctx teardown --purge
```

## Install CLI Only

Install only the command-line dependency when initialization will be performed separately:

```bash
npm install --save-dev @cortexa-labs/cli
npx --no-install ctx setup --interactive
```

## Publish

Publish the CLI before the initializer so new initializer runs install the updated CLI behavior:

```bash
cd apps/cli
npm publish --access public

cd ../create-cortexa
npm publish --access public
```
