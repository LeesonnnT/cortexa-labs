import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { readJson, writeIfMissing, writeJson } from "../core/fs.js";
import { reportsReadmeDocument } from "../documents/index.js";
import { discoverWorkspace } from "../workspace/discovery.js";

export function auditWorkspace(root) {
  const discovery = discoverWorkspace(root);
  const report = createAuditReport(root, discovery);
  const reportsDir = join(root, ".cortexa", "reports");
  const jsonPath = join(reportsDir, "audit-latest.json");
  const markdownPath = join(reportsDir, "audit-latest.md");

  mkdirSync(reportsDir, { recursive: true });
  writeIfMissing(join(reportsDir, "README.md"), reportsReadmeDocument());
  writeJson(jsonPath, report);
  writeFileSync(markdownPath, renderAuditMarkdown(report));

  return {
    report,
    paths: {
      json: relative(root, jsonPath),
      markdown: relative(root, markdownPath)
    }
  };
}

function createAuditReport(root, discovery) {
  const manifest = readJson(join(root, ".cortexa", "context-manifest.json"));
  const checks = [
    ...checkCoreAssets(root),
    ...checkManifest(root, manifest),
    ...checkGeneratedSnapshots(root, discovery),
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

  if (adapterSnapshot) {
    checks.push(compareSnapshot("snapshot.discovery.adapters", "adapters", adapterSnapshot.adapters || [], discovery.adapters, ".cortexa/adapters/discovery.json"));
    checks.push(compareSnapshot("snapshot.discovery.packages", "packages", (adapterSnapshot.packages || []).map((pkg) => pkg.path), discovery.packages.map((pkg) => pkg.path), ".cortexa/adapters/discovery.json"));
    checks.push(compareSnapshot("snapshot.discovery.entrypoints", "entrypoints", (adapterSnapshot.entrypoints || []).map((entrypoint) => entrypoint.path), discovery.semanticEntrypoints.map((entrypoint) => entrypoint.path), ".cortexa/adapters/discovery.json"));
  }

  if (repoGraph) {
    checks.push(compareSnapshot("snapshot.repo-graph.packages", "repo graph packages", (repoGraph.nodes?.packages || []).map((pkg) => pkg.path), discovery.packages.map((pkg) => pkg.path), ".cortexa/graphs/repo-graph.json"));
    checks.push(compareSnapshot("snapshot.repo-graph.features", "repo graph features", (repoGraph.nodes?.features || []).map((feature) => feature.path), discovery.features.map((feature) => feature.path), ".cortexa/graphs/repo-graph.json"));
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

  if (summary.status === "pass") {
    actions.push("Cortexa assets look healthy; use ctx pack --explain on concrete tasks to validate context selection quality.");
  }

  return [...new Set(actions)];
}

function renderAuditMarkdown(report) {
  const failed = report.checks.filter((check) => check.status === "fail");
  const warned = report.checks.filter((check) => check.status === "warn");
  const lines = [
    "# Cortexa Audit Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    "",
    "## Summary",
    "",
    `- Total: ${report.summary.total}`,
    `- Pass: ${report.summary.pass}`,
    `- Warn: ${report.summary.warn}`,
    `- Fail: ${report.summary.fail}`,
    "",
    "## Failed Checks",
    "",
    ...formatChecks(failed),
    "",
    "## Warnings",
    "",
    ...formatChecks(warned),
    "",
    "## Recommendations",
    "",
    ...formatItems(report.recommendations, (action) => `- ${action}`),
    ""
  ];

  return lines.join("\n");
}

function formatChecks(checks) {
  return formatItems(checks, (check) => {
    const suggestion = check.suggestion ? ` Suggestion: ${check.suggestion}` : "";
    return `- ${check.id}: ${check.message}${suggestion}`;
  });
}

function formatItems(values, render) {
  return values.length > 0 ? values.map(render) : ["- none"];
}

function normalizeValues(values) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))].sort();
}
