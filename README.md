# Context Engineering CLI

Monorepo skeleton for a context-first AI workspace manager.

## Layout

- `apps/` - CLI and future dashboard entrypoints
- `workspace/` - runtime, graph, resolver, ownership
- `adapters/` - framework/project adapters
- `skills/` - normalized engineering skills
- `workflows/` - task pipelines
- `packages/` - shared utilities

## Run

```bash
node apps/cli/src/index.js help
```
