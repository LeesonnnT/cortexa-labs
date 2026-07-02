import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

test("ctx go initializes missing Cortexa assets and prints a Context Packet", () => {
  const root = mkdtempSync(join(tmpdir(), "cortexa-go-"));
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "go-fixture", dependencies: { react: "^18.0.0" } }, null, 2));
    writeProjectFile(root, "src/pages/settings/index.tsx", "export function SettingsPage() { return null; }\n");

    const cli = join(repoRoot, "apps", "cli", "src", "index.js");
    const result = spawnSync(process.execPath, [cli, "go", "--explain", "update settings page"], {
      cwd: root,
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(existsSync(join(root, ".cortexa", "workspace.json")));
    assert.ok(existsSync(join(root, ".cortexa", "context-manifest.json")));
    assert.ok(existsSync(join(root, ".cortexa", "runtime", "state.json")));

    const packet = JSON.parse(result.stdout);
    assert.equal(packet.schema, "cortexa.context-packet");
    assert.equal(packet.schemaVersion, 1);
    assert.equal(packet.task, "update settings page");
    assert.ok(packet.readiness);
    assert.ok(packet.phaseTransition);
    assert.ok(packet.requiredFiles.some((file) => file.path === "src/pages/settings/index.tsx"));

    const state = JSON.parse(readFileSync(join(root, ".cortexa", "runtime", "state.json"), "utf8"));
    const sessionFiles = readdirSync(join(root, ".cortexa", "runtime", "sessions")).filter((file) => file.endsWith(".json"));
    const cacheFiles = readdirSync(join(root, ".cortexa", "runtime", "cache")).filter((file) => file.endsWith(".context-packet.json"));
    assert.equal(state.schema, "cortexa.runtime-state");
    assert.equal(state.status, "context-ready");
    assert.equal(state.sessions.length, 1);
    assert.equal(state.cache.entries.length, 1);
    assert.equal(sessionFiles.length, 1);
    assert.equal(cacheFiles.length, 1);

    const session = JSON.parse(readFileSync(join(root, ".cortexa", "runtime", "sessions", sessionFiles[0]), "utf8"));
    const cachedPacket = JSON.parse(readFileSync(join(root, ".cortexa", "runtime", "cache", cacheFiles[0]), "utf8"));
    assert.equal(session.schema, "cortexa.runtime-session");
    assert.equal(session.task, "update settings page");
    assert.deepEqual(cachedPacket.requiredFiles, packet.requiredFiles);

    const sessionsResult = spawnSync(process.execPath, [cli, "sessions"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(sessionsResult.status, 0, sessionsResult.stderr || sessionsResult.stdout);
    const sessionsState = JSON.parse(sessionsResult.stdout);
    assert.equal(sessionsState.activeSessionId, session.id);
    assert.equal(sessionsState.cache.entries[0].valueRef, session.contextPacketRef.valueRef);

    const latestResult = spawnSync(process.execPath, [cli, "sessions", "--latest"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(latestResult.status, 0, latestResult.stderr || latestResult.stdout);
    const latestSession = JSON.parse(latestResult.stdout);
    assert.equal(latestSession.id, session.id);
    assert.equal(latestSession.contextPacketRef.cacheKey, session.contextPacketRef.cacheKey);

    const byIdResult = spawnSync(process.execPath, [cli, "sessions", "--id", session.id], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(byIdResult.status, 0, byIdResult.stderr || byIdResult.stdout);
    assert.equal(JSON.parse(byIdResult.stdout).id, session.id);

    const packetResult = spawnSync(process.execPath, [cli, "sessions", "--id", session.id, "--packet"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(packetResult.status, 0, packetResult.stderr || packetResult.stdout);
    assert.deepEqual(JSON.parse(packetResult.stdout).requiredFiles, packet.requiredFiles);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeProjectFile(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
