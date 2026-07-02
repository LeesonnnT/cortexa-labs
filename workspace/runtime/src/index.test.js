import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activateRuntimeSession,
  attachContextPacket,
  createCacheKey,
  createRuntimeSession,
  createRuntimeState,
  recordValidationResult,
  registerCacheEntry,
  transitionRuntimeSession
} from "./index.js";

const now = "2026-07-02T00:00:00.000Z";

test("创建初始 runtime 状态", () => {
  const state = createRuntimeState({ workspaceRoot: "D:/repo", now });

  assert.equal(state.schema, "cortexa.runtime-state");
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.status, "idle");
  assert.equal(state.workspaceRoot, "D:/repo");
  assert.deepEqual(state.sessions, []);
  assert.deepEqual(state.cache.entries, []);
});

test("创建任务 session 并绑定 Context Packet 摘要", () => {
  const session = createRuntimeSession({
    task: "fix api request",
    workspaceRoot: "D:/repo",
    now,
    contextPacket: {
      schema: "cortexa.context-packet",
      schemaVersion: 1,
      task: "fix api request",
      generatedAt: now,
      qualityGate: { status: "pass" },
      requiredFiles: [{ path: "src/api/request.ts" }],
      optionalFiles: []
    }
  });

  assert.equal(session.schema, "cortexa.runtime-session");
  assert.equal(session.status, "context-ready");
  assert.equal(session.contextPacketRef.qualityGate, "pass");
  assert.equal(session.contextPacketRef.requiredFileCount, 1);
  assert.ok(session.events.some((event) => event.type === "context-attached"));
});

test("激活 session 并记录状态流转", () => {
  const state = createRuntimeState({ workspaceRoot: "D:/repo", now });
  const session = createRuntimeSession({ task: "fix api request", workspaceRoot: "D:/repo", now });
  const running = transitionRuntimeSession(session, "running", {
    now: "2026-07-02T00:01:00.000Z",
    reason: "开始执行"
  });
  const activeState = activateRuntimeSession(state, running, {
    now: "2026-07-02T00:01:00.000Z"
  });

  assert.equal(running.status, "running");
  assert.ok(running.events.some((event) => event.type === "status-changed" && event.details.to === "running"));
  assert.equal(activeState.status, "running");
  assert.equal(activeState.activeSessionId, running.id);
  assert.equal(activeState.sessions.length, 1);
});

test("记录验证结果并根据结果更新 session 状态", () => {
  const session = createRuntimeSession({ task: "fix api request", now });
  const completed = recordValidationResult(session, {
    command: "npm test",
    status: "pass",
    summary: "测试通过"
  }, {
    now: "2026-07-02T00:02:00.000Z"
  });

  assert.equal(completed.status, "completed");
  assert.equal(completed.validationResults.length, 1);
  assert.equal(completed.validationResults[0].command, "npm test");
  assert.ok(completed.events.some((event) => event.type === "validation-recorded"));
});

test("生成稳定 cache key 并登记 cache entry", () => {
  const state = createRuntimeState({ now });
  const keyA = createCacheKey({ task: "fix api request", scope: ["src/api"] });
  const keyB = createCacheKey({ scope: ["src/api"], task: "fix api request" });
  const updated = registerCacheEntry(state, {
    key: keyA,
    kind: "context-packet",
    valueRef: ".cortexa/runtime/cache/context.json"
  }, {
    now: "2026-07-02T00:03:00.000Z"
  });

  assert.equal(keyA, keyB);
  assert.equal(updated.cache.entries.length, 1);
  assert.equal(updated.cache.entries[0].kind, "context-packet");
});

test("可以在已有 session 上追加 Context Packet", () => {
  const session = createRuntimeSession({ task: "fix api request", now });
  const ready = attachContextPacket(session, {
    schema: "cortexa.context-packet",
    schemaVersion: 1,
    task: "fix api request",
    qualityGate: { status: "review" },
    requiredFiles: [],
    optionalFiles: []
  }, {
    now: "2026-07-02T00:04:00.000Z"
  });

  assert.equal(ready.status, "context-ready");
  assert.equal(ready.contextPacketRef.qualityGate, "review");
  assert.ok(ready.events.some((event) => event.type === "context-attached"));
});
