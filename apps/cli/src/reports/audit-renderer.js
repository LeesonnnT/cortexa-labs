export function renderAuditMarkdown(report) {
  const failed = report.checks.filter((check) => check.status === "fail");
  const warned = report.checks.filter((check) => check.status === "warn");
  const lines = [
    "# Cortexa 资产审计报告",
    "",
    `生成时间：${report.generatedAt}`,
    `状态：${report.status}`,
    "",
    "## 汇总",
    "",
    `- 总计：${report.summary.total}`,
    `- 通过：${report.summary.pass}`,
    `- 警告：${report.summary.warn}`,
    `- 失败：${report.summary.fail}`,
    "",
    "## 失败检查",
    "",
    ...formatChecks(failed),
    "",
    "## 警告",
    "",
    ...formatChecks(warned),
    "",
    "## 建议",
    "",
    ...formatItems(report.recommendations, (action) => `- ${action}`),
    ""
  ];

  return lines.join("\n");
}

function formatChecks(checks) {
  return formatItems(checks, (check) => {
    const suggestion = check.suggestion ? ` 建议：${check.suggestion}` : "";
    return `- ${check.id}: ${check.message}${suggestion}`;
  });
}

function formatItems(values, render) {
  return values.length > 0 ? values.map(render) : ["- 无"];
}
