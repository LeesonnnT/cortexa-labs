import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { analyzeProject, selectContextScope } from "../src/adapters/project.js";

const cliPath = fileURLToPath(new URL("../src/index.js", import.meta.url));

function createProject() {
  return mkdtempSync(join(process.cwd(), ".cortexa-adapter-test-"));
}

function write(path, content) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function runCli(root, ...args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

test("analyzes pnpm monorepo packages and internal dependencies", (t) => {
  const root = createProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  write(join(root, "package.json"), '{ "name": "acme", "private": true }\n');
  write(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "apps/*"\n  - "packages/*"\n');
  write(join(root, "apps", "web", "package.json"), '{ "name": "@acme/web", "dependencies": { "@acme/shared": "workspace:*", "next": "^15.0.0", "react": "^19.0.0" }, "scripts": { "dev": "next dev" } }\n');
  write(join(root, "apps", "web", "app", "page.tsx"), "export default function Page() { return null; }\n");
  write(join(root, "packages", "shared", "package.json"), '{ "name": "@acme/shared", "dependencies": { "zod": "^3.0.0" } }\n');
  write(join(root, "packages", "shared", "src", "index.ts"), "export const value = 1;\n");

  const analysis = analyzeProject(root);

  assert.equal(analysis.workspace, "pnpm-monorepo");
  assert.ok(analysis.adapters.includes("pnpm-monorepo"));
  assert.ok(analysis.adapters.includes("react-next"));
  assert.deepEqual(analysis.packages.map((pkg) => pkg.name), ["@acme/web", "@acme/shared"]);
  assert.ok(analysis.dependencyGraph.edges.some((edge) => edge.from === "@acme/web" && edge.to === "@acme/shared" && edge.type === "workspace-dependency"));
});

test("detects vue features and narrows scope by task", (t) => {
  const root = createProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  write(join(root, "package.json"), '{ "name": "vue-app", "dependencies": { "vue": "^3.0.0" }, "devDependencies": { "vite": "^6.0.0", "typescript": "^5.0.0" } }\n');
  write(join(root, "src", "main.ts"), "import { createApp } from 'vue';\n");
  write(join(root, "src", "views", "billing", "index.vue"), "<template><main /></template>\n");

  const analysis = analyzeProject(root);
  const scope = selectContextScope(analysis, "billing review");

  assert.ok(analysis.adapters.includes("vue"));
  assert.ok(analysis.frameworks.includes("vue"));
  assert.ok(analysis.features.some((feature) => feature.path === "src/views/billing"));
  assert.deepEqual(scope, ["src/views/billing"]);
});

test("discover command emits adapter-backed semantic fields", (t) => {
  const root = createProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  write(join(root, "package.json"), '{ "name": "next-app", "dependencies": { "next": "^15.0.0", "react": "^19.0.0" } }\n');
  write(join(root, "app", "page.tsx"), "export default function Page() { return null; }\n");

  const result = runCli(root, "discover");
  const discovery = JSON.parse(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(discovery.framework, "nextjs");
  assert.ok(discovery.adapters.includes("react-next"));
  assert.ok(discovery.semanticEntrypoints.some((entrypoint) => entrypoint.kind === "next-app-router"));
});
