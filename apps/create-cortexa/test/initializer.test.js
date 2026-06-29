import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

test("npm create cortexa initializes a project from a local CLI spec", () => {
  const fixture = mkdtempSync(join(tmpdir(), "cortexa-create-"));
  try {
    writeProjectFile(fixture, "package.json", JSON.stringify({ name: "initializer-fixture", dependencies: { react: "^18.0.0" } }, null, 2));
    writeProjectFile(fixture, "src/App.tsx", "export function App() { return null; }\n");

    const initializer = join(repoRoot, "apps", "create-cortexa", "src", "index.js");
    const cliSpec = pathToFileURL(join(repoRoot, "apps", "cli")).href;
    const env = {
      ...process.env,
      CORTEXA_CLI_SPEC: cliSpec,
      npm_execpath: "npm"
    };

    const initResult = spawnSync(process.execPath, [initializer, "--yes"], {
      cwd: fixture,
      env,
      encoding: "utf8"
    });

    assert.equal(initResult.status, 0, initResult.stderr || initResult.stdout);
    assert.ok(existsSync(join(fixture, ".cortexa", "workspace.json")));
    assert.ok(existsSync(join(fixture, ".cortexa", "context-manifest.json")));
    assert.ok(existsSync(join(fixture, "node_modules", "@cortexa-labs", "cli", "src", "index.js")));

    const cliEntry = join(fixture, "node_modules", "@cortexa-labs", "cli", "src", "index.js");
    const doctorResult = spawnSync(process.execPath, [cliEntry, "doctor"], {
      cwd: fixture,
      env,
      encoding: "utf8"
    });

    assert.equal(doctorResult.status, 0, doctorResult.stderr || doctorResult.stdout);
    assert.match(doctorResult.stdout, /status/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

function writeProjectFile(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
