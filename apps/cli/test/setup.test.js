import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../src/index.js", import.meta.url));

function createProject() {
  const root = mkdtempSync(join(process.cwd(), ".cortexa-cli-test-"));
  writeFileSync(join(root, "package.json"), '{ "name": "fixture-project" }\n');
  return root;
}

function runSetup(root, ...args) {
  return spawnSync(process.execPath, [cliPath, "setup", ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

function runTeardown(root, ...args) {
  return spawnSync(process.execPath, [cliPath, "teardown", ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

test("setup creates metadata and mainstream editor-native rule files by default", (t) => {
  const root = createProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = runSetup(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /agents: created AGENTS\.md/);
  assert.ok(existsSync(join(root, ".cortexa", "workspace.json")));
  assert.ok(existsSync(join(root, ".cursor", "rules", "cortexa-context.mdc")));
  assert.ok(existsSync(join(root, ".kiro", "steering", "cortexa-context.md")));
  assert.ok(existsSync(join(root, ".trae", "rules", "cortexa-context.md")));
  assert.ok(existsSync(join(root, ".windsurf", "rules", "cortexa-context.md")));
  assert.ok(existsSync(join(root, ".github", "copilot-instructions.md")));
  assert.ok(existsSync(join(root, ".clinerules", "cortexa-context.md")));
  assert.ok(existsSync(join(root, ".roo", "rules", "cortexa-context.md")));
  assert.ok(existsSync(join(root, ".amazonq", "rules", "cortexa-context.md")));
  assert.ok(existsSync(join(root, ".junie", "guidelines.md")));
  assert.ok(existsSync(join(root, ".continue", "rules", "cortexa-context.md")));
  assert.ok(existsSync(join(root, "CLAUDE.md")));
  assert.ok(existsSync(join(root, "GEMINI.md")));
  assert.ok(existsSync(join(root, "CONVENTIONS.md")));
});

test("setup updates managed content without duplicating AGENTS instructions", (t) => {
  const root = createProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.equal(runSetup(root, "--editors", "codex").status, 0);
  const repeated = runSetup(root, "--editors", "codex");
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");

  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal((agents.match(/<!-- cortexa:start -->/g) || []).length, 1);
  assert.match(repeated.stdout, /codex: updated AGENTS\.md/);
});

test("setup preserves an existing editor rule not managed by Cortexa", (t) => {
  const root = createProject();
  const rulePath = join(root, ".cursor", "rules", "cortexa-context.mdc");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  mkdirSync(join(root, ".cursor", "rules"), { recursive: true });
  writeFileSync(rulePath, "# Team owned rule\n");

  const result = runSetup(root, "--editors=cursor");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skipped \(existing custom rule\)/);
  assert.equal(readFileSync(rulePath, "utf8"), "# Team owned rule\n");
});

test("teardown removes managed editor files and keeps workspace metadata", (t) => {
  const root = createProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.equal(runSetup(root, "--editors", "cursor,claude").status, 0);
  const result = runTeardown(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /cursor: removed \.cursor/);
  assert.match(result.stdout, /claude: removed CLAUDE\.md/);
  assert.ok(existsSync(join(root, ".cortexa", "workspace.json")));
  assert.equal(existsSync(join(root, ".cortexa", "integrations.json")), false);
  assert.equal(existsSync(join(root, ".cursor", "rules", "cortexa-context.mdc")), false);
  assert.equal(existsSync(join(root, "CLAUDE.md")), false);
});

test("teardown cleans only the managed section from mixed files", (t) => {
  const root = createProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  writeFileSync(join(root, "AGENTS.md"), "# Team rules\n\nKeep this line.\n");
  assert.equal(runSetup(root, "--editors", "codex").status, 0);
  assert.equal(runTeardown(root).status, 0);

  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /Keep this line/);
  assert.doesNotMatch(agents, /cortexa:start/);
});

test("teardown purge removes Cortexa metadata", (t) => {
  const root = createProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.equal(runSetup(root, "--editors", "cursor").status, 0);
  const result = runTeardown(root, "--purge");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(root, ".cortexa")), false);
});
