import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { adaptProjectBindings, readProjectBindings } from "../src/adapters/project/bindings.js";
import { createContextPacket } from "../src/context/packet.js";
import { syncCodexSkillProjections } from "../src/editors/codex-skills.js";
import { setupProjectKit } from "../src/project-kit/index.js";
import { auditWorkspace } from "../src/reports/audit.js";
import { initializeWorkspace, resolveTemplate } from "../src/setup/options.js";
import { discoverWorkspace } from "../src/workspace/discovery.js";

test("ctx adapt infers project bindings and ctx pack reads confirmed project documents", () => {
  const root = createFixture("binding-packet");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "binding-packet", dependencies: { vue: "^3.0.0", vite: "^5.0.0" } }));
    writeProjectFile(root, "src/main.ts", "export {};\n");
    writeProjectFile(root, "src/views/Settings.vue", "<template>settings</template>\n");
    writeProjectFile(root, "docs/frontend/responsive-ui.md", "# Project responsive rules\n");

    const discovery = discoverWorkspace(root);
    initializeWorkspace(root, "frontend");
    setupProjectKit(root, resolveTemplate("frontend", discovery));
    const inferred = readProjectBindings(root);
    const responsive = inferred.bindings.find((binding) => binding.capability === "responsive-ui");

    assert.equal(responsive.status, "inferred");
    assert.deepEqual(responsive.projectSources, ["docs/frontend/responsive-ui.md"]);

    responsive.status = "confirmed";
    writeProjectFile(root, ".cortexa/adapters/project-bindings.json", JSON.stringify(inferred, null, 2));

    const packet = createContextPacket(root, "fix responsive breakpoint", { explain: true });

    assert.ok(packet.projectBindings.some((binding) => binding.capability === "responsive-ui" && binding.status === "confirmed"));
    assert.ok(packet.projectDocuments.some((document) => document.path === "docs/frontend/responsive-ui.md" && document.required));
    assert.ok(packet.readingOrder.some((item) => item.path === "docs/frontend/responsive-ui.md" && item.type === "project-binding"));
    assert.ok(packet.tokenBudget.breakdown.projectDocuments > 0);
  } finally {
    removeFixture(root);
  }
});

test("ctx adapt preserves confirmed mappings and records Pack lock", () => {
  const root = createFixture("binding-preserve");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "binding-preserve", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "src/App.tsx", "export function App() { return null; }\n");
    writeProjectFile(root, "docs/frontend/dialog.md", "# Dialog\n");

    const discovery = discoverWorkspace(root);
    const first = adaptProjectBindings(root, discovery);
    const dialog = first.manifest.bindings.find((binding) => binding.capability === "dialog-governance");
    dialog.status = "confirmed";
    dialog.projectSources = ["docs/custom/dialog-policy.md"];
    writeProjectFile(root, "docs/custom/dialog-policy.md", "# Custom dialog policy\n");
    writeProjectFile(root, ".cortexa/adapters/project-bindings.json", JSON.stringify(first.manifest, null, 2));

    const second = adaptProjectBindings(root, discovery);
    const preserved = second.manifest.bindings.find((binding) => binding.capability === "dialog-governance");

    assert.equal(preserved.status, "confirmed");
    assert.deepEqual(preserved.projectSources, ["docs/custom/dialog-policy.md"]);
    assert.ok(existsSync(second.lockPath));
  } finally {
    removeFixture(root);
  }
});

test("Codex projection exposes Cortexa Skills without overwriting custom Skills", () => {
  const root = createFixture("codex-projection");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "codex-projection", dependencies: { vue: "^3.0.0" } }));
    writeProjectFile(root, "src/main.ts", "export {};\n");
    const discovery = discoverWorkspace(root);
    initializeWorkspace(root, "frontend");
    setupProjectKit(root, resolveTemplate("frontend", discovery));
    writeProjectFile(root, ".cortexa/integrations.json", JSON.stringify({ version: 1, editors: ["codex"] }, null, 2));

    const generated = syncCodexSkillProjections(root);
    const projectedPath = join(root, ".agents", "skills", "cortexa-project-understanding", "SKILL.md");

    assert.ok(generated.some((skill) => skill.id === "cortexa-project-understanding"));
    assert.ok(existsSync(projectedPath));
    assert.match(readFileSync(projectedPath, "utf8"), /^---\nname: cortexa-project-understanding\n/m);
    assert.match(readFileSync(projectedPath, "utf8"), /description:/);
    assert.match(readFileSync(projectedPath, "utf8"), /\.cortexa\/skills\/project-understanding\/SKILL\.md/);

    writeProjectFile(root, ".agents/skills/cortexa-project-understanding/SKILL.md", "---\nname: custom\ndescription: custom\n---\n");
    const second = syncCodexSkillProjections(root);

    assert.equal(second.find((skill) => skill.id === "cortexa-project-understanding")?.status, "已跳过（存在自定义 Skill）");
  } finally {
    removeFixture(root);
  }
});

test("ctx audit reports unconfirmed bindings and missing Codex projections", () => {
  const root = createFixture("binding-audit");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "binding-audit", dependencies: { vue: "^3.0.0" } }));
    writeProjectFile(root, "src/main.ts", "export {};\n");
    writeProjectFile(root, "docs/frontend/responsive-ui.md", "# Responsive\n");
    const discovery = discoverWorkspace(root);
    initializeWorkspace(root, "frontend");
    setupProjectKit(root, resolveTemplate("frontend", discovery));
    writeProjectFile(root, ".cortexa/integrations.json", JSON.stringify({ version: 1, editors: ["codex"] }, null, 2));

    const result = auditWorkspace(root);

    assert.equal(result.report.checks.find((check) => check.id === "bindings.confirmation")?.status, "warn");
    assert.equal(result.report.checks.find((check) => check.id === "codex.skill-projections")?.status, "warn");
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
