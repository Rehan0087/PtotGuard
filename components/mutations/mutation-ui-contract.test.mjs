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
let mutationDecisionSuccessState;
let retryMutationQueue;
try {
  ({ mutationDecisionSuccessState, retryMutationQueue } = await import(
    "./mutation-page-state.mjs"
  ));
} catch {
  // The assertions below record a missing implementation as test failures.
}

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
    /const STATUS_FILTERS = \[\s*"all",\s*"submitted",\s*"under-primary-verification",\s*"field-investigation",\s*"field-verification-complete",\s*"approved",\s*"rejected",\s*"awaiting-dcr-payment",\s*"complete",?\s*\] as const;/,
  );
  assert.match(pageSource, /useSearchParams\(\)/);
  assert.match(pageSource, /router\.replace\(/);
  assert.match(pageSource, /<Suspense\s+fallback=/);
  assert.match(pageSource, /<MutationDetailDialog\b/);
  assert.match(pageSource, /<MutationDecisionDialog\b/);
  assert.match(pageSource, /href=\{`\/parcels\/\$\{mutation\.parcelId\}`\}/);
});

test("mutation cards use a sibling native overlay trigger instead of nesting controls in a button", () => {
  const card = pageSource.match(/function MutationCard[\s\S]*?\n}\n\n\/\*\*/)?.[0] ?? pageSource;
  assert.doesNotMatch(card, /<Card[\s\S]{0,250}\brole=["']button["']/);
  assert.doesNotMatch(card, /<Card[\s\S]{0,250}\btabIndex=/);
  assert.match(card, /<button\s+[\s\S]*?type=["']button["'][\s\S]*?aria-label=/);
  assert.match(card, /absolute inset-0/);
  assert.match(card, /<Button\b/);
  assert.match(card, /<Link\b/);
});

test("successful decisions switch from confirmation to refreshed selected detail", () => {
  assert.equal(typeof mutationDecisionSuccessState, "function");
  assert.deepEqual(mutationDecisionSuccessState("mutation-database-id"), {
    selectedMutationId: "mutation-database-id",
    decision: null,
    detailOpen: true,
  });
  assert.match(pageSource, /mutationDecisionSuccessState\(selectedMutationId\)/);
});

test("queue retry invokes and awaits both auth and list refreshes", async () => {
  assert.equal(typeof retryMutationQueue, "function");

  let resolveSession;
  let resolveList;
  let sessionCalls = 0;
  let listCalls = 0;
  const sessionRefresh = new Promise((resolve) => {
    resolveSession = resolve;
  });
  const listRefresh = new Promise((resolve) => {
    resolveList = resolve;
  });

  let settled = false;
  const retry = retryMutationQueue(
    () => {
      sessionCalls += 1;
      return sessionRefresh;
    },
    () => {
      listCalls += 1;
      return listRefresh;
    },
  ).then(() => {
    settled = true;
  });

  assert.equal(sessionCalls, 1);
  assert.equal(listCalls, 1);
  resolveSession();
  await Promise.resolve();
  assert.equal(settled, false, "retry must wait for the mutation list too");
  resolveList();
  await retry;
  assert.equal(settled, true);
  assert.match(pageSource, /retryMutationQueue\(/);
});
