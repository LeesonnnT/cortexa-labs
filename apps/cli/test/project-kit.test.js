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

test("workspace discovery resolves tsconfig baseUrl source imports", () => {
  const root = createFixture("baseurl-source-graph");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "baseurl-source-graph", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: "." } }));
    writeProjectFile(root, "src/App.tsx", "import { request } from 'src/api/request';\nexport function App() { request(); return null; }\n");
    writeProjectFile(root, "src/api/request.ts", "export function request() { return fetch('/api'); }\n");

    const discovery = discoverWorkspace(root);

    assert.ok(
      discovery.sourceGraph.edges.some(
        (edge) => edge.from === "src/App.tsx" && edge.to === "src/api/request.ts" && edge.type === "imports"
      )
    );
  } finally {
    removeFixture(root);
  }
});

test("workspace discovery resolves package-level tsconfig path aliases", () => {
  const root = createFixture("package-tsconfig-alias");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "workspace-root", private: true, workspaces: ["apps/*"] }));
    writeProjectFile(root, "apps/web/package.json", JSON.stringify({ name: "@acme/web", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(
      root,
      "apps/web/tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"]
          }
        }
      })
    );
    writeProjectFile(root, "apps/web/src/App.tsx", "import { request } from '@/api/request';\nexport function App() { request(); return null; }\n");
    writeProjectFile(root, "apps/web/src/api/request.ts", "export function request() { return fetch('/api'); }\n");

    const discovery = discoverWorkspace(root);

    assert.ok(
      discovery.sourceGraph.edges.some(
        (edge) => edge.from === "apps/web/src/App.tsx" && edge.to === "apps/web/src/api/request.ts" && edge.type === "imports"
      )
    );
  } finally {
    removeFixture(root);
  }
});

test("workspace discovery resolves root tsconfig extends path aliases", () => {
  const root = createFixture("root-tsconfig-extends");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "root-tsconfig-extends", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(
      root,
      "tsconfig.base.json",
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"]
          }
        }
      })
    );
    writeProjectFile(root, "tsconfig.json", JSON.stringify({ extends: "./tsconfig.base.json" }));
    writeProjectFile(root, "src/App.tsx", "import { request } from '@/api/request';\nexport function App() { request(); return null; }\n");
    writeProjectFile(root, "src/api/request.ts", "export function request() { return fetch('/api'); }\n");

    const discovery = discoverWorkspace(root);

    assert.ok(
      discovery.sourceGraph.edges.some(
        (edge) => edge.from === "src/App.tsx" && edge.to === "src/api/request.ts" && edge.type === "imports"
      )
    );
  } finally {
    removeFixture(root);
  }
});

