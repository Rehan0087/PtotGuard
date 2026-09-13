# Records / Mutation Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Land Office Records derive mutation state from the existing Mutation relationship so record status, mutation history, and ownership agree after every workflow transition.

**Architecture:** Add one pure domain projection that overlays `under-mutation` only while a related mutation is active. Apply that projection in the real `/parcels` list and `/parcels/:id/record` aggregate and in their MSW equivalents; keep approved ownership transfer in the existing mutation transaction and refresh all affected TanStack Query keys after every transition.

**Tech Stack:** TypeScript, Vitest, NestJS, Prisma/PostgreSQL, MSW, TanStack Query, Next.js App Router.

**Spec:** User request in this conversation; existing feature design is `docs/superpowers/specs/2026-09-11-records-module-design.md`.

## Global Constraints

- Do not redesign Records or Mutations.
- Reuse `Parcel.mutations`, `Mutation`, and `OwnershipRecord`; add no duplicate persistence model.
- The database and the MSW database fixture remain the source of fetched state.
- An active mutation is `submitted`, `verification`, or `objection-period`; `approved` and `rejected` are terminal.
- Existing mutation approval remains the only ownership-transfer path.

---

### Task 1: Shared effective record-status rule

**Files:**
- Modify: `packages/rules/src/records.ts`
- Test: `packages/rules/src/records.test.ts`

**Interfaces:**
- Consumes: `RegistryStatus` and related `Mutation.status` values.
- Produces: `recordRegistryStatus(baseStatus, mutations): RegistryStatus`.

- [ ] **Step 1: Write failing tests** asserting that all three active statuses produce `under-mutation`, while approved/rejected histories preserve the persisted non-mutation registry status.
- [ ] **Step 2: Run** `pnpm --filter @plotguard/rules test -- src/records.test.ts` and confirm the missing export fails.
- [ ] **Step 3: Implement** a minimal pure projection using the existing mutation status union.
- [ ] **Step 4: Re-run** the focused test and confirm it passes.

### Task 2: Database-backed Records reads

**Files:**
- Modify: `apps/api/src/parcels/parcels.controller.ts`
- Test: `apps/api/src/parcels/parcels.controller.test.ts`
- Modify: `apps/api/prisma/seed.ts`
- Create: `apps/api/prisma/migrations/20260913000000_derive_under_mutation_status/migration.sql`

**Interfaces:**
- Consumes: active rows from the existing `Parcel.mutations` relation.
- Produces: dynamically derived status in the Land Office list and record aggregate, including relationship-based status filtering.

- [ ] **Step 1: Write failing controller tests** for relationship-based `under-mutation` filtering, active-status projection, and terminal-status fallback.
- [ ] **Step 2: Run** `pnpm --filter @plotguard/api test -- src/parcels/parcels.controller.test.ts` and confirm failures point to the stale parcel-only path.
- [ ] **Step 3: Implement** Prisma relation filters and response projection; do not update mutation workflow writes to maintain a second status.
- [ ] **Step 4: Normalize** legacy persisted `under-mutation` seed/data values to a non-workflow base state through a migration and seed update.
- [ ] **Step 5: Re-run** focused API tests.

### Task 3: MSW parity and query refresh

**Files:**
- Modify: `lib/mocks/handlers.ts`
- Modify: `lib/mocks/data.ts`
- Modify: `lib/mocks/records-contract.test.mjs`
- Modify: `hooks/queries.ts`

**Interfaces:**
- Consumes: the same mutable mutation and ownership arrays used by the Mutation handlers.
- Produces: Records responses projected from those arrays after hydration, and invalidation of `parcels` plus `land-record` after each mutation action.

- [ ] **Step 1: Add a failing preview contract case** showing status filters operate on projected parcel data rather than a hardcoded parcel value.
- [ ] **Step 2: Run** `node --test lib/mocks/records-contract.test.mjs` and confirm the regression case fails.
- [ ] **Step 3: Hydrate before list reads, project list/detail status from `db.mutations`, and invalidate both Records query families for every transition.**
- [ ] **Step 4: Re-run** the preview contract tests.

### Task 4: Regression and completion verification

**Files:**
- Modify only files required by verification failures.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: evidence that Records and Mutations stay consistent in both backends.

- [ ] **Step 1: Run** focused rules, API, mock Records, and mutation workflow tests.
- [ ] **Step 2: Run** `pnpm test`, `pnpm --filter @plotguard/api test`, `pnpm exec tsc --noEmit`, `pnpm --filter @plotguard/api typecheck`, `pnpm lint`, and `pnpm build`.
- [ ] **Step 3: Run** `git diff --check` and inspect the final diff against every requirement.
