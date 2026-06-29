import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { auditWorkspace } from "../src/reports/audit.js";
import { setupProjectKit } from "../src/project-kit/index.js";
import { initializeWorkspace, resolveTemplate } from "../src/setup/options.js";
import { discoverWorkspace } from "../src/workspace/discovery.js";

test("ctx audit reports missing Cortexa assets and writes latest reports", () => {
  const root = createFixture("missing");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "audit-missing", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "src/App.tsx", "export function App() { return null; }\n");

    const result = auditWorkspace(root);

    assert.equal(result.report.type, "audit");
    assert.equal(result.report.status, "fail");
    assert.ok(result.report.summary.fail > 0);
    assert.ok(result.report.checks.some((check) => check.id === "core.workspace" && check.status === "fail"));
    assert.ok(existsSync(join(root, result.paths.json)));
    assert.ok(existsSync(join(root, result.paths.markdown)));
    assert.match(readFileSync(join(root, result.paths.markdown), "utf8"), /# Cortexa Audit Report/);
  } finally {
    removeFixture(root);
  }
});

test("ctx audit passes core checks after project kit setup", () => {
  const root = createFixture("ready");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "audit-ready", dependencies: { vue: "^3.0.0" } }));
    writeProjectFile(root, "src/main.ts", "import './api/request';\n");
    writeProjectFile(root, "src/api/request.ts", "export function request() { return fetch('/api'); }\n");

    const discovery = discoverWorkspace(root);
    initializeWorkspace(root, "frontend");
    setupProjectKit(root, resolveTemplate("frontend", discovery));
    const result = auditWorkspace(root);

    assert.notEqual(result.report.status, "fail");
    assert.ok(result.report.checks.find((check) => check.id === "core.workspace")?.status === "pass");
    assert.ok(result.report.checks.find((check) => check.id === "core.manifest")?.status === "pass");
    assert.ok(result.report.checks.find((check) => check.id === "snapshot.discovery.adapters")?.status === "pass");
    assert.ok(!result.report.checks.some((check) => check.id === "manifest.reports-layer"));
  } finally {
    removeFixture(root);
  }
});

test("ctx audit warns when generated snapshots drift from discovery", () => {
  const root = createFixture("stale");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "audit-stale", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "src/App.tsx", "export function App() { return null; }\n");

    const discovery = discoverWorkspace(root);
    initializeWorkspace(root, "frontend");
    setupProjectKit(root, resolveTemplate("frontend", discovery));
    writeProjectFile(root, "src/pages/Profile.tsx", "export function Profile() { return null; }\n");

    const result = auditWorkspace(root);
    const entrypointCheck = result.report.checks.find((check) => check.id === "snapshot.discovery.entrypoints");

    assert.equal(result.report.status, "warn");
    assert.equal(entrypointCheck?.status, "warn");
    assert.deepEqual(entrypointCheck?.details.missingFromSnapshot, ["src/pages"]);
    assert.ok(result.report.recommendations.some((action) => action.includes("ctx update")));
  } finally {
    removeFixture(root);
  }
});

test("ctx audit warns when source import graph drifts after setup", () => {
  const root = createFixture("source-graph-stale");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "audit-source-graph-stale", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "src/App.tsx", "export function App() { return null; }\n");

    const discovery = discoverWorkspace(root);
    initializeWorkspace(root, "frontend");
    setupProjectKit(root, resolveTemplate("frontend", discovery));
    writeProjectFile(root, "src/api/request.ts", "export function request() { return fetch('/api'); }\n");
    writeProjectFile(root, "src/App.tsx", "import { request } from './api/request';\nexport function App() { request(); return null; }\n");

    const result = auditWorkspace(root);
    const sourceGraphCheck = result.report.checks.find((check) => check.id === "snapshot.repo-graph.source-imports");

    assert.equal(result.report.status, "warn");
    assert.equal(sourceGraphCheck?.status, "warn");
    assert.ok((sourceGraphCheck?.details.missingFromSnapshot || []).some((value) => value.includes("src/App.tsx->src/api/request.ts:imports")));
    assert.ok(result.report.recommendations.some((action) => action.includes("ctx update")));
  } finally {
    removeFixture(root);
  }
});

test("ctx audit warns when ownership map drifts after setup", () => {
  const root = createFixture("ownership-stale");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "audit-ownership-stale", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "src/App.tsx", "export function App() { return null; }\n");

    const discovery = discoverWorkspace(root);
    initializeWorkspace(root, "frontend");
    setupProjectKit(root, resolveTemplate("frontend", discovery));
    writeProjectFile(root, "src/pages/account/profile/index.tsx", "export function Profile() { return null; }\n");

    const result = auditWorkspace(root);
    const ownershipCheck = result.report.checks.find((check) => check.id === "snapshot.ownership.features");

    assert.equal(result.report.status, "warn");
    assert.equal(ownershipCheck?.status, "warn");
    assert.ok((ownershipCheck?.details.missingFromSnapshot || []).includes("src/pages/account/profile"));
    assert.ok(result.report.recommendations.some((action) => action.includes("ctx update")));
  } finally {
    removeFixture(root);
  }
});

test("ctx audit warns when context manifest lifecycle metadata is corrupted", () => {
  const root = createFixture("manifest-stale");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "audit-manifest-stale", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "src/App.tsx", "export function App() { return null; }\n");

    const discovery = discoverWorkspace(root);
    initializeWorkspace(root, "frontend");
    setupProjectKit(root, resolveTemplate("frontend", discovery));

    const manifestPath = join(root, ".cortexa", "context-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    delete manifest.lifecycle;
    manifest.version = 2;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = auditWorkspace(root);
    const versionCheck = result.report.checks.find((check) => check.id === "manifest.schema.version");
    const lifecycleCheck = result.report.checks.find((check) => check.id === "manifest.lifecycle");

    assert.equal(result.report.status, "warn");
    assert.equal(versionCheck?.status, "warn");
    assert.equal(lifecycleCheck?.status, "warn");
    assert.ok(result.report.recommendations.some((action) => action.includes("ctx update")));
  } finally {
    removeFixture(root);
  }
});

function createFixture(name) {
  return mkdtempSync(join(tmpdir(), `cortexa-audit-${name}-`));
}

function writeProjectFile(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function removeFixture(root) {
  rmSync(root, { recursive: true, force: true });
}
