import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { createContextPacket } from "../src/context/packet.js";

test("ctx pack classifies Vue auth bugfixes and exposes file evidence", () => {
  const root = createFixture("vue-auth");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "vue-auth", dependencies: { vue: "^3.0.0", vite: "^5.0.0" } }));
    writeProjectFile(root, "src/main.ts", "import './router';\nimport './api/request';\n");
    writeProjectFile(root, "src/router/index.ts", "export const routes = [];\nexport function redirectToLogin() {}\n");
    writeProjectFile(root, "src/api/request.ts", "export function request() { return Promise.resolve(401); }\nexport function refreshToken() {}\n");
    writeProjectFile(root, "src/stores/user.ts", "export const token = 'expired';\n");
    writeProjectFile(root, "src/views/login/Login.vue", "<template>login</template>\n");

    const packet = createContextPacket(root, "修复登录 token 过期后接口 401 跳转问题", { explain: true });

    assert.equal(packet.intent.type, "bugfix");
    assert.ok(packet.intent.confidence >= 0.7);
    assert.ok(packet.requiredFiles.some((file) => file.path === "src/api/request.ts"));
    assert.ok(packet.requiredFiles.some((file) => file.evidence.length > 0));
    assert.ok(packet.contextQuality.metrics.requiredCount > 0);
    assert.ok(packet.contextQuality.metrics.candidateCount >= packet.contextQuality.metrics.requiredCount);
    assert.equal(packet.qualityGate.status, "pass");
  } finally {
    removeFixture(root);
  }
});

test("ctx pack anchors React page feature work to the matching page directory", () => {
  const root = createFixture("react-feature");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "react-feature", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "src/App.tsx", "export function App() { return null; }\n");
    writeProjectFile(root, "src/pages/settings/index.tsx", "export function SettingsPage() { return null; }\n");
    writeProjectFile(root, "src/components/Button.tsx", "export function Button() { return null; }\n");

    const packet = createContextPacket(root, "add settings page feature", { explain: true });

    assert.equal(packet.intent.type, "feature");
    assert.ok(packet.scope.includes("src/pages/settings"));
    assert.ok(packet.requiredFiles.some((file) => file.path === "src/pages/settings/index.tsx"));
    assert.ok(packet.contextQuality.metrics.strongAnchors > 0);
    assert.equal(packet.qualityGate.status, "pass");
  } finally {
    removeFixture(root);
  }
});

test("ctx pack recognizes Next.js test tasks and keeps test files visible", () => {
  const root = createFixture("next-test");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "next-test", scripts: { test: "vitest" }, dependencies: { next: "^14.0.0", react: "^18.0.0" } }));
    writeProjectFile(root, "app/page.tsx", "export default function Home() { return null; }\n");
    writeProjectFile(root, "app/checkout/page.tsx", "export default function Checkout() { return null; }\n");
    writeProjectFile(root, "app/checkout/checkout.spec.tsx", "test('checkout route', () => {});\n");

    const packet = createContextPacket(root, "add regression test for checkout route", { explain: true });

    assert.equal(packet.intent.type, "test");
    assert.ok(packet.requiredFiles.some((file) => file.path.endsWith("checkout.spec.tsx")));
    assert.ok(packet.contextQuality.selectedFiles.some((file) => file.sources.includes("semantic-role")));
    assert.ok(packet.contextQuality.metrics.stable);
    assert.equal(packet.qualityGate.status, "pass");
  } finally {
    removeFixture(root);
  }
});

test("ctx pack resolves monorepo package context with multi-source evidence", () => {
  const root = createFixture("monorepo-pack");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "workspace-root", private: true, workspaces: ["apps/*", "packages/*"] }));
    writeProjectFile(root, "apps/web/package.json", JSON.stringify({ name: "@acme/web", dependencies: { "@acme/api": "workspace:*", react: "^18.0.0" } }));
    writeProjectFile(root, "apps/web/src/App.tsx", "import { request } from '../../../packages/api/src/request';\nexport function App() { request(); return null; }\n");
    writeProjectFile(root, "packages/api/package.json", JSON.stringify({ name: "@acme/api" }));
    writeProjectFile(root, "packages/api/src/index.ts", "export { request } from './request';\n");
    writeProjectFile(root, "packages/api/src/request.ts", "export function request() { return fetch('/billing'); }\n");

    const packet = createContextPacket(root, "refactor api package request client", { explain: true });

    assert.equal(packet.intent.type, "refactor");
    assert.ok(packet.packages.some((pkg) => pkg.path === "packages/api"));
    assert.ok(packet.requiredFiles.some((file) => file.path === "packages/api/src/request.ts"));
    assert.ok(packet.requiredFiles.some((file) => file.sources.length > 1));
    assert.ok(packet.contextQuality.metrics.multiEvidenceFiles > 0);
    assert.equal(packet.qualityGate.status, "pass");
  } finally {
    removeFixture(root);
  }
});

