import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { writeIfMissing, writeJson } from "../core/fs.js";
import { reportsReadmeDocument } from "../documents/index.js";
import { discoverWorkspace } from "../workspace/discovery.js";
import { createAuditReport } from "./audit-checks.js";
import { renderAuditMarkdown } from "./audit-renderer.js";

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
