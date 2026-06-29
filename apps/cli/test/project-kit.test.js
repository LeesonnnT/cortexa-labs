import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { setupProjectKit, updateProjectKit } from "../src/project-kit/index.js";
import { initializeWorkspace, resolveTemplate } from "../src/setup/options.js";
import { discoverWorkspace } from "../src/workspace/discovery.js";
import { specSnapshotEnd, specSnapshotStart } from "../src/documents/index.js";

test("ctx update preserves human edits around adapter snapshots", () => {
  const root = createFixture("project-kit-update");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "kit-update", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "src/App.tsx", "export function App() { return null; }\n");

    const discovery = discoverWorkspace(root);
    initializeWorkspace(root, "frontend");
    setupProjectKit(root, resolveTemplate("frontend", discovery));

    const designPath = join(root, ".cortexa", "specs", "project-overview", "design.md");
    const original = readFileSync(designPath, "utf8");
    const snapshotStart = original.indexOf(specSnapshotStart);
    const snapshotEnd = original.indexOf(specSnapshotEnd);
    const customPrefix = "## Team Note\n\nThis line must survive update.\n\n";
    writeFileSync(designPath, `${customPrefix}${original.slice(0, snapshotStart)}${original.slice(snapshotStart, snapshotEnd + specSnapshotEnd.length)}\n\n## Tail Note\n\nKeep me too.\n`);

    writeProjectFile(root, "src/pages/account/profile/index.tsx", "export function Profile() { return null; }\n");
    updateProjectKit(root, "frontend");

    const updated = readFileSync(designPath, "utf8");
    assert.match(updated, /This line must survive update\./);
    assert.match(updated, /Keep me too\./);
    assert.match(updated, /src\/pages\/account\/profile/);
    assert.match(updated, /<!-- cortexa:adapter-snapshot:start -->/);
    assert.match(updated, /<!-- cortexa:adapter-snapshot:end -->/);
  } finally {
    removeFixture(root);
  }
});

function createFixture(name) {
  return mkdtempSync(join(tmpdir(), `cortexa-${name}-`));
}

function writeProjectFile(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function removeFixture(root) {
  rmSync(root, { recursive: true, force: true });
}
