export const specSnapshotStart = "<!-- cortexa:adapter-snapshot:start -->";
export const specSnapshotEnd = "<!-- cortexa:adapter-snapshot:end -->";

export function skillDocument(skill) {
  return `---
id: ${skill.id}
type: skill
name: ${titleFromId(skill.id)}
---

# ${titleFromId(skill.id)}

${skill.description}

## Workflow

${skill.instructions.map((instruction, index) => `${index + 1}. ${instruction}`).join("\n")}

## Context

- Start from the Context Packet returned by \`ctx pack "<task>"\`.
- Read the relevant files listed in the packet before expanding scope.
- Apply project specs from \`.cortexa/specs/\` when they are included.
`;
}

function titleFromId(id) {
  return id
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function agentProfile(agent) {
  return `---
id: ${agent.id}
type: agent
name: ${agent.title}
recommended_skills:
${agent.recommendedSkills.map((skill) => `  - ${skill}`).join("\n")}
---

# ${agent.title}

${agent.role}

## When To Use

Use this agent when the task matches its role and the Context Packet points to relevant project specs, skills, packages, or features.

## Recommended Skills

${agent.recommendedSkills.map((skill) => `- \`${skill}\``).join("\n")}

## Workflow

1. Run \`ctx pack "<task>"\` before broad exploration.
2. Read the matching \`SKILL.md\` from \`.cortexa/skills/<skill>/\`.
3. Read relevant specs from \`.cortexa/specs/<spec>/requirements.md\`, \`design.md\`, and \`tasks.md\`.
4. Follow repository conventions and report validation performed.

## Output

- Summary of scope, changes or findings, and validation performed.
- Open questions or assumptions that should become project specs.
`;
}

export function specRequirementsDocument(spec, discovery) {
  return `---
id: ${spec.id}
type: spec
stage: requirements
title: ${spec.title}
status: draft
---

# ${spec.title} Requirements

${spec.description}

## Purpose

Define durable project rules and assumptions that agents should apply when the Context Packet selects this spec.

## Requirements

${specRequirements(spec.id, discovery)}

## Acceptance Criteria

- Agents can determine when this spec applies from the Context Packet.
- Project-specific rules are explicit enough to guide implementation or review.
- Missing conventions are recorded as open questions instead of hidden assumptions.
`;
}

export function specDesignDocument(spec, discovery, template) {
  return `---
id: ${spec.id}
type: spec
stage: design
title: ${spec.title}
status: draft
---

# ${spec.title} Design

${spec.description}

This file is seeded by Cortexa from adapter-discovered project structure. Treat it as the editable source of truth for this repository; keep team-specific conventions here instead of repeating them in editor prompts.

${adapterSnapshot(spec, discovery, template)}

${specBody(spec.id, discovery)}

## Maintenance

- Keep this spec concise, current, and project-specific.
- Update this file when team conventions change or adapter output exposes a better boundary.
`;
}

export function specTasksDocument(spec) {
  return `---
id: ${spec.id}
type: spec
stage: tasks
title: ${spec.title}
status: draft
---

# ${spec.title} Tasks

## Tasks

- [ ] Review requirements when the related project area changes.
- [ ] Update design guidance when team conventions become clearer.
- [ ] Refresh adapter-derived context with \`ctx update\` after structural changes.
`;
}

export function adapterSnapshot(spec, discovery, template) {
  const detected = [
    `Project: ${discovery.name}`,
    `Template: ${template.id}`,
    `Workspace: ${discovery.workspace}`,
    `Package manager: ${discovery.packageManager}`,
    `Frameworks: ${formatInlineList(discovery.frameworks)}`,
    `Adapters: ${formatInlineList(discovery.adapters)}`
  ];
  const packages = discovery.packages.slice(0, 12).map((pkg) => `${pkg.path} (${pkg.name}, ${pkg.framework})`);
  const entrypoints = discovery.semanticEntrypoints.slice(0, 12).map((entrypoint) => `${entrypoint.path} [${entrypoint.kind}]`);
  const features = discovery.features.slice(0, 12).map((feature) => `${feature.path} [${feature.kind}]`);

  return `${specSnapshotStart}
## Adapter Snapshot

Last refreshed: ${new Date().toISOString()}

### Adapter Signals

${markdownList(detected)}

### Packages

${markdownList(packages, "No workspace packages detected.")}

### Entrypoints

${markdownList(entrypoints, "No semantic entrypoints detected.")}

### Features

${markdownList(features, "No feature directories detected yet.")}
${specSnapshotEnd}`;
}

