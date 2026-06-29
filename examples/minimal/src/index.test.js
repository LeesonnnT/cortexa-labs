import assert from "node:assert/strict";
import { test } from "node:test";
import { createGreeting } from "./index.js";

test("creates a greeting", () => {
  assert.equal(createGreeting("workspace"), "Hello, workspace");
});
