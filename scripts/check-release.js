#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cliPackage = readJson(join(root, "apps", "cli", "package.json"));
const createPackage = readJson(join(root, "apps", "create-cortexa", "package.json"));

const checks = [
  ["root package metadata", checkRootPackage],
  ["cli package metadata", checkCliPackage],
  ["create-cortexa package metadata", checkCreatePackage],
  ["documentation files", checkDocumentation],
  ["cli smoke test", checkCliSmoke],
  ["initializer smoke test", checkInitializerSmoke],
  ["node test suite", checkNodeTests]
];

for (const [name, check] of checks) {
  try {
    check();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.message);
    process.exitCode = 1;
    break;
  }
}

function checkRootPackage() {
  const pkg = readJson(join(root, "package.json"));
  assert.equal(pkg.private, true);
  assert.ok(pkg.scripts.check, "root package must expose npm run check");
  assert.ok(pkg.scripts.test, "root package must expose npm test");
  assert.ok(pkg.scripts["check:release"], "root package must expose npm run check:release");
}

function checkCliPackage() {
  assert.equal(cliPackage.name, "@cortexa-labs/cli");
  assert.equal(cliPackage.type, "module");
  assert.equal(cliPackage.bin.ctx, "./src/index.js");
  assert.ok(cliPackage.files.includes("src"));
  assert.ok(cliPackage.files.includes("README.md"));
  assert.equal(cliPackage.engines.node, ">=18");
  assert.ok(readFileSync(join(root, "apps", "cli", "src", "index.js"), "utf8").startsWith("#!/usr/bin/env node"));
}

function checkCreatePackage() {
  assert.equal(createPackage.name, "create-cortexa");
  assert.equal(createPackage.type, "module");
  assert.equal(createPackage.bin["create-cortexa"], "./src/index.js");
  assert.ok(createPackage.files.includes("src"));
  assert.ok(createPackage.files.includes("README.md"));
  assert.equal(createPackage.engines.node, ">=18");
  assert.ok(readFileSync(join(root, "apps", "create-cortexa", "src", "index.js"), "utf8").startsWith("#!/usr/bin/env node"));
}

function checkDocumentation() {
  for (const path of ["README.md", "apps/cli/README.md", "apps/create-cortexa/README.md", "examples/minimal/README.md", "examples/minimal/package.json"]) {
    assert.ok(existsSync(join(root, path)), `${path} must exist`);
  }

  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.match(readme, /npm create cortexa@latest/);
  assert.match(readme, /ctx go --explain/);
  assert.doesNotMatch(readme, /\uFFFD/);
}

function checkCliSmoke() {
  run(process.execPath, [join(root, "apps", "cli", "src", "index.js"), "help"], root);
  run(process.execPath, [join(root, "apps", "cli", "src", "index.js"), "version"], root);
  run(process.execPath, [join(root, "apps", "cli", "src", "index.js"), "doctor"], root, { allowNonZero: true });
}

function checkInitializerSmoke() {
  const result = run(process.execPath, [join(root, "apps", "create-cortexa", "src", "index.js"), "--help"], root);
  assert.match(result.stdout, /Create Cortexa/);
}

function checkNodeTests() {
  run(process.execPath, ["--test", join(root, "apps", "cli", "test"), join(root, "apps", "create-cortexa", "test", "initializer.test.js"), join(root, "workspace", "ownership", "src", "index.test.js")], root);
  run(process.execPath, ["--test", join(root, "examples", "minimal")], root);
  runExampleLifecycle();
}

function runExampleLifecycle() {
  const fixture = mkdtempSync(join(tmpdir(), "cortexa-release-"));

  try {
    writeProjectFile(fixture, "package.json", JSON.stringify({ name: "release-fixture", dependencies: { react: "^18.0.0" } }, null, 2));
    writeProjectFile(fixture, "src/App.tsx", "export function App() { return null; }\n");

    const cli = join(root, "apps", "cli", "src", "index.js");
    run(process.execPath, [cli, "go", "--template", "frontend", "--editors", "codex", "--explain", "add settings page"], fixture);
    run(process.execPath, [cli, "audit"], fixture, { allowNonZero: true });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

function writeProjectFile(projectRoot, path, content) {
  const target = join(projectRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8"
  });

  if (!options.allowNonZero && result.status !== 0) {
    throw new Error([
      `${command} ${args.join(" ")} failed with ${result.status}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join("\n"));
  }

  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}
