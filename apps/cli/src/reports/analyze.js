import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { writeIfMissing, writeJson } from "../core/fs.js";
import { reportsReadmeDocument } from "../documents/index.js";
import { discoverWorkspace } from "../workspace/discovery.js";
import { renderAnalyzeMarkdown } from "./analyze-renderer.js";

export function analyzeWorkspace(root) {
  const discovery = discoverWorkspace(root);
  const report = createAnalyzeReport(discovery);
  const reportsDir = join(root, ".cortexa", "reports");
  const jsonPath = join(reportsDir, "analyze-latest.json");
  const markdownPath = join(reportsDir, "analyze-latest.md");

  mkdirSync(reportsDir, { recursive: true });
  writeIfMissing(join(reportsDir, "README.md"), reportsReadmeDocument());
  writeJson(jsonPath, report);
  writeFileSync(markdownPath, renderAnalyzeMarkdown(report));

  return {
    report,
    paths: {
      json: relative(root, jsonPath),
      markdown: relative(root, markdownPath)
    }
  };
}

function createAnalyzeReport(discovery) {
  const riskBoundaries = inferWorkspaceRiskBoundaries(discovery);
  const recommendations = recommendNextActions(discovery, riskBoundaries);

  return {
    version: 1,
    type: "analyze",
    generatedAt: new Date().toISOString(),
    project: {
      name: discovery.name,
      packageManager: discovery.packageManager,
      workspace: discovery.workspace,
      framework: discovery.framework,
      frameworks: discovery.frameworks,
      languages: discovery.languages,
      adapters: discovery.adapters
    },
    sourceSummary: discovery.sourceSummary,
    structure: {
      directories: discovery.directories,
      workspaces: discovery.workspaces,
      packageCount: discovery.packages.length,
      featureCount: discovery.features.length,
      entrypointCount: discovery.semanticEntrypoints.length,
      sourceFileCount: discovery.sourceGraph?.nodes?.length || 0,
      sourceImportCount: discovery.sourceGraph?.edges?.length || 0
    },
    packages: discovery.packages.map((pkg) => ({
      name: pkg.name,
      path: pkg.path,
      framework: pkg.framework,
      frameworks: pkg.frameworks,
      entrypoints: pkg.entrypoints,
      dependencies: pkg.dependencies,
      devDependencies: pkg.devDependencies
    })),
    entrypoints: discovery.semanticEntrypoints,
    features: discovery.features.map((feature) => ({
      name: feature.name,
      path: feature.path,
      kind: feature.kind,
      package: feature.package || null,
      fileCount: feature.files?.length || 0,
      files: feature.files || []
    })),
    dependencyGraph: discovery.dependencyGraph,
    riskBoundaries,
    recommendations
  };
}

function inferWorkspaceRiskBoundaries(discovery) {
  const risks = [];

  function add(area, severity, reason, evidence, guardrail) {
    if (!risks.some((risk) => risk.area === area)) {
      risks.push({ area, severity, reason, evidence, guardrail });
    }
  }

  if (discovery.workspace !== "single-package") {
    add(
      "workspace-boundary",
      "medium",
      "The project contains multiple packages, so cross-package changes can affect multiple runtime entrypoints.",
      discovery.packages.slice(0, 8).map((pkg) => pkg.path),
      "Confirm package dependency direction before narrowing the task to a single app, package, or call chain."
    );
  }

  if (discovery.semanticEntrypoints.some((entrypoint) => entrypoint.kind === "script" && /build|test|dev|start/.test(entrypoint.path))) {
    add(
      "script-entrypoints",
      "low",
      "Package scripts are common validation entrypoints, but script meaning may differ by package.",
      discovery.semanticEntrypoints.filter((entrypoint) => entrypoint.kind === "script").map((entrypoint) => entrypoint.path),
      "Check the target package scripts before choosing the nearest validation command."
    );
  }

  const requestFiles = sourceFilesMatching(discovery, /request|api|service|http|client|interceptor/i);
  if (requestFiles.length > 0) {
    add(
      "api-client",
      "medium",
      "Request or API files are present; global request-layer changes can affect multiple features.",
      requestFiles.slice(0, 8),
      "When changing request wrappers, interceptors, or error handling, check auth, retry, error messaging, and caller compatibility."
    );
  }

  const routingFiles = sourceFilesMatching(discovery, /router|route|routes|permission/i);
  if (routingFiles.length > 0) {
    add(
      "routing",
      "medium",
      "Routing or permission entrypoints are present; changes can create redirect loops or access-control regressions.",
      routingFiles.slice(0, 8),
      "Verify public pages, protected pages, logged-in state, and expired-session paths."
    );
  }

  if (discovery.features.length > 8) {
    add(
      "broad-feature-surface",
      "low",
      "The project has many feature roots, so broad tasks can pull in too much context.",
      discovery.features.slice(0, 8).map((feature) => feature.path),
      "Include a feature, page, module, or package name when running ctx pack."
    );
  }

  return risks;
}

function recommendNextActions(discovery, riskBoundaries) {
  const actions = [];

  if (!existsSync(join(discovery.root, ".cortexa", "workspace.json"))) {
    actions.push("Run ctx setup to initialize .cortexa/workspace.json and project context assets.");
  }

  if (discovery.semanticEntrypoints.length === 0) {
    actions.push("Add clear entrypoint files or package scripts so ctx pack can establish stable task anchors.");
  }

  if (discovery.packages.length > 0) {
    actions.push("Fill ownership-map for key packages so cross-package tasks have clear boundaries and owners.");
  }

  if (riskBoundaries.some((risk) => risk.area === "api-client")) {
    actions.push("Document request/API conventions in .cortexa/specs/api-conventions to reduce future task ambiguity.");
  }

  return actions.length > 0 ? actions : ["Project structure signals are clear; use ctx pack --explain to validate context quality for a concrete task."];
}

function sourceFilesMatching(discovery, pattern) {
  return (discovery.sourceGraph?.nodes || []).map((node) => node.id).filter((file) => pattern.test(file));
}
