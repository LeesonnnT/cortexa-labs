import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { discoverWorkspace } from "../workspace/discovery.js";
import { writeIfMissing, writeJson } from "../core/fs.js";
import { reportsReadmeDocument } from "../documents/index.js";

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
      "项目包含多个 package，跨包修改可能影响多个运行入口。",
      discovery.packages.slice(0, 8).map((pkg) => pkg.path),
      "先确认 package 依赖方向，再把任务收窄到单个 app/package 或明确的调用链。"
    );
  }

  if (discovery.semanticEntrypoints.some((entrypoint) => entrypoint.kind === "script" && /build|test|dev|start/.test(entrypoint.path))) {
    add(
      "script-entrypoints",
      "low",
      "package scripts 是常见验证入口，但不同 package 的脚本可能语义不同。",
      discovery.semanticEntrypoints.filter((entrypoint) => entrypoint.kind === "script").map((entrypoint) => entrypoint.path),
      "执行变更前优先查看目标 package 的 scripts，并选择最近的验证命令。"
    );
  }

  const requestFiles = sourceFilesMatching(discovery, /request|api|service|http|client|interceptor/i);
  if (requestFiles.length > 0) {
    add(
      "api-client",
      "medium",
      "存在请求/API 相关文件，全局请求层变更可能影响多个业务模块。",
      requestFiles.slice(0, 8),
      "修改请求封装、拦截器或错误处理时，检查认证、重试、错误提示和调用方兼容性。"
    );
  }

  const routingFiles = sourceFilesMatching(discovery, /router|route|routes|permission/i);
  if (routingFiles.length > 0) {
    add(
      "routing",
      "medium",
      "存在路由或权限入口，变更可能造成跳转循环或访问控制回归。",
      routingFiles.slice(0, 8),
      "验证公开页面、受保护页面、登录态和失效登录态的路径。"
    );
  }

  if (discovery.features.length > 8) {
    add(
      "broad-feature-surface",
      "low",
      "项目 feature 数量较多，宽泛任务容易带入过多上下文。",
      discovery.features.slice(0, 8).map((feature) => feature.path),
      "使用 ctx pack 时在任务中带上 feature、页面、模块或 package 名称。"
    );
  }

  return risks;
}

function recommendNextActions(discovery, riskBoundaries) {
  const actions = [];

  if (!existsSync(join(discovery.root, ".cortexa", "workspace.json"))) {
    actions.push("运行 ctx setup 初始化 .cortexa/workspace.json 和项目上下文资产。");
  }

  if (discovery.semanticEntrypoints.length === 0) {
    actions.push("补充明确入口文件或 package scripts，帮助 ctx pack 建立更稳定的任务锚点。");
  }

  if (discovery.packages.length > 0) {
    actions.push("为关键 package 补充 ownership-map，明确跨包任务的边界和负责人。");
  }

  if (riskBoundaries.some((risk) => risk.area === "api-client")) {
    actions.push("把请求/API 约定沉淀到 .cortexa/specs/api-conventions，减少后续任务歧义。");
  }

  return actions.length > 0 ? actions : ["项目结构信号清晰；下一步可以用 ctx pack --explain 验证具体任务的上下文质量。"];
}

function sourceFilesMatching(discovery, pattern) {
  return (discovery.sourceGraph?.nodes || []).map((node) => node.id).filter((file) => pattern.test(file));
}

function renderAnalyzeMarkdown(report) {
  const lines = [
    "# Cortexa Analyze Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Project",
    "",
    `- Name: ${report.project.name}`,
    `- Workspace: ${report.project.workspace}`,
    `- Package manager: ${report.project.packageManager}`,
    `- Frameworks: ${formatList(report.project.frameworks)}`,
    `- Adapters: ${formatList(report.project.adapters)}`,
    "",
    "## Structure",
    "",
    `- Source files: ${report.structure.sourceFileCount}`,
    `- Source imports: ${report.structure.sourceImportCount}`,
    `- Packages: ${report.structure.packageCount}`,
    `- Features: ${report.structure.featureCount}`,
    `- Entrypoints: ${report.structure.entrypointCount}`,
    "",
    "## Packages",
    "",
    ...formatItems(report.packages.slice(0, 20), (pkg) => `- ${pkg.path} (${pkg.name}, ${pkg.framework})`),
    "",
    "## Entrypoints",
    "",
    ...formatItems(report.entrypoints.slice(0, 20), (entrypoint) => `- ${entrypoint.path} [${entrypoint.kind}]`),
    "",
    "## Features",
    "",
    ...formatItems(report.features.slice(0, 20), (feature) => `- ${feature.path} [${feature.kind}] files=${feature.fileCount}`),
    "",
    "## Risk Boundaries",
    "",
    ...formatItems(report.riskBoundaries, (risk) => `- ${risk.area} (${risk.severity}): ${risk.reason}`),
    "",
    "## Recommendations",
    "",
    ...report.recommendations.map((action) => `- ${action}`),
    ""
  ];

  return lines.join("\n");
}

function formatList(values) {
  return values.length > 0 ? values.join(", ") : "none";
}

function formatItems(values, render) {
  return values.length > 0 ? values.map(render) : ["- none"];
}
