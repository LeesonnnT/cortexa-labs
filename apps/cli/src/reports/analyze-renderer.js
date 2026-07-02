export function renderAnalyzeMarkdown(report) {
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