test("workspace discovery resolves package tsconfig extending root path aliases", () => {
  const root = createFixture("package-tsconfig-extends");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "workspace-root", private: true, workspaces: ["apps/*"] }));
    writeProjectFile(
      root,
      "tsconfig.base.json",
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@web/*": ["apps/web/src/*"]
          }
        }
      })
    );
    writeProjectFile(root, "apps/web/package.json", JSON.stringify({ name: "@acme/web", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "apps/web/tsconfig.json", JSON.stringify({ extends: "../../tsconfig.base.json" }));
    writeProjectFile(root, "apps/web/src/App.tsx", "import { request } from '@web/api/request';\nexport function App() { request(); return null; }\n");
    writeProjectFile(root, "apps/web/src/api/request.ts", "export function request() { return fetch('/api'); }\n");

    const discovery = discoverWorkspace(root);

    assert.ok(
      discovery.sourceGraph.edges.some(
        (edge) => edge.from === "apps/web/src/App.tsx" && edge.to === "apps/web/src/api/request.ts" && edge.type === "imports"
      )
    );
  } finally {
    removeFixture(root);
  }
});

test("workspace discovery resolves root jsconfig path aliases", () => {
  const root = createFixture("root-jsconfig-alias");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "root-jsconfig-alias", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(
      root,
      "jsconfig.json",
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"]
          }
        }
      })
    );
    writeProjectFile(root, "src/App.jsx", "import { request } from '@/api/request';\nexport function App() { request(); return null; }\n");
    writeProjectFile(root, "src/api/request.js", "export function request() { return fetch('/api'); }\n");

    const discovery = discoverWorkspace(root);

    assert.ok(
      discovery.sourceGraph.edges.some(
        (edge) => edge.from === "src/App.jsx" && edge.to === "src/api/request.js" && edge.type === "imports"
      )
    );
  } finally {
    removeFixture(root);
  }
});

test("workspace discovery resolves package-level jsconfig path aliases", () => {
  const root = createFixture("package-jsconfig-alias");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "workspace-root", private: true, workspaces: ["apps/*"] }));
    writeProjectFile(root, "apps/web/package.json", JSON.stringify({ name: "@acme/web", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(
      root,
      "apps/web/jsconfig.json",
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["src/*"]
          }
        }
      })
    );
    writeProjectFile(root, "apps/web/src/App.jsx", "import { request } from '@/api/request';\nexport function App() { request(); return null; }\n");
    writeProjectFile(root, "apps/web/src/api/request.js", "export function request() { return fetch('/api'); }\n");

    const discovery = discoverWorkspace(root);

    assert.ok(
      discovery.sourceGraph.edges.some(
        (edge) => edge.from === "apps/web/src/App.jsx" && edge.to === "apps/web/src/api/request.js" && edge.type === "imports"
      )
    );
  } finally {
    removeFixture(root);
  }
});

test("workspace discovery recognizes Nuxt entrypoints", () => {
  const root = createFixture("nuxt-entrypoints");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "nuxt-entrypoints", dependencies: { nuxt: "^3.0.0", vue: "^3.0.0" } }));
    writeProjectFile(root, "nuxt.config.ts", "export default defineNuxtConfig({});\n");
    writeProjectFile(root, "app.vue", "<template><NuxtPage /></template>\n");
    writeProjectFile(root, "pages/index.vue", "<template>home</template>\n");
    writeProjectFile(root, "server/api/users.get.ts", "export default defineEventHandler(() => []);\n");
    writeProjectFile(root, "plugins/api.ts", "export default defineNuxtPlugin(() => {});\n");
    writeProjectFile(root, "composables/useUser.ts", "export function useUser() { return null; }\n");

    const discovery = discoverWorkspace(root);

    assert.ok(discovery.frameworks.includes("nuxt"));
    assert.ok(discovery.semanticEntrypoints.some((entrypoint) => entrypoint.path === "app.vue" && entrypoint.kind === "nuxt-root"));
    assert.ok(discovery.semanticEntrypoints.some((entrypoint) => entrypoint.path === "pages" && entrypoint.kind === "nuxt-pages"));
    assert.ok(discovery.semanticEntrypoints.some((entrypoint) => entrypoint.path === "server/api" && entrypoint.kind === "nuxt-server-api"));
    assert.ok(discovery.semanticEntrypoints.some((entrypoint) => entrypoint.path === "plugins" && entrypoint.kind === "nuxt-plugin"));
    assert.ok(discovery.semanticEntrypoints.some((entrypoint) => entrypoint.path === "composables" && entrypoint.kind === "composable-entry"));
    assert.ok(discovery.features.some((feature) => feature.path === "server/api" && feature.kind === "api-feature"));
    assert.ok(discovery.features.some((feature) => feature.path === "composables" && feature.kind === "composable-feature"));
    assert.ok(discovery.features.some((feature) => feature.path === "plugins" && feature.kind === "plugin-feature"));
  } finally {
    removeFixture(root);
  }
});

test("workspace discovery recognizes Next src app router and API routes", () => {
  const root = createFixture("next-src-app");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "next-src-app", dependencies: { next: "^14.0.0", react: "^18.0.0" } }));
    writeProjectFile(root, "next.config.js", "module.exports = {};\n");
    writeProjectFile(root, "src/app/page.tsx", "export default function Page() { return null; }\n");
    writeProjectFile(root, "src/app/users/page.tsx", "export default function UsersPage() { return null; }\n");
    writeProjectFile(root, "src/app/api/users/route.ts", "export function GET() { return Response.json([]); }\n");

    const discovery = discoverWorkspace(root);

    assert.ok(discovery.frameworks.includes("nextjs"));
    assert.ok(discovery.semanticEntrypoints.some((entrypoint) => entrypoint.path === "src/app/page.tsx" && entrypoint.kind === "next-app-router"));
    assert.ok(discovery.semanticEntrypoints.some((entrypoint) => entrypoint.path === "src/app" && entrypoint.kind === "next-app-router"));
    assert.ok(discovery.semanticEntrypoints.some((entrypoint) => entrypoint.path === "src/app/api" && entrypoint.kind === "next-api-route"));
    assert.ok(discovery.features.some((feature) => feature.path === "src/app/api" && feature.kind === "api-feature"));
  } finally {
    removeFixture(root);
  }
});

test("workspace discovery recognizes frontend data layer feature roots", () => {
  const root = createFixture("frontend-data-roots");
  try {
    writeProjectFile(root, "package.json", JSON.stringify({ name: "frontend-data-roots", dependencies: { react: "^18.0.0" } }));
    writeProjectFile(root, "src/App.tsx", "export function App() { return null; }\n");
    writeProjectFile(root, "src/api/request.ts", "export function request() { return fetch('/api'); }\n");
    writeProjectFile(root, "src/services/user.ts", "export function getUser() { return null; }\n");
    writeProjectFile(root, "src/hooks/useUser.ts", "export function useUser() { return null; }\n");
    writeProjectFile(root, "src/utils/format.ts", "export function format() { return ''; }\n");

    const discovery = discoverWorkspace(root);

    assert.ok(discovery.features.some((feature) => feature.path === "src/api" && feature.kind === "api-feature"));
    assert.ok(discovery.features.some((feature) => feature.path === "src/services" && feature.kind === "service-feature"));
    assert.ok(discovery.features.some((feature) => feature.path === "src/hooks" && feature.kind === "hook-feature"));
    assert.ok(discovery.features.some((feature) => feature.path === "src/utils" && feature.kind === "utility-feature"));
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
