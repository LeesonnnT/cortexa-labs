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
npx --no-install ctx setup --interactive
```

During install, Cortexa starts guided setup when npm provides an interactive terminal. When npm runs lifecycle scripts without an interactive terminal, Cortexa still completes a default setup automatically with the detected template and the Codex integration. If you already know the target setup, pass the options directly:

```bash
npm install --save-dev @cortexa-labs/cli
npx --no-install ctx setup --template frontend --editors codex
```

To force npm lifecycle scripts into the foreground for interactive prompts, use:

```bash
npm install --save-dev @cortexa-labs/cli --foreground-scripts
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
