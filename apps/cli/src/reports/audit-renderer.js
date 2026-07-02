export function renderAuditMarkdown(report) {
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
