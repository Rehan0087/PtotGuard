import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const queriesSource = await readFile(new URL("../../hooks/queries.ts", import.meta.url), "utf8");
const actionStateSource = await readFile(
  new URL("./mutation-action-state.ts", import.meta.url),
  "utf8",
);

test("mutation query hooks expose the complete officer workflow", () => {
  for (const hook of [
    "useStartMutationVerification",
    "useCompleteMutationVerification",
    "useMutationDecision",
  ]) {
    assert.match(queriesSource, new RegExp(`export function ${hook}\\b`));
  }

  assert.match(queriesSource, /start-verification/);
  assert.match(queriesSource, /complete-verification/);
  assert.match(queriesSource, /mutations\/\$\{id\}\/decision/);
});

test("mutation action presentation delegates workflow decisions to the shared gate", () => {
  assert.match(actionStateSource, /mutationActionGate/);
  assert.match(actionStateSource, /mutationActionGate\s*\(/);
  assert.doesNotMatch(actionStateSource, /mutation\.status\s*===\s*["']submitted["']/);
  assert.doesNotMatch(actionStateSource, /mutation\.status\s*===\s*["']verification["']/);
  assert.doesNotMatch(actionStateSource, /mutation\.status\s*===\s*["']objection-period["']/);
});
