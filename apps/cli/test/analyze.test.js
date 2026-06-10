import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { analyzeWorkspace } from "../src/reports/analyze.js";

test("ctx analyze writes latest JSON and Markdown reports", () => {
  const root = mkdtempSync(join(tmpdir(), "cortexa-analyze-"));
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "analyze-app", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "src/App.tsx", "import { request } from './api/request';\nexport function App() { request(); return null; }\n");
    writeProjectFile(root, "src/api/request.ts", "export function request() { return fetch('/api'); }\n");
    writeProjectFile(root, "src/router/index.ts", "export const routes = [];\n");

    const result = analyzeWorkspace(root);
    const jsonPath = join(root, result.paths.json);
    const markdownPath = join(root, result.paths.markdown);

    assert.equal(result.report.type, "analyze");
    assert.equal(result.paths.json, ".cortexa\\reports\\analyze-latest.json");
    assert.ok(existsSync(jsonPath));
    assert.ok(existsSync(markdownPath));
    assert.ok(result.report.structure.sourceFileCount >= 3);
    assert.ok(result.report.entrypoints.some((entrypoint) => entrypoint.path === "src/App.tsx"));
    assert.ok(result.report.riskBoundaries.some((risk) => risk.area === "api-client"));
    assert.match(readFileSync(markdownPath, "utf8"), /# Cortexa Analyze Report/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeProjectFile(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
