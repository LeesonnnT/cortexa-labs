# Cortexa Audit Report

Generated: 2026-06-10T03:17:54.779Z
Status: fail

## Summary

- Total: 17
- Pass: 1
- Warn: 4
- Fail: 12

## Failed Checks

- core.workspace: .cortexa/workspace.json is missing. workspace config is required by ctx pack and editor integrations. Suggestion: Run ctx setup to initialize workspace metadata.
- core.manifest: .cortexa/context-manifest.json is missing. manifest records asset ownership and refresh lifecycle. Suggestion: Run ctx setup or ctx update to create context-manifest.json.
- asset.layer.agents: .cortexa/agents is missing. agents layer directory should exist when enabled. Suggestion: Run ctx setup or ctx update to create .cortexa/agents.
- asset.layer.skills: .cortexa/skills is missing. skills layer directory should exist when enabled. Suggestion: Run ctx setup or ctx update to create .cortexa/skills.
- asset.layer.specs: .cortexa/specs is missing. specs layer directory should exist when enabled. Suggestion: Run ctx setup or ctx update to create .cortexa/specs.
- asset.layer.contexts: .cortexa/contexts is missing. contexts layer directory should exist when enabled. Suggestion: Run ctx setup or ctx update to create .cortexa/contexts.
- asset.layer.adapters: .cortexa/adapters is missing. adapters layer directory should exist when enabled. Suggestion: Run ctx setup or ctx update to create .cortexa/adapters.
- asset.layer.graphs: .cortexa/graphs is missing. graphs layer directory should exist when enabled. Suggestion: Run ctx setup or ctx update to create .cortexa/graphs.
- asset.layer.runtime: .cortexa/runtime is missing. runtime layer directory should exist when enabled. Suggestion: Run ctx setup or ctx update to create .cortexa/runtime.
- asset.layer.ownership: .cortexa/ownership is missing. ownership layer directory should exist when enabled. Suggestion: Run ctx setup or ctx update to create .cortexa/ownership.
- asset.layer.multi-agent: .cortexa/multi-agent is missing. multi-agent layer directory should exist when enabled. Suggestion: Run ctx setup or ctx update to create .cortexa/multi-agent.
- asset.layer.workflows: .cortexa/workflows is missing. workflows layer directory should exist when enabled. Suggestion: Run ctx setup or ctx update to create .cortexa/workflows.

## Warnings

- core.project-kit: .cortexa/project-kit.json is missing. project kit summarizes generated specs, skills, agents, and layers. Suggestion: Run ctx update to refresh project-kit.json.
- core.ownership: .cortexa/ownership/ownership-map.json is missing. ownership map helps bound multi-package tasks. Suggestion: Run ctx setup, then fill ownership-map for important packages.
- snapshot.discovery: .cortexa/adapters/discovery.json is missing. adapter discovery snapshot should track current project shape. Suggestion: Run ctx update to refresh adapter discovery.
- snapshot.repo-graph: .cortexa/graphs/repo-graph.json is missing. repo graph snapshot should track packages, entrypoints, features, and source imports. Suggestion: Run ctx update to refresh repo graph.

## Recommendations

- Run ctx setup to initialize the required Cortexa workspace assets.
- Run ctx update after project structure changes to refresh manifest, adapter discovery, and repo graph snapshots.
- Fill .cortexa/ownership/ownership-map.json for packages or features that often change.