function specBody(id, discovery) {
  if (id === "project-overview") {
    return `## Context Boundaries

- Start every broad task with \`ctx pack "<task>"\` and use the returned scope before opening unrelated files.
- Prefer package and feature boundaries discovered by adapters over ad hoc repository-wide scanning.
- When adapter output is incomplete, update this spec or add clearer project structure before relying on model guesses.

## Open Questions

- Which packages own public APIs, shared utilities, and user-facing applications?
- Which directories should be considered generated, legacy, or low-trust context?
- Which validation commands represent the minimum bar for common changes?
`;
  }

  if (id === "coding-conventions") {
    return `## Coding Rules

- Follow local module structure, naming, imports, and export style from the nearest package or feature.
- Keep changes scoped to the package, feature, or entrypoint selected by the Context Packet.
- Prefer modular and componentized implementation: split large files by responsibility, place independent modules in kebab-case folders with a unified \`index.js\` export, and keep same-module files grouped inside that folder instead of flattening unrelated modules into the parent directory.
- Avoid mixing command routing, templates, IO, adapters, rendering, and business rules in one file.
- Reuse existing helpers and shared packages before adding new abstractions.
- Validate changes with the package-level script when one exists; otherwise use the root quality gates.

## Adapter-Derived Defaults

- Primary languages: ${formatInlineList(discovery.languages)}
- Source files scanned: ${discovery.sourceSummary.filesScanned}
- Quality gates: ${formatInlineList(discovery.config?.qualityGates || [])}
`;
  }

  if (id === "api-conventions") {
    return `## Interface Rules

- Locate existing request clients, API modules, schemas, and error handlers before adding new interface code.
- Keep request construction, response normalization, retries, auth handling, and error display consistent with nearby code.
- Treat missing schema or contract files as an explicit assumption and document it in the task summary.
- Preserve backward compatibility for shared packages and public entrypoints.

## Contract Checklist

- Request shape, response shape, error shape, loading state, empty state, retry behavior, authorization, validation.
`;
  }

  if (id === "documentation-conventions") {
    return `## Documentation Rules

- Use adapter-discovered package names, entrypoints, and commands instead of guessed paths.
- Keep docs task-oriented: install, run, validate, extend, troubleshoot.
- When a spec changes, update the matching files under \`.cortexa/specs/<spec>/\` so future agents inherit the convention.
- Separate durable project rules from one-off task notes.
`;
  }

  return `## UI Rules

- Locate nearby views, pages, components, layout primitives, design tokens, and state patterns before changing UI.
- Reuse established component and styling conventions before introducing new UI surface area.
- Cover loading, empty, error, disabled, long-content, narrow-viewport, and keyboard-access states when relevant.
- For non-frontend projects, keep this spec as a placeholder until a UI package or adapter signal appears.

## Detected UI Signals

- Frontend frameworks: ${formatInlineList(discovery.frameworks.filter((framework) => ["vue", "nuxt", "react", "nextjs", "vite"].includes(framework)))}
- UI feature candidates: ${formatInlineList(discovery.features.map((feature) => feature.path).slice(0, 8))}
`;
}

function specRequirements(id, discovery) {
  if (id === "project-overview") {
    return `- Define the project shape, package boundaries, entrypoints, and scope-selection expectations.
- Capture open ownership questions that affect context selection.
- Keep adapter-derived structure visible enough for agents to avoid broad repository scans.`;
  }

  if (id === "coding-conventions") {
    return `- Define module, naming, import, export, validation, and change-scope expectations.
- Keep modularity and componentization rules explicit for new implementation work.
- Document the minimum validation commands agents should run for common changes.`;
  }

  if (id === "api-conventions") {
    return `- Define request, response, error, validation, and compatibility expectations.
- Capture where API contracts, schemas, clients, and error handlers live.
- Make undocumented contract assumptions visible before implementation or review.`;
  }

  if (id === "documentation-conventions") {
    return `- Define how README, usage docs, technical notes, and maintenance guidance should be written.
- Keep documentation task-oriented and aligned with adapter-discovered commands and package names.
- Record when a durable convention belongs in specs instead of one-off task notes.`;
  }

  return `- Define UI structure, component reuse, layout, state, accessibility, and visual consistency expectations.
- Capture which local components, tokens, routes, and state patterns should be preferred.
- Keep responsive, loading, empty, error, disabled, and keyboard states explicit for UI work.`;
}

function formatInlineList(values) {
  return values?.length ? values.join(", ") : "none";
}

function markdownList(values, fallback = "None.") {
  if (!values.length) {
    return `- ${fallback}`;
  }

  return values.map((value) => `- ${value}`).join("\n");
}
