import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const queriesSource = await readFile(new URL("../../hooks/queries.ts", import.meta.url), "utf8");
const actionStateSource = await readFile(
  new URL("./mutation-action-state.ts", import.meta.url),
  "utf8",
);
const pageSource = await readFile(
  new URL("../../app/(app)/mutations/page.tsx", import.meta.url),
  "utf8",
);
const decisionSource = await readFile(
  new URL("./mutation-decision-dialog.tsx", import.meta.url),
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

test("mutations page integrates the complete URL-backed officer workflow", () => {
  const queryHookImport = pageSource.match(
    /import\s*{(?<imports>[^}]*)}\s*from\s*["']@\/hooks\/queries["'];/,
  );
  assert.ok(queryHookImport?.groups?.imports, "expected a named import from @/hooks/queries");

  for (const hook of [
    "useStartMutationVerification",
    "useCompleteMutationVerification",
    "useMutationDecision",
  ]) {
    assert.match(queryHookImport.groups.imports, new RegExp(`\\b${hook}\\b`));
  }

  assert.match(pageSource, /const SCOPE_FILTERS = \["all", "assigned"\] as const;/);
  assert.match(
    pageSource,
    /const STATUS_FILTERS = \[\s*"all",\s*"submitted",\s*"verification",\s*"objection-period",\s*"approved",\s*"rejected",?\s*\] as const;/,
  );
  assert.match(pageSource, /useSearchParams\(\)/);
  assert.match(pageSource, /router\.replace\(/);
  assert.match(pageSource, /<Suspense\s+fallback=/);
  assert.match(pageSource, /<MutationDetailDialog\b/);
  assert.match(pageSource, /<MutationDecisionDialog\b/);
  assert.match(pageSource, /href=\{`\/parcels\/\$\{mutation\.parcelId\}`\}/);
});

test("successful decisions switch from confirmation to refreshed selected detail", () => {
  assert.match(decisionSource, /onSuccess\?: \(\) => void;/);
  assert.match(decisionSource, /onSuccess\?\.\(\);/);
  assert.match(decisionSource, /disabled=\{!canSubmit\}/);
  assert.match(
    pageSource,
    /onSuccess=\{\(\) => \{\s*setDecision\(null\);\s*setDetailOpen\(true\);\s*}\}/,
  );
});

test("queue retry refreshes auth and list through one pending action", () => {
  assert.match(pageSource, /await Promise\.all\(\[session\.refetch\(\), refetch\(\)\]\)/);
  assert.match(pageSource, /disabled=\{retrying\}/);
  assert.match(pageSource, /onClick=\{\(\) => void retryQueue\(\)\}/);
});