test("ctx pack marks weakly anchored tasks for review", () => {
  const root = createFixture("weak-anchor");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "weak-anchor", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "src/App.tsx", "export function App() { return null; }\n");

    const packet = createContextPacket(root, "improve something here", { explain: true });

    assert.notEqual(packet.qualityGate.status, "pass");
    assert.ok(packet.contextQuality.warnings.some((warning) => warning.type === "weak-anchor" || warning.type === "empty-required-context"));
    assert.equal(packet.phaseTransition.nextPhase, "refine-task");
  } finally {
    removeFixture(root);
  }
});

test("ctx pack resolves tsconfig path aliases into source graph evidence", () => {
  const root = createFixture("tsconfig-alias");
  try {
    writeProjectFile(
      root,
      "package.json",
      JSON.stringify({
        name: "tsconfig-alias",
        dependencies: { react: "^18.0.0" }
      })
    );
    writeProjectFile(
      root,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"]
          }
        }
      })
    );
    writeProjectFile(root, "src/App.tsx", "import { request } from '@/api/request';\nexport function App() { request(); return null; }\n");
    writeProjectFile(root, "src/api/request.ts", "export function request() { return fetch('/api'); }\n");

    const packet = createContextPacket(root, "fix api request", { explain: true });

    assert.equal(packet.intent.type, "bugfix");
    assert.ok(packet.packages.length === 0 || packet.scope.includes("src/api"));
    assert.ok(packet.requiredFiles.some((file) => file.path === "src/api/request.ts"));
    assert.ok(packet.contextQuality.selectedFiles.some((file) => file.sources.includes("source-graph") || file.sources.includes("content-preview")));
  } finally {
    removeFixture(root);
  }
});

test("ctx pack recognizes nested page features", () => {
  const root = createFixture("nested-feature");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "nested-feature", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "src/pages/account/profile/index.tsx", "export function ProfilePage() { return null; }\n");
    writeProjectFile(root, "src/pages/account/settings/index.tsx", "export function SettingsPage() { return null; }\n");

    const packet = createContextPacket(root, "update account profile page", { explain: true });

    assert.ok(packet.features.some((feature) => feature.path === "src/pages/account/profile" || feature.path === "src/pages/account"));
    assert.ok(packet.scope.some((scopePath) => scopePath.includes("src/pages/account/profile")));
    assert.ok(packet.requiredFiles.some((file) => file.path === "src/pages/account/profile/index.tsx"));
    assert.equal(packet.qualityGate.status, "pass");
  } finally {
    removeFixture(root);
  }
});

test("ctx pack includes readiness and handoff data for review-gate tasks", () => {
  const root = createFixture("handoff");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "handoff", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "src/App.tsx", "export function App() { return null; }\n");
    writeProjectFile(root, "src/pages/login/index.tsx", "export function LoginPage() { return null; }\n");

    const packet = createContextPacket(root, "review and fix login flow", { explain: true });

    assert.equal(packet.multiAgent.mode, "review-gate");
    assert.equal(packet.readiness.status, packet.qualityGate.status);
    assert.ok(packet.readiness.summary);
    assert.ok(packet.handoff.protocol.includes(".cortexa/multi-agent/collaboration.md"));
    assert.ok(packet.handoff.schema.includes(".cortexa/multi-agent/handoff.schema.json"));
    assert.equal(packet.handoff.mode, "review-gate");
    assert.ok(packet.handoff.nextAgent);
    assert.ok(packet.handoff.recommendedOrder.length > 0);
    assert.ok(packet.handoff.readiness);
    assert.ok(packet.handoff.phaseTransition);
    assert.equal(packet.phaseTransition.nextPhase, "execute");
    assert.ok(packet.handoff.executionPrompt.includes("You are working on a"));
    assert.ok(packet.handoff.executionPrompt.includes("Readiness gate"));
    assert.ok(packet.readiness.shouldProceed);
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
