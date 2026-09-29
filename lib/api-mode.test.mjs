import assert from "node:assert/strict";
import test from "node:test";
import { isApiMockingEnabled } from "./api-mode.ts";

test("development defaults both client and proxy to the local API", () => {
  assert.equal(isApiMockingEnabled(undefined, "development"), true);
});

test("the persistent backend must be selected explicitly", () => {
  assert.equal(isApiMockingEnabled("disabled", "development"), false);
  assert.equal(isApiMockingEnabled("disabled", "production"), false);
});

test("production only uses local API mode when explicitly enabled", () => {
  assert.equal(isApiMockingEnabled(undefined, "production"), false);
  assert.equal(isApiMockingEnabled("enabled", "production"), true);
});
