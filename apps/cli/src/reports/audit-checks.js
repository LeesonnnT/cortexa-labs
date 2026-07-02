import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "../core/fs.js";

export function createAuditReport(root, discovery) {
  const manifest = readJson(join(root, ".cortexa", "context-manifest.json"));
  const checks = [
    ...checkCoreAssets(root),
    ...checkManifest(root, manifest),
    ...checkGeneratedSnapshots(root, discovery),
    ...checkRuntimeAssets(root),
    ...checkProjectAssets(root, manifest)
  ];
  const summary = summarizeChecks(checks);

  return {
    version: 1,
    type: "audit",
    generatedAt: new Date().toISOString(),
    project: {
      name: discovery.name,
      workspace: discovery.workspace,
      packageManager: discovery.packageManager,
      frameworks: discovery.frameworks,
      adapters: discovery.adapters
    },
    status: summary.status,
    summary,
    checks,
    recommendations: recommendAuditActions(summary, checks)
  };
}

function checkCoreAssets(root) {
  return [
    fileCheck(root, ".cortexa/workspace.json", "core.workspace", "fail", "workspace config is required by ctx pack and editor integrations", "Run ctx setup to initialize workspace metadata."),
    fileCheck(root, ".cortexa/context-manifest.json", "core.manifest", "fail", "manifest records asset ownership and refresh lifecycle", "Run ctx setup or ctx update to create context-manifest.json."),
    fileCheck(root, ".cortexa/project-kit.json", "core.project-kit", "warn", "project kit summarizes generated specs, skills, agents, and layers", "Run ctx update to refresh project-kit.json."),
    fileCheck(root, ".cortexa/ownership/ownership-map.json", "core.ownership", "warn", "ownership map helps bound multi-package tasks", "Run ctx setup, then fill ownership-map for important packages.")
  ];
}

function checkManifest(root, manifest) {
  if (!manifest) {
    return [];
  }

  const checks = [];
  const enabledLayers = new Set(manifest.enabledLayers || []);
  const generatedAssets = manifest.generatedAssets || {};

  checks.push({
    id: "manifest.schema.version",
    status: manifest.version === 1 ? "pass" : "warn",
    severity: manifest.version === 1 ? "info" : "warn",
    title: "manifest schema version",
    message: manifest.version === 1 ? "context-manifest.json is using schema version 1." : `context-manifest.json schema version is ${manifest.version ?? "missing"}.`,
    path: ".cortexa/context-manifest.json",
    suggestion: manifest.version === 1 ? null : "Run ctx update to refresh context-manifest.json."
  });

  checks.push({
    id: "manifest.lifecycle",
    status: hasLifecycleKeys(manifest.lifecycle) ? "pass" : "warn",
    severity: hasLifecycleKeys(manifest.lifecycle) ? "info" : "warn",
    title: "manifest lifecycle metadata",
    message: hasLifecycleKeys(manifest.lifecycle)
      ? "context-manifest.json includes human, machine, and hybrid lifecycle guidance."
      : "context-manifest.json is missing lifecycle guidance for human, machine, or hybrid assets.",
    path: ".cortexa/context-manifest.json",
    suggestion: hasLifecycleKeys(manifest.lifecycle) ? null : "Run ctx update to refresh context-manifest.json."
  });

  for (const layer of ["agents", "skills", "specs", "contexts", "adapters", "graphs", "runtime", "ownership", "multi-agent", "workflows"]) {
    const enabled = enabledLayers.has(layer);
    checks.push({
      id: `manifest.layer.${layer}`,
      status: enabled ? "pass" : "fail",
      severity: enabled ? "info" : "fail",
      title: `${layer} layer enabled`,
      message: enabled ? `${layer} is enabled in context-manifest.json.` : `${layer} is missing from context-manifest.json enabledLayers.`,
      path: ".cortexa/context-manifest.json",
      suggestion: enabled ? null : "Run ctx update to refresh context-manifest.json."
    });
  }

  for (const layer of enabledLayers) {
    const asset = generatedAssets[layer];
    checks.push({
      id: `manifest.asset.${layer}`,
      status: hasValidAsset(asset) ? "pass" : "warn",
      severity: hasValidAsset(asset) ? "info" : "warn",
      title: `${layer} asset metadata`,
      message: hasValidAsset(asset)
        ? `${layer} asset metadata includes owner, refreshability, and lifecycle notes.`
        : `${layer} asset metadata is incomplete in context-manifest.json.`,
      path: ".cortexa/context-manifest.json",
      suggestion: hasValidAsset(asset) ? null : "Run ctx update to refresh context-manifest.json."
    });
  }

  if (!generatedAssets.reports) {
    checks.push({
      id: "manifest.reports-layer",
      status: "warn",
      severity: "warn",
      title: "reports lifecycle metadata missing",
      message: "reports is missing from context-manifest.json generatedAssets, but analyze/audit commands are producing report assets.",
      path: ".cortexa/context-manifest.json",
      suggestion: "Run ctx update after upgrading the CLI so reports lifecycle metadata is refreshed."
    });
  }

  return checks;
}

