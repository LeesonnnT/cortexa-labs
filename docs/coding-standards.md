# Coding Standards

## Thin Entry Points

CLI, application, and package entry files must stay thin. An entry point may parse process arguments, initialize runtime defaults, delegate to command or application modules, and set top-level process error handling.

Entry points must not become "fat entry" files. They must not contain domain logic, file generation workflows, adapter discovery, business rules, command implementations, or large helper groups that belong to a focused module.

When an entry file starts to coordinate more than startup concerns, split the behavior by responsibility:

- `commands/` for CLI command implementations and output formatting.
- `core/` for shared low-level utilities.
- `workspace/` for workspace discovery and lifecycle state.
- `context/` for context packet selection and compilation.
- `project-kit/` for generated project assets and manifests.
- `editors/` for editor integration rules.
- `setup/` for setup option parsing and interactive prompts.

As a practical guardrail, an entry file should usually stay under 100 lines. If it needs more space, prefer extracting a named module before adding more behavior.
