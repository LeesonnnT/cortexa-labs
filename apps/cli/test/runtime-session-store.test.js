import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { recordContextPacketSession } from "../src/runtime/session-store.js";

test("ctx go runtime store records independent session and cache files", () => {
  const root = mkdtempSync(join(tmpdir(), "cortexa-runtime-store-"));
  try {
    const packet = {
      schema: "cortexa.context-packet",
      schemaVersion: 1,
      task: "update settings page",
      generatedAt: "2026-07-02T00:00:00.000Z",
      qualityGate: { status: "pass" },
      requiredFiles: [{ path: "src/pages/settings/index.tsx" }],
      optionalFiles: []
    };

    const result = recordContextPacketSession(root, "update settings page", packet, {
      now: "2026-07-02T00:00:01.000Z"
    });

    assert.equal(result.state.schema, "cortexa.runtime-state");
    assert.equal(result.session.schema, "cortexa.runtime-session");
    assert.equal(result.session.status, "context-ready");
    assert.equal(result.paths.state, ".cortexa/runtime/state.json");
    assert.equal(result.state.sessions.length, 1);
    assert.equal(result.state.cache.entries.length, 1);
    assert.equal(result.state.activeSessionId, result.session.id);
    assert.ok(result.session.cacheKeys.includes(result.state.cache.entries[0].key));
    assert.ok(existsSync(join(root, result.paths.session)));
    assert.ok(existsSync(join(root, result.paths.cache)));

    const state = JSON.parse(readFileSync(join(root, result.paths.state), "utf8"));
    const session = JSON.parse(readFileSync(join(root, result.paths.session), "utf8"));
    const cachedPacket = JSON.parse(readFileSync(join(root, result.paths.cache), "utf8"));
    assert.equal(state.sessions[0].sessionRef, result.paths.session);
    assert.equal(session.contextPacketRef.valueRef, result.paths.cache);
    assert.deepEqual(cachedPacket, packet);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
