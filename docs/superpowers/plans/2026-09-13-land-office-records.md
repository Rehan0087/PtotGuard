# Land Office Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Land Office Records list and a dedicated record-detail view read real parcel data and its existing ownership, mutation, dispute, document, jurisdiction, and audit relationships without adding a duplicate record model or permitting ownership edits.

**Architecture:** Keep `Parcel` as the persisted record and extend the existing `/parcels` NestJS/MSW contracts with Land Office jurisdiction scoping plus `GET /parcels/:id/record`. Add one shared aggregate type, a TanStack Query hook, and a dedicated `/records/[id]` client page that reuses the current cards, tables, badges, map, and navigation patterns. Existing Mutation approval remains the only ownership-changing path.

**Tech Stack:** Next.js App Router, React, TypeScript, TanStack Query, NestJS, Prisma/PostgreSQL, MSW, Vitest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-11-records-module-design.md`

## Global Constraints

- Preserve the existing `/records` layout, table, filters, styling, and components.
- Reuse `Parcel`, `OwnershipRecord`, `Mutation`, `Dispute`, `LandDocument`, `Jurisdiction`, and `AuditEvent`; add no duplicate persistence model.
- Do not expose a Records write that changes `Parcel.ownerId`, `OwnershipRecord`, or mutation history.
- Keep Citizen Portal `/parcels/:id` behavior unchanged.
- Real API and MSW preview responses must stay contract-compatible.

---

### Task 1: Shared Records aggregate contract

**Files:**
- Modify: `packages/rules/src/types/api.ts`
- Modify: `packages/rules/src/types/index.ts`
- Test: `packages/rules/src/types/records.test.ts`

**Interfaces:**
- Consumes: Existing `Parcel`, `OwnershipRecord`, `Mutation`, `Dispute`, `LandDocument`, `ParcelRestriction`, `AuditEvent`, and `Jurisdiction` domain types.
- Produces: `LandRecordDetail`, `LandRecordOwner`, `LandRecordJurisdiction`, and `LandRecordOwnershipEvent` response shapes.

- [ ] **Step 1: Write the failing type/shape test**

```ts
import { expectTypeOf, it } from "vitest";
import type { LandRecordDetail } from "./api";

it("keeps ownership and mutation history read-only in one record aggregate", () => {
  expectTypeOf<LandRecordDetail["ownership"]>().toBeArray();
  expectTypeOf<LandRecordDetail["mutations"]>().toBeArray();
  expectTypeOf<LandRecordDetail["audit"]>().toBeArray();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @plotguard/rules test -- src/types/records.test.ts`
Expected: FAIL because `LandRecordDetail` is not exported.

- [ ] **Step 3: Add the minimal aggregate interfaces and barrel export**

```ts
export interface LandRecordDetail {
  parcel: Parcel;
  owner: LandRecordOwner;
  jurisdiction: LandRecordJurisdiction[];
  ownership: LandRecordOwnershipEvent[];
  mutations: Mutation[];
  disputes: Dispute[];
  documents: LandDocument[];
  restrictions: ParcelRestriction[];
  audit: AuditEvent[];
}
```

- [ ] **Step 4: Run the focused rules test**

Run: `pnpm --filter @plotguard/rules test -- src/types/records.test.ts`
Expected: PASS.

### Task 2: Database-backed Land Office Records API

**Files:**
- Modify: `apps/api/src/parcels/parcels.controller.ts`
- Test: `apps/api/src/parcels/parcels.controller.test.ts`

**Interfaces:**
- Consumes: `loadMutationActor`, `coveredJurisdictionIds`, `findParcelView`, Prisma relations, and existing audit rows.
- Produces: jurisdiction-scoped `GET /parcels` behavior for Land Office callers and `GET /parcels/:id/record: LandRecordDetail`.

- [ ] **Step 1: Write failing controller tests**

```ts
it("composes officer jurisdiction, search, and status filters", async () => {
  await controller.list({ q: "512", status: "verified" }, landOfficeRequest);
  expect(prisma.parcel.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ jurisdictionId: { in: expect.any(Array) }, registryStatus: "verified" }),
  }));
});

