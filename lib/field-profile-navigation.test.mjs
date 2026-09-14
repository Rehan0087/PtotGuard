import assert from "node:assert/strict";
import test from "node:test";
import { NAV, profileHrefForRole } from "./nav.ts";

test("field agent sidebar omits profile while the account menu retains it", () => {
  const profile = NAV["field-agent"].items.find((item) => item.labelKey === "profile");
  assert.equal(profile, undefined);
  assert.equal(profileHrefForRole("field-agent"), "/field/profile");
});

test("the account menu keeps field agents inside their portal", () => {
  assert.equal(profileHrefForRole("field-agent"), "/field/profile");
  assert.equal(profileHrefForRole("citizen"), "/profile");
});
