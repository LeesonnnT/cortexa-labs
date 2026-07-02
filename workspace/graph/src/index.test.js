import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { buildDependencyGraph, buildSourceGraph, createEmptyGraph, loadTsconfigResolvers } from "./index.js";

test("createEmptyGraph returns an empty node and edge set", () => {
  assert.deepEqual(createEmptyGraph(), {
    nodes: [],
    edges: []
  });
});

test("buildSourceGraph resolves relative imports", () => {
  const root = createFixture("relative-imports");
  try {
    writeProjectFile(root, "src/index.ts", "import { request } from './api/request';\nrequest();\n");
    writeProjectFile(root, "src/api/request.ts", "export function request() {}\n");

    const graph = buildSourceGraph(root, ["src/index.ts", "src/api/request.ts"]);

    assert.deepEqual(graph.nodes.map((node) => node.id).sort(), ["src/api/request.ts", "src/index.ts"]);
    assert.ok(graph.edges.some((edge) => edge.from === "src/index.ts" && edge.to === "src/api/request.ts" && edge.type === "imports"));
  } finally {
    removeFixture(root);
  }
});

test("buildSourceGraph resolves tsconfig path aliases", () => {
  const root = createFixture("alias-imports");
  try {
    writeProjectFile(root, "tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }));
    writeProjectFile(root, "src/index.ts", "import { request } from '@/api/request';\nrequest();\n");
    writeProjectFile(root, "src/api/request.ts", "export function request() {}\n");

    const resolvers = loadTsconfigResolvers(root, []);
    const graph = buildSourceGraph(root, ["src/index.ts", "src/api/request.ts"], resolvers);

    assert.ok(graph.edges.some((edge) => edge.from === "src/index.ts" && edge.to === "src/api/request.ts" && edge.type === "imports"));
  } finally {
    removeFixture(root);
  }
});

test("buildDependencyGraph promotes cross-package source imports", () => {
  const sourceGraph = {
    nodes: [],
    edges: [
      {
        from: "apps/web/src/App.tsx",
        to: "packages/api/src/request.ts",
        type: "imports"
      }
    ]
  };
  const packages = [
    {
      name: "@acme/web",
      path: "apps/web",
      framework: "react",
      dependencies: ["@acme/api"]
    },
    {
      name: "@acme/api",
      path: "packages/api",
      framework: "typescript",
      dependencies: []
    }
  ];

  const graph = buildDependencyGraph("/repo", { name: "workspace-root", dependencies: {} }, packages, sourceGraph);

  assert.ok(graph.edges.some((edge) => edge.from === "workspace-root" && edge.to === "@acme/web" && edge.type === "contains"));
  assert.ok(graph.edges.some((edge) => edge.from === "@acme/web" && edge.to === "@acme/api" && edge.type === "workspace-dependency"));
  assert.ok(graph.edges.some((edge) => edge.from === "@acme/web" && edge.to === "@acme/api" && edge.type === "source-import"));
});

function createFixture(name) {
  return mkdtempSync(join(tmpdir(), `cortexa-graph-${name}-`));
}

function writeProjectFile(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function removeFixture(root) {
  rmSync(root, { recursive: true, force: true });
}