function checkGeneratedSnapshots(root, discovery) {
  const checks = [
    fileCheck(root, ".cortexa/adapters/discovery.json", "snapshot.discovery", "warn", "adapter discovery snapshot should track current project shape", "Run ctx update to refresh adapter discovery."),
    fileCheck(root, ".cortexa/graphs/repo-graph.json", "snapshot.repo-graph", "warn", "repo graph snapshot should track packages, entrypoints, features, and source imports", "Run ctx update to refresh repo graph."),
    fileCheck(root, ".cortexa/reports/analyze-latest.json", "reports.analyze", "warn", "analyze report gives humans a current project overview", "Run ctx analyze to generate analyze-latest.json.")
  ];
  const adapterSnapshot = readJson(join(root, ".cortexa", "adapters", "discovery.json"));
  const repoGraph = readJson(join(root, ".cortexa", "graphs", "repo-graph.json"));
  const ownershipMap = readJson(join(root, ".cortexa", "ownership", "ownership-map.json"));

  if (adapterSnapshot) {
    checks.push(compareSnapshot("snapshot.discovery.adapters", "adapters", adapterSnapshot.adapters || [], discovery.adapters, ".cortexa/adapters/discovery.json"));
    checks.push(compareSnapshot("snapshot.discovery.packages", "packages", (adapterSnapshot.packages || []).map((pkg) => pkg.path), discovery.packages.map((pkg) => pkg.path), ".cortexa/adapters/discovery.json"));
    checks.push(compareSnapshot("snapshot.discovery.entrypoints", "entrypoints", (adapterSnapshot.entrypoints || []).map((entrypoint) => entrypoint.path), discovery.semanticEntrypoints.map((entrypoint) => entrypoint.path), ".cortexa/adapters/discovery.json"));
  }

  if (repoGraph) {
    checks.push(compareSnapshot("snapshot.repo-graph.packages", "repo graph packages", (repoGraph.nodes?.packages || []).map((pkg) => pkg.path), discovery.packages.map((pkg) => pkg.path), ".cortexa/graphs/repo-graph.json"));
    checks.push(compareSnapshot("snapshot.repo-graph.features", "repo graph features", (repoGraph.nodes?.features || []).map((feature) => feature.path), discovery.features.map((feature) => feature.path), ".cortexa/graphs/repo-graph.json"));
    checks.push(compareSnapshot("snapshot.repo-graph.source-import-nodes", "repo graph source files", (repoGraph.edges?.sourceImports?.nodes || []).map((node) => node.id), (discovery.sourceGraph?.nodes || []).map((node) => node.id), ".cortexa/graphs/repo-graph.json"));
    checks.push(compareSnapshot("snapshot.repo-graph.source-imports", "repo graph source imports", (repoGraph.edges?.sourceImports?.edges || []).map(edgeSignature), (discovery.sourceGraph?.edges || []).map(edgeSignature), ".cortexa/graphs/repo-graph.json"));
  }

  if (ownershipMap) {
    checks.push(compareSnapshot("snapshot.ownership.packages", "ownership packages", ownershipBoundaryPaths(ownershipMap.boundaries?.packages), discovery.packages.map((pkg) => pkg.path), ".cortexa/ownership/ownership-map.json"));
    checks.push(compareSnapshot("snapshot.ownership.features", "ownership features", ownershipBoundaryPaths(ownershipMap.boundaries?.features), discovery.features.map((feature) => feature.path), ".cortexa/ownership/ownership-map.json"));
  }

  return checks;
}

