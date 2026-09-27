import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_ACCOUNTS } from "../demo-accounts.ts";
import { parcels, users } from "./data.ts";

test("every displayed demo login resolves to its own active user record", () => {
  for (const account of DEMO_ACCOUNTS) {
    const user = users.find(
      (candidate) => candidate.email.toLowerCase() === account.email.toLowerCase(),
    );

    assert.ok(user, `${account.email} is missing from the mock user data`);
    assert.equal(user.name, account.name);
    assert.equal(user.role, account.role);
    assert.equal(user.status, "active");
  }
});

test("citizen demo logins resolve to distinct citizen identities", () => {
  const citizenIds = DEMO_ACCOUNTS
    .filter((account) => account.role === "citizen")
    .map((account) => users.find((user) => user.email === account.email)?.id);

  assert.ok(citizenIds.every(Boolean));
  assert.equal(new Set(citizenIds).size, citizenIds.length);
});

test("each added citizen identity sees its own dashboard parcels", () => {
  for (const email of [
    "demo2@example.bd",
    "demo3@example.bd",
    "demo4@example.bd",
    "demo5@example.bd",
  ]) {
    const user = users.find((candidate) => candidate.email === email);
    assert.ok(user);
    assert.ok(
      parcels.some((parcel) => parcel.ownerId === user.id),
      `${email} has no citizen dashboard parcel data`,
    );
  }
});
