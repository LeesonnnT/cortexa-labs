import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { buildDependencyGraph as buildCliDependencyGraph } from "../src/adapters/project/dependency-graph.js";
import { selectContextScope as selectCliContextScope } from "../src/adapters/project/context-scope.js";
import { buildSourceGraph as buildCliSourceGraph, loadTsconfigResolvers as loadCliTsconfigResolvers } from "../src/adapters/project/source-graph.js";
import { resolveTaskFiles as resolveCliTaskFiles } from "../src/context/task-resolver.js";
import { classifyTaskIntent as classifyCliTaskIntent } from "../src/context/task-signals.js";
import {
  buildDependencyGraph as buildWorkspaceDependencyGraph,
  buildSourceGraph as buildWorkspaceSourceGraph,
  loadTsconfigResolvers as loadWorkspaceTsconfigResolvers
} from "../../../workspace/graph/src/index.js";
import {
  classifyTaskIntent as classifyWorkspaceTaskIntent,
  resolveTaskFiles as resolveWorkspaceTaskFiles,
  selectContextScope as selectWorkspaceContextScope
} from "../../../workspace/resolver/src/index.js";

test("CLI graph behavior stays aligned with workspace graph kernel", () => {
  const root = createFixture("graph-parity");
  try {
    writeProjectFile(root, "tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@api/*": ["packages/api/src/*"] } } }));
    writeProjectFile(root, "apps/web/src/App.tsx", "import { request } from '@api/request';\nexport function App() { request(); return null; }\n");
    writeProjectFile(root, "packages/api/src/request.ts", "export function request() { return fetch('/api'); }\n");
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
    const sourceFiles = ["apps/web/src/App.tsx", "packages/api/src/request.ts"];

    const cliResolvers = loadCliTsconfigResolvers(root, packages);
    const workspaceResolvers = loadWorkspaceTsconfigResolvers(root, packages);
    const cliSourceGraph = buildCliSourceGraph(root, sourceFiles, cliResolvers);
    const workspaceSourceGraph = buildWorkspaceSourceGraph(root, sourceFiles, workspaceResolvers);
    const cliDependencyGraph = buildCliDependencyGraph(root, { name: "workspace-root", dependencies: {} }, packages, cliSourceGraph);
    const workspaceDependencyGraph = buildWorkspaceDependencyGraph(root, { name: "workspace-root", dependencies: {} }, packages, workspaceSourceGraph);

    assert.deepEqual(stableJson(cliSourceGraph), stableJson(workspaceSourceGraph));
    assert.deepEqual(stableJson(cliDependencyGraph), stableJson(workspaceDependencyGraph));
  } finally {
    removeFixture(root);
  }
});

test("CLI resolver behavior stays aligned with workspace resolver kernel", () => {
  const root = createFixture("resolver-parity");
  try {
    writeProjectFile(root, "src/controllers/usersController.ts", "export function getUser() { return { id: 1, name: 'Ada' }; }\n");
    writeProjectFile(root, "src/routes/users.ts", "import { getUser } from '../controllers/usersController';\nexport const usersRouter = { getUser };\n");
    const workspace = {
      root,
      features: [
        {
          name: "controllers",
          path: "src/controllers",
          kind: "api-feature",
          files: ["src/controllers/usersController.ts"]
        },
        {
          name: "routes",
          path: "src/routes",
          kind: "api-feature",
          files: ["src/routes/users.ts"]
        }
      ],
      packages: [],
      entrypoints: [],
      semanticEntrypoints: [
        {
          path: "src/controllers",
          kind: "server-controller"
        }
      ],
      sourceGraph: {
        nodes: [
          { id: "src/controllers/usersController.ts", type: "source-file" },
          { id: "src/routes/users.ts", type: "source-file" }
        ],
        edges: [
          {
            from: "src/routes/users.ts",
            to: "src/controllers/usersController.ts",
            type: "imports"
          }
        ]
      }
    };
    const task = "fix users api controller response";

    assert.deepEqual(classifyCliTaskIntent(task), classifyWorkspaceTaskIntent(task));
    assert.deepEqual(selectCliContextScope(workspace, task), selectWorkspaceContextScope(workspace, task));
    assert.deepEqual(stableJson(resolveCliTaskFiles(task, workspace, ["src/controllers"])), stableJson(resolveWorkspaceTaskFiles(task, workspace, ["src/controllers"])));
  } finally {
    removeFixture(root);
  }
});

function stableJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createFixture(name) {
  return mkdtempSync(join(tmpdir(), `cortexa-kernel-parity-${name}-`));
}

function writeProjectFile(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function removeFixture(root) {
  rmSync(root, { recursive: true, force: true });
}