function checkProjectAssets(root, manifest) {
  const checks = [];
  const layers = manifest?.enabledLayers || ["agents", "skills", "specs", "contexts", "adapters", "graphs", "runtime", "ownership", "multi-agent", "workflows"];
  const layerPaths = {
    agents: ".cortexa/agents",
    skills: ".cortexa/skills",
    specs: ".cortexa/specs",
    contexts: ".cortexa/contexts",
    adapters: ".cortexa/adapters",
    graphs: ".cortexa/graphs",
    runtime: ".cortexa/runtime",
    ownership: ".cortexa/ownership",
    "multi-agent": ".cortexa/multi-agent",
    workflows: ".cortexa/workflows",
    reports: ".cortexa/reports",
    contracts: ".cortexa/contracts",
    domains: ".cortexa/domains",
    memory: ".cortexa/memory"
  };

  for (const layer of layers) {
    const path = layerPaths[layer];
    if (!path) {
      continue;
    }

    checks.push(fileCheck(root, path, `asset.layer.${layer}`, ["reports", "contracts", "domains", "memory"].includes(layer) ? "warn" : "fail", `${layer} layer directory should exist when enabled`, `Run ctx setup or ctx update to create ${path}.`));
  }

  return checks;
}

function checkRuntimeAssets(root) {
  const statePath = ".cortexa/runtime/state.json";
  const state = readJson(join(root, statePath));
  if (!state) {
    return [
      {
        id: "runtime.state",
        status: "warn",
        severity: "warn",
        title: "runtime state exists",
        message: "runtime state has not been created yet.",
        path: statePath,
        suggestion: "Run ctx go for a real task to create runtime session state."
      }
    ];
  }

  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  const cacheEntries = Array.isArray(state.cache?.entries) ? state.cache.entries : [];
  const missingSessions = sessions.map((session) => session.sessionRef || `.cortexa/runtime/sessions/${session.id}.json`).filter((path) => !existsSync(join(root, path)));
  const missingCacheEntries = cacheEntries.map((entry) => entry.valueRef).filter((path) => path && !existsSync(join(root, path)));

  return [
    {
      id: "runtime.state.schema",
      status: state.schema === "cortexa.runtime-state" && state.schemaVersion === 1 ? "pass" : "warn",
      severity: state.schema === "cortexa.runtime-state" && state.schemaVersion === 1 ? "info" : "warn",
      title: "runtime state schema",
      message:
        state.schema === "cortexa.runtime-state" && state.schemaVersion === 1
          ? "runtime state uses schema version 1."
          : "runtime state schema is missing or unsupported.",
      path: statePath,
      suggestion: state.schema === "cortexa.runtime-state" && state.schemaVersion === 1 ? null : "Run ctx go again after upgrading the CLI."
    },
    {
      id: "runtime.sessions.refs",
      status: missingSessions.length === 0 ? "pass" : "warn",
      severity: missingSessions.length === 0 ? "info" : "warn",
      title: "runtime session refs",
      message: missingSessions.length === 0 ? "runtime session references are readable." : "runtime state references missing session files.",
      path: statePath,
      details: {
        missing: missingSessions.slice(0, 12)
      },
      suggestion: missingSessions.length === 0 ? null : "Run ctx go to create a fresh session, or remove stale runtime state entries."
    },
    {
      id: "runtime.cache.refs",
      status: missingCacheEntries.length === 0 ? "pass" : "warn",
      severity: missingCacheEntries.length === 0 ? "info" : "warn",
      title: "runtime cache refs",
      message: missingCacheEntries.length === 0 ? "runtime cache references are readable." : "runtime state references missing cache files.",
      path: statePath,
      details: {
        missing: missingCacheEntries.slice(0, 12)
      },
      suggestion: missingCacheEntries.length === 0 ? null : "Run ctx go to regenerate Context Packet cache entries."
    }
  ];
}

