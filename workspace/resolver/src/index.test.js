import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { classifyTaskIntent, resolveContextPacket, resolveTaskFiles, selectContextScope } from "./index.js";

test("classifyTaskIntent recognizes Chinese bugfix tasks", () => {
  const intent = classifyTaskIntent("修复登录 token 过期后接口 401 跳转问题");

  assert.equal(intent.type, "bugfix");
  assert.ok(intent.confidence >= 0.7);
});

test("selectContextScope anchors API controller features", () => {
  const scope = selectContextScope(createWorkspace("."), "fix users api controller response");

  assert.ok(scope.includes("src/controllers"));
});

test("resolveTaskFiles selects backend controller evidence", () => {
  const root = createFixture("controller-evidence");
  try {
    writeProjectFile(root, "src/controllers/usersController.ts", "export function getUser() { return { id: 1, name: 'Ada' }; }\n");
    writeProjectFile(root, "src/routes/users.ts", "import { getUser } from '../controllers/usersController';\nexport const usersRouter = { getUser };\n");
    const workspace = createWorkspace(root);
    const resolved = resolveTaskFiles("fix users api controller response", workspace, ["src/controllers"]);

    assert.equal(resolved.resolver.strategy, "anchored-task-resolver");
    assert.ok(resolved.resolver.anchors.features.includes("src/controllers"));
    assert.ok(resolved.candidates.some((candidate) => candidate.path === "src/controllers/usersController.ts"));
    assert.ok(resolved.candidates.some((candidate) => candidate.sources.includes("semantic-role")));
  } finally {
    removeFixture(root);
  }
});

test("resolveContextPacket returns scope and candidates through the package facade", () => {
  const root = createFixture("facade");
  try {
    writeProjectFile(root, "src/api/request.ts", "export function request() { return fetch('/api/users'); }\n");
    const workspace = {
      root,
      features: [
        {
          name: "api",
          path: "src/api",
          kind: "api-feature",
          files: ["src/api/request.ts"]
        }
      ],
      packages: [],
      entrypoints: [],
      semanticEntrypoints: [],
      dependencyGraph: { edges: [] },
      sourceGraph: {
        nodes: [{ id: "src/api/request.ts", type: "source-file" }],
        edges: []
      }
    };

    const packet = resolveContextPacket("fix api request", workspace);

    assert.deepEqual(packet.scope, ["src/api"]);
    assert.ok(packet.candidates.some((candidate) => candidate.path === "src/api/request.ts"));
  } finally {
    removeFixture(root);
  }
});

function createWorkspace(root) {
  return {
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
}

function createFixture(name) {
  return mkdtempSync(join(tmpdir(), `cortexa-resolver-${name}-`));
}

function writeProjectFile(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function removeFixture(root) {
  rmSync(root, { recursive: true, force: true });
}
