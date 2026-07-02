# Context Engineering CLI Technical Spec

## 1. Product Scope

Cortexa is a context-first CLI for AI-assisted engineering. It does not try to be a general agent platform, workflow platform, chat product, or model provider layer.

The product promise is:

> Given a real engineering task, `ctx pack` returns the smallest useful Context Packet with evidence, reading order, risk boundaries, and validation hints.

The first product loop is:

```txt
workspace discovery -> project kit assets -> task context resolution -> Context Packet -> AI coding tool
```

## 2. Core Concepts

### Workspace

A Workspace is the target project being analyzed. Cortexa discovers package metadata, framework signals, entrypoints, source files, feature folders, workspace packages, dependency relationships, and generated `.cortexa` assets.

### Context Packet

A Context Packet is the task-sized unit of engineering context consumed by AI tools. It must be:

- minimal enough to keep token use low;
- structured enough to be machine-readable;
- evidence-backed enough to explain why files were selected;
- bounded enough to reduce accidental cross-feature changes;
- versioned enough to keep integrations stable.

### Project Kit

The Project Kit is the generated `.cortexa/` asset system. It stores agents, skills, specs, adapter snapshots, graph snapshots, ownership maps, workflow notes, reports, and manifest metadata.

Human-owned files are only created when missing. Machine-owned snapshots may be refreshed. Hybrid files preserve human edits around Cortexa-managed blocks.

## 3. MVP Boundary

Phase 1 focuses on a stable releaseable loop:

1. `ctx setup` creates core `.cortexa` assets and editor rules.
2. `ctx update` refreshes managed snapshots without overwriting human edits.
3. `ctx discover` reports project shape.
4. `ctx analyze` writes project reports.
5. `ctx audit` checks asset health and drift.
6. `ctx pack --explain <task>` builds a versioned Context Packet.
7. `ctx go --explain <task>` initializes or refreshes assets, then prints a Context Packet.

Out of scope for Phase 1:

- dashboard UI;
- direct model/provider execution;
- arbitrary workflow execution;
- remote service or SaaS state;
- broad multi-agent orchestration beyond packet recommendations and handoff metadata.

## 4. Architecture

```txt
CLI
  -> workspace discovery
  -> adapter analysis
  -> project kit generation
  -> context resolution
  -> quality gate
  -> Context Packet
```

### CLI Layer

The CLI entrypoint stays thin. It parses command names, delegates to command modules, and handles top-level process errors.

Command implementations may format output and coordinate modules, but domain logic should live in focused modules:

- `workspace/` for discovery and lifecycle state;
- `adapters/` for project analysis;
- `project-kit/` for generated assets and manifests;
- `context/` for packet construction and quality signals;
- `reports/` for analyze and audit outputs;
- `editors/` for editor integration rules;
- `setup/` for options and guided setup.

### Adapter Layer

Adapters convert project files into semantic signals:

- package manager and workspace layout;
- framework and language signals;
- source roots and entrypoints;
- package boundaries;
- feature folders;
- import graph edges;
- dependency graph data.

Adapters should prefer deterministic file and metadata analysis over broad guessing.

### Context Layer

The context layer is responsible for:

- task intent classification;
- task term expansion;
- anchor resolution against packages, features, entrypoints, and semantic roles;
- required and optional file selection;
- reading order;
- risk boundaries;
- token budget;
- readiness and quality gate metadata;
- handoff metadata for AI tools.

The Context Packet must include `schema`, `schemaVersion`, and `generatedAt` so downstream integrations can detect contract changes.

## 5. Context Packet Contract

Phase 1 uses this top-level contract:

```json
{
  "schema": "cortexa.context-packet",
  "schemaVersion": 1,
  "task": "fix login token expiration",
  "intent": {},
  "workspace": {},
  "scope": [],
  "requiredFiles": [],
  "optionalFiles": [],
  "readingOrder": [],
  "riskBoundaries": [],
  "qualityGate": {},
  "readiness": {},
  "handoff": {},
  "phaseTransition": {},
  "generatedAt": "2026-01-01T00:00:00.000Z"
}
```

The contract may add fields in minor releases, but removing or renaming top-level fields requires a schema version change.

## 6. Quality Gate

`ctx pack --explain` should explain whether the packet is ready to consume.

Quality signals include:

- whether the task had strong anchors;
- whether required files were selected;
- whether selected files have multi-source evidence;
- whether selected context is small enough;
- whether risky cross-cutting areas such as auth, request interceptors, routing, or workspace boundaries are involved.

Possible gate statuses:

- `pass`: AI tools can proceed.
- `review`: humans or a context analyst should inspect the packet first.
- `block`: the task needs narrowing or better evidence.

## 7. Release Gate

Before publishing, the repository should pass:

```bash
npm test
npm run check
npm pack --workspace apps/cli --dry-run
npm pack --workspace apps/create-cortexa --dry-run
```

The release gate should verify package metadata, executable entrypoints, documentation, CLI smoke behavior, unit tests, initializer behavior, and example lifecycle behavior.

## 8. Phase 1 Engineering Priorities

1. Keep CLI entrypoints and command modules focused.
2. Keep `Context Packet` output versioned and stable.
3. Split large context modules by responsibility before adding more heuristics.
4. Use tests to lock high-value packet behavior instead of snapshotting volatile timestamps.
5. Treat documentation as product surface; docs must remain readable UTF-8 Markdown.