function fileCheck(root, path, id, missingSeverity, reason, suggestion) {
  const exists = existsSync(join(root, path));
  return {
    id,
    status: exists ? "pass" : missingSeverity,
    severity: exists ? "info" : missingSeverity,
    title: `${path} exists`,
    message: exists ? `${path} exists.` : `${path} is missing. ${reason}.`,
    path,
    suggestion: exists ? null : suggestion
  };
}

function compareSnapshot(id, label, snapshotValues, currentValues, path) {
  const snapshot = normalizeValues(snapshotValues);
  const current = normalizeValues(currentValues);
  const missing = current.filter((value) => !snapshot.includes(value));
  const stale = snapshot.filter((value) => !current.includes(value));
  const matches = missing.length === 0 && stale.length === 0;

  return {
    id,
    status: matches ? "pass" : "warn",
    severity: matches ? "info" : "warn",
    title: `${label} snapshot matches discovery`,
    message: matches ? `${label} snapshot matches current discovery.` : `${label} snapshot differs from current discovery.`,
    path,
    details: {
      missingFromSnapshot: missing.slice(0, 12),
      staleInSnapshot: stale.slice(0, 12)
    },
    suggestion: matches ? null : "Run ctx update to refresh generated snapshots."
  };
}

function summarizeChecks(checks) {
  const counts = checks.reduce(
    (summary, check) => {
      summary[check.status] = (summary[check.status] || 0) + 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0 }
  );
  const status = counts.fail > 0 ? "fail" : counts.warn > 0 ? "warn" : "pass";

  return {
    status,
    total: checks.length,
    pass: counts.pass || 0,
    warn: counts.warn || 0,
    fail: counts.fail || 0
  };
}

function recommendAuditActions(summary, checks) {
  const actions = [];
  const ids = new Set(checks.filter((check) => check.status !== "pass").map((check) => check.id));

  if (ids.has("core.workspace") || ids.has("core.manifest")) {
    actions.push("Run ctx setup to initialize the required Cortexa workspace assets.");
  }

  if ([...ids].some((id) => id.startsWith("snapshot.") || id.startsWith("manifest."))) {
    actions.push("Run ctx update after project structure changes to refresh manifest, adapter discovery, and repo graph snapshots.");
  }

  if (ids.has("reports.analyze")) {
    actions.push("Run ctx analyze to create the latest project analysis report.");
  }

  if (ids.has("core.ownership")) {
    actions.push("Fill .cortexa/ownership/ownership-map.json for packages or features that often change.");
  }

  if ([...ids].some((id) => id.startsWith("runtime."))) {
    actions.push("Run ctx go for a concrete task to refresh runtime sessions and Context Packet cache entries.");
  }

  if (summary.status === "pass") {
    actions.push("Cortexa assets look healthy; use ctx pack --explain on concrete tasks to validate context selection quality.");
  }

  return [...new Set(actions)];
}

function normalizeValues(values) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))].sort();
}

function hasLifecycleKeys(lifecycle) {
  return Boolean(lifecycle && typeof lifecycle.human === "string" && typeof lifecycle.machine === "string" && typeof lifecycle.hybrid === "string");
}

function hasValidAsset(asset) {
  return Boolean(asset && typeof asset.owner === "string" && typeof asset.refreshable === "boolean" && typeof asset.createDirectory === "boolean" && typeof asset.reason === "string");
}

function edgeSignature(edge) {
  if (!edge) {
    return "";
  }

  return `${edge.from}->${edge.to}:${edge.type}`;
}

function ownershipBoundaryPaths(values) {
  return (values || []).map((value) => value?.path).filter(Boolean);
}