it("returns related ownership, mutations, disputes, documents and audit", async () => {
  const detail = await controller.record("p-1", landOfficeRequest);
  expect(detail).toEqual(expect.objectContaining({ ownership: expect.any(Array), mutations: expect.any(Array), audit: expect.any(Array) }));
});
```

- [ ] **Step 2: Run tests to verify the missing behavior fails**

Run: `pnpm --filter @plotguard/api test -- src/parcels/parcels.controller.test.ts`
Expected: FAIL because Land Office scoping and `record()` do not exist.

- [ ] **Step 3: Implement list scoping and the record aggregate**

```ts
@Get(":id/record")
async record(@Param("id") id: string, @Req() req: Request) {
  const actor = await loadMutationActor(this.prisma, req);
  // Load the parcel, verify its jurisdiction is covered, then read all existing
  // relations in parallel and return a plain JSON aggregate.
}
```

- [ ] **Step 4: Run the focused API tests**

Run: `pnpm --filter @plotguard/api test -- src/parcels/parcels.controller.test.ts`
Expected: PASS with out-of-jurisdiction access rejected and Citizen `/parcels/:id` untouched.

### Task 3: Preview API parity and query hook

**Files:**
- Create: `lib/mocks/records-contract.mjs`
- Test: `lib/mocks/records-contract.test.mjs`
- Modify: `lib/mocks/handlers.ts`
- Modify: `hooks/queries.ts`

**Interfaces:**
- Consumes: mock parcel/jurisdiction/user/ownership/mutation/dispute/document/audit arrays.
- Produces: MSW parity for list scoping and `/parcels/:id/record`, plus `useLandRecord(id)`.

- [ ] **Step 1: Write failing preview contract tests**

```js
test("office record reads stay inside the jurisdiction subtree", () => {
  assert.deepEqual(filterLandOfficeRecords({ parcels, coveredIds: new Set(["j-local"] }).map((p) => p.id), ["p-local"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/mocks/records-contract.test.mjs`
Expected: FAIL because `records-contract.mjs` is absent.

- [ ] **Step 3: Implement the preview contract, route, and hook**

```ts
export function useLandRecord(id: string | undefined) {
  return useQuery({
    queryKey: ["land-record", id],
    queryFn: () => api.get<LandRecordDetail>(`/parcels/${id}/record`),
    enabled: Boolean(id),
  });
}
```

- [ ] **Step 4: Run preview and type checks**

Run: `node --test lib/mocks/records-contract.test.mjs`
Expected: PASS.

### Task 4: Existing Records list behavior and record detail page

**Files:**
- Create: `components/records/record-detail-utils.mjs`
- Test: `components/records/record-detail-contract.test.mjs`
- Create: `app/(app)/records/[id]/page.tsx`
- Modify: `app/(app)/records/page.tsx`
- Modify: `lib/i18n/dictionaries/en.ts`
- Modify: `lib/i18n/dictionaries/bn.ts`

**Interfaces:**
- Consumes: `useParcels`, `useLandRecord`, `LandRecordDetail`, current formatting/status helpers, `ParcelMap`, and established Mutation/Dispute/Document routes.
- Produces: clickable/keyboard-accessible record rows, error/retry states, and an office-only detail page rendering every required relationship.

- [ ] **Step 1: Write failing UI contract and presentation tests**

```js
test("records open the office detail route and expose every required section", () => {
  assert.match(listSource, /records\/\$\{p\.id\}/);
  for (const label of ["Current owner", "Ownership history", "Mutation history", "Disputes", "Documents", "Audit history"]) {
    assert.match(detailSource, new RegExp(label, "i"));
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test components/records/record-detail-contract.test.mjs`
Expected: FAIL because the detail page and helpers are absent and the list links to `/parcels/:id`.

- [ ] **Step 3: Implement the detail page without redesigning the list**

```tsx
const { data, isLoading, isError, refetch } = useLandRecord(id);
// Render existing Card/Table/Badge/Map components and link workflow actions
// to existing routes. Do not add an owner edit control.
```

- [ ] **Step 4: Run focused UI tests and lint**

Run: `node --test components/records/record-detail-contract.test.mjs`
Expected: PASS.

Run: `pnpm lint`
Expected: PASS.

### Task 5: Full verification and integration

**Files:**
- Modify only files required by failures found during verification.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a verified branch ready for commit, push, PR, and merge.

- [ ] **Step 1: Run all tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 2: Run the production build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Review the diff against the user requirements**

Run: `git diff --check` and `git status --short`
Expected: no whitespace errors; only Records-related files and this plan changed.

- [ ] **Step 4: Commit, push, open PR to `main`, and merge after checks**

```bash
git add <verified Records files>
git commit -m "feat: connect land office records"
git push -u origin land_office
gh pr create --base main --head land_office --title "feat: connect land office records" --body-file <prepared-body>
gh pr merge --merge --delete-branch=false
```
