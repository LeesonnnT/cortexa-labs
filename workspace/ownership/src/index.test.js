import assert from "node:assert/strict";
import { test } from "node:test";
import { createOwnershipMap } from "./index.js";

test("createOwnershipMap infers owners for packages, features, and entrypoints", () => {
  const map = createOwnershipMap({
    packages: [
      { path: "apps/web", name: "@acme/web", framework: "react", private: true },
      { path: "packages/shared", name: "@acme/shared", framework: "typescript", private: false }
    ],
    features: [
      { path: "src/pages/account/profile", name: "profile", kind: "route-feature" }
    ],
    semanticEntrypoints: [
      { path: "src/main.ts", kind: "application-entry" }
    ]
  });

  assert.equal(map.get("apps/web").owner, "frontend");
  assert.equal(map.get("packages/shared").owner, "platform");
  assert.equal(map.get("src/pages/account/profile").kind, "feature");
  assert.ok(map.get("src/main.ts"));
});
