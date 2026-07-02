import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

    const packet = JSON.parse(result.stdout);
    assert.equal(packet.schema, "cortexa.context-packet");
    assert.equal(packet.schemaVersion, 1);
    assert.equal(packet.task, "update settings page");
    assert.ok(packet.readiness);
    assert.ok(packet.phaseTransition);
    assert.ok(packet.requiredFiles.some((file) => file.path === "src/pages/settings/index.tsx"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeProjectFile(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
