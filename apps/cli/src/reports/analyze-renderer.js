export function renderAnalyzeMarkdown(report) {
  const lines = [
    "# Cortexa 项目分析报告",
    "",
    `生成时间：${report.generatedAt}`,
    "",
    "## 项目",
    "",
    `- 名称：${report.project.name}`,
    `- 工作区：${report.project.workspace}`,
    `- 包管理器：${report.project.packageManager}`,
    `- 框架：${formatList(report.project.frameworks)}`,
    `- Adapter：${formatList(report.project.adapters)}`,
    "",
    "## 结构",
    "",
    `- 源文件：${report.structure.sourceFileCount}`,
    `- 源码导入：${report.structure.sourceImportCount}`,
    `- 包：${report.structure.packageCount}`,
    `- 功能：${report.structure.featureCount}`,
    `- 入口：${report.structure.entrypointCount}`,
    "",
    "## 包",
    "",
    ...formatItems(report.packages.slice(0, 20), (pkg) => `- ${pkg.path} (${pkg.name}, ${pkg.framework})`),
    "",
    "## 入口",
    "",
    ...formatItems(report.entrypoints.slice(0, 20), (entrypoint) => `- ${entrypoint.path} [${entrypoint.kind}]`),
    "",
    "## 功能",
    "",
    ...formatItems(report.features.slice(0, 20), (feature) => `- ${feature.path} [${feature.kind}] files=${feature.fileCount}`),
    "",
    "## 风险边界",
    "",
    ...formatItems(report.riskBoundaries, (risk) => `- ${risk.area} (${risk.severity}): ${risk.reason}`),
    "",
    "## 建议",
    "",
    ...report.recommendations.map((action) => `- ${action}`),
    ""
  ];

  return lines.join("\n");
}

function formatList(values) {
  return values.length > 0 ? values.join(", ") : "无";
}

function formatItems(values, render) {
  return values.length > 0 ? values.map(render) : ["- 无"];
}
