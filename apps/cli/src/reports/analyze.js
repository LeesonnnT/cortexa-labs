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
      json: toPortablePath(relative(root, jsonPath)),
      markdown: toPortablePath(relative(root, markdownPath))
    }
  };
}

function toPortablePath(path) {
  return String(path || "").replaceAll("\\", "/");
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
      "项目包含多个包，跨包变更可能影响多个运行时入口。",
      discovery.packages.slice(0, 8).map((pkg) => pkg.path),
      "将任务收敛到单一应用、包或调用链前，先确认包依赖方向。"
    );
  }

  if (discovery.semanticEntrypoints.some((entrypoint) => entrypoint.kind === "script" && /build|test|dev|start/.test(entrypoint.path))) {
    add(
      "script-entrypoints",
      "low",
      "包脚本常是验证入口，但不同包中的脚本语义可能不同。",
      discovery.semanticEntrypoints.filter((entrypoint) => entrypoint.kind === "script").map((entrypoint) => entrypoint.path),
      "选择最接近的验证命令前，先检查目标包的脚本。"
    );
  }

  const requestFiles = sourceFilesMatching(discovery, /request|api|service|http|client|interceptor/i);
  if (requestFiles.length > 0) {
    add(
      "api-client",
      "medium",
      "检测到请求或 API 文件；全局请求层变更可能影响多个功能。",
      requestFiles.slice(0, 8),
      "修改请求封装、拦截器或错误处理时，检查鉴权、重试、错误提示和调用方兼容性。"
    );
  }

  const routingFiles = sourceFilesMatching(discovery, /router|route|routes|permission/i);
  if (routingFiles.length > 0) {
    add(
      "routing",
      "medium",
      "检测到路由或权限入口；变更可能导致跳转循环或访问控制回归。",
      routingFiles.slice(0, 8),
      "验证公开页面、受保护页面、已登录状态和会话过期路径。"
    );
  }

  if (discovery.features.length > 8) {
    add(
      "broad-feature-surface",
      "low",
      "项目包含较多功能根目录，宽泛任务可能引入过多上下文。",
      discovery.features.slice(0, 8).map((feature) => feature.path),
      "运行 ctx pack 时，请包含功能、页面、模块或包名称。"
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
    actions.push("添加清晰的入口文件或包脚本，以便 ctx pack 建立稳定任务锚点。");
  }

  if (discovery.packages.length > 0) {
    actions.push("为关键包补充 ownership-map，使跨包任务具有清晰边界和责任人。");
  }

  if (riskBoundaries.some((risk) => risk.area === "api-client")) {
    actions.push("在 .cortexa/specs/api-conventions 中记录请求/API 约定，减少后续任务歧义。");
  }

  return actions.length > 0 ? actions : ["项目结构信号清晰；请使用 ctx pack --explain 验证具体任务的上下文质量。"];
}

function sourceFilesMatching(discovery, pattern) {
  return (discovery.sourceGraph?.nodes || []).map((node) => node.id).filter((file) => pattern.test(file));
}
