# Land Office Mutations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Land Office Mutations page into a persisted, jurisdiction-scoped workflow for verification, objection gating, approval, rejection, parcel ownership transfer, and immutable history.

**Architecture:** Extend the existing `Mutation` domain and Prisma entity rather than creating a parallel model. Put pure transition rules in `@plotguard/rules`, enforce them in both NestJS and MSW, and compose focused dialogs into the existing `/mutations` page without changing its visual design or adding a detail route.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, TanStack Query, Tailwind CSS, existing shadcn/Base UI components, Sonner, NestJS 11, Prisma 7/PostgreSQL, MSW 2, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-land-office-mutations-design.md`

## Global Constraints

- Preserve the current Mutations page structure, cards, controls, colors, spacing, typography, status badges, and responsive behavior.
- Do not create a second mutation page or route; mutation details open in an existing-style dialog on `/mutations`.
- Do not modify `app/(app)/ocr-queue/page.tsx` or implement OCR, Records, Field Agents, dispute resolution, or unrelated modules.
- Keep Citizen mutation filing and parcel views compatible.
- Persist production writes with Prisma/PostgreSQL and mirror the same behavior in session-persistent MSW data.
- Only active Land Office Staff within the parcel jurisdiction may execute officer workflow actions.
- Rejection is allowed from Submitted, In verification, and Objection period and always requires a reason.
- Approved and Rejected are terminal; approval must not bypass verification, the objection period, unresolved objections, recipient validity, or current-owner consistency.
- Write tests before implementation and use `apply_patch` for repository edits.

## File Structure

### Shared domain

- Modify `packages/rules/src/types/mutation.ts` — additive workflow types and fields.
- Modify `packages/rules/src/types/api.ts` — expanded mutation-detail aggregate.
- Modify `packages/rules/src/mutations.ts` — transition, checklist, objection, assignment, and approval rules.
- Modify `packages/rules/src/mutations.test.ts` — executable workflow specification.

### Production API

- Modify `apps/api/prisma/schema.prisma` — workflow timestamps, officer relations, notes, checklist, and ownership-event mutation link.
- Create `apps/api/prisma/migrations/20260912000000_mutation_workflow/migration.sql` — additive migration and legacy objection normalization.
- Modify `apps/api/prisma/seed.ts` — representative workflow records and timeline facts.
- Create `apps/api/src/mutations/complete-verification.dto.ts` — validated checklist and notes.
- Modify `apps/api/src/mutations/mutation-decision.dto.ts` — discriminated decision validation.
- Create `apps/api/src/mutations/mutation-access.ts` — role, active-user, jurisdiction, and assignment checks.
- Create `apps/api/src/mutations/mutation-access.test.ts` — access and scope tests.
- Modify `apps/api/src/mutations/mutations.controller.ts` — scoped reads and transactional workflow endpoints.
- Create `apps/api/src/mutations/mutations.controller.test.ts` — controller contract tests with mocked Prisma/audit dependencies.

### Preview API

- Modify `lib/mocks/data.ts` — mutation workflow fields and actual seeded audit events.
- Modify `lib/mocks/handlers.ts` — production-parity list/detail/transition handlers.
- Create `lib/mocks/mutation-store.ts` — hydrate and persist mutation-related preview state across browser refreshes.
- Modify `lib/mocks/audit-chain.ts` — persist appended mock audit events for the browser session.

### Frontend

- Modify `hooks/queries.ts` — workflow mutations and correct invalidation.
- Create `components/mutations/mutation-action-state.ts` — presentation derivation from shared gates.
- Create `components/mutations/mutation-detail-dialog.tsx` — existing-style detail workspace.
- Create `components/mutations/mutation-verification-form.tsx` — seven checks and notes.
- Create `components/mutations/mutation-decision-dialog.tsx` — approval/rejection confirmations.
- Modify `app/(app)/mutations/page.tsx` — URL-backed filters, card selection, state-specific actions, errors, and composed dialogs.
- Modify `lib/i18n/dictionaries/en.ts` and `lib/i18n/dictionaries/bn.ts` — all new user-facing copy.
- Create `components/mutations/mutation-ui-contract.test.mjs` — source-level UI contract using the repository’s existing Node test convention.

---

### Task 1: Define and test the mutation state machine

**Files:**
- Modify: `packages/rules/src/types/mutation.ts`
- Modify: `packages/rules/src/mutations.ts`
- Modify: `packages/rules/src/mutations.test.ts`

**Interfaces:**
- Produces `MutationVerificationChecklist`, `MutationObjectionStatus`, and additive `Mutation` fields.
- Produces `mutationActionGate(mutation, actorId, now)` and `verificationGate(checklist, notes)` for API, MSW, and UI consumers.
- Retains `approvalGate()` as a compatibility wrapper or updates all callers in the same task.

- [ ] **Step 1: Add failing shared-rule tests for every legal and illegal transition**

Add tests shaped like:

```ts
expect(mutationActionGate(mutation({ status: "submitted" }), "usr-officer", NOW)).toMatchObject({
  canStartVerification: true,
  canCompleteVerification: false,
  canApprove: false,
  canReject: true,
});

expect(mutationActionGate(mutation({ status: "approved" }), "usr-officer", NOW)).toMatchObject({
  canStartVerification: false,
  canCompleteVerification: false,
  canApprove: false,
  canReject: false,
  hold: { code: "already-decided" },
});
```

Cover rejection from all three active statuses; cross-assignment blocking; open and closed windows; resolved versus unresolved objections; absent recipient; and approved/rejected terminal states.

- [ ] **Step 2: Add failing verification validation tests**

```ts
expect(verificationGate(completeChecklist(), "Matched against deed")).toEqual({ ok: true });
expect(verificationGate({ ...completeChecklist(), deedVerified: false }, "Checked")).toEqual({
  ok: false,
  reason: { code: "verification-incomplete", missing: ["deedVerified"] },
});
expect(verificationGate(completeChecklist(), "   ")).toEqual({
  ok: false,
  reason: { code: "verification-notes-required" },
});
```

- [ ] **Step 3: Run the focused suite and confirm the new tests fail**

Run: `pnpm --filter @plotguard/rules test -- src/mutations.test.ts`

Expected: FAIL because the new types/functions and resolution-aware gates do not exist.

- [ ] **Step 4: Add the additive domain fields and pure rule interfaces**

Use these exact shapes:

```ts
export interface MutationVerificationChecklist {
  applicantVerified: boolean;
  previousOwnerVerified: boolean;
  proposedOwnerVerified: boolean;
  dagKhatianVerified: boolean;
  deedVerified: boolean;
  landRecordMatched: boolean;
  documentsPresent: boolean;
}

export type MutationObjectionStatus = "open" | "resolved";

export type MutationWorkflowHold =
  | { code: "wrong-status"; expected: MutationStatus[] }
  | { code: "already-decided" }
  | { code: "assigned-to-other-officer" }
  | { code: "objection-window"; days: number }
  | { code: "objections"; count: number }
  | { code: "no-recipient" };
```

Extend `MutationObjection` with optional resolution fields and extend `Mutation` with the spec’s lifecycle fields. Treat objections lacking `status` as open.

- [ ] **Step 5: Implement the minimal pure gates**

```ts
export function unresolvedObjections(mutation: Mutation): MutationObjection[] {
  return mutation.objections.filter((item) => item.status !== "resolved");
}

export function verificationGate(
  checklist: MutationVerificationChecklist,
  notes: string,
): { ok: true } | { ok: false; reason: MutationVerificationFailure } {
  const missing = VERIFICATION_KEYS.filter((key) => !checklist[key]);
  if (missing.length) return { ok: false, reason: { code: "verification-incomplete", missing } };
  if (!notes.trim()) return { ok: false, reason: { code: "verification-notes-required" } };
  return { ok: true };
}
```

`mutationActionGate` must require status `objection-period` for approval, return the assignment hold when assigned to another actor, calculate remaining days with the existing day rounding, and allow rejection only for active statuses.

- [ ] **Step 6: Run shared rules tests**

Run: `pnpm --filter @plotguard/rules test -- src/mutations.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the shared state machine**

```bash
git add packages/rules/src/types/mutation.ts packages/rules/src/mutations.ts packages/rules/src/mutations.test.ts
git commit -m "feat: define mutation workflow rules"
```

### Task 2: Add durable mutation workflow fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260912000000_mutation_workflow/migration.sql`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `packages/rules/src/types/api.ts`

**Interfaces:**
- Consumes shared mutation workflow types from Task 1.
- Produces Prisma fields used by all workflow endpoints.
- Produces an expanded `MutationDetail` containing `assignedOfficer`, `applicant`, and `timeline`.

- [ ] **Step 1: Extend the Prisma schema with named officer relations**

Add nullable fields to `Mutation`:

```prisma
fromOwnerId              String?
fromOwner                User?     @relation("MutationFromOwner", fields: [fromOwnerId], references: [id])
verificationStartedAt   DateTime?
verificationStartedById String?
verificationStartedBy   User?     @relation("MutationVerificationStarter", fields: [verificationStartedById], references: [id])
verifiedAt               DateTime?
verifiedById             String?
verifiedBy               User?     @relation("MutationVerifier", fields: [verifiedById], references: [id])
verificationNotes        String?
verificationChecklist    Json?
objectionStartDate       DateTime?
approvedAt               DateTime?
approvedById             String?
approvedBy               User?     @relation("MutationApprover", fields: [approvedById], references: [id])
approvalNote             String?
rejectedAt               DateTime?
rejectedById             String?
rejectedBy               User?     @relation("MutationRejector", fields: [rejectedById], references: [id])
rejectionReason          String?
createdAt                DateTime  @default(now())
updatedAt                DateTime  @updatedAt
```

Add the inverse relation arrays on `User`. Add optional `mutationId` and relation on `OwnershipRecord`, plus the inverse `ownershipRecords` relation on `Mutation`.

- [ ] **Step 2: Write the explicit SQL migration**

The migration must add nullable columns first, backfill `createdAt`/`updatedAt` from `requestedAt`, and backfill `fromOwnerId` from the current parcel only for active legacy mutations. Make the lifecycle timestamps non-null with defaults and add foreign keys/indexes for all owner, officer, and ownership-mutation relations. Do not rewrite existing status or owner data.

- [ ] **Step 3: Expand `MutationDetail`**

```ts
export interface MutationActorSummary {
  id: ID;
  name: string;
  title?: string;
}

export interface MutationTimelineEvent {
  id: ID;
  action: string;
  at: ISODateString;
  actorName: string;
  actorRole?: string;
  previousStatus?: MutationStatus;
  newStatus?: MutationStatus;
  note?: string;
}

export interface MutationDetail {
  mutation: Mutation;
  parcel: Parcel | null;
  documents: LandDocument[];
  applicant: MutationActorSummary | null;
  assignedOfficer: MutationActorSummary | null;
  timeline: MutationTimelineEvent[];
}
```

- [ ] **Step 4: Update seed rows with coherent lifecycle facts**

Ensure seeds include:

- an unassigned Submitted mutation
- a current-officer In verification mutation
- a current-officer closed Objection period mutation with no open objections
- a closed Objection period mutation with an open objection
- Approved and Rejected terminal mutations

Add matching audit events for the seeded timeline instead of synthesizing UI-only history.

- [ ] **Step 5: Validate schema and generate the client**

Run: `pnpm --filter @plotguard/api exec prisma validate`

Expected: `The schema at prisma/schema.prisma is valid`.

Run: `pnpm --filter @plotguard/api exec prisma generate`

Expected: Prisma Client generated successfully.

- [ ] **Step 6: Build shared types and type-check the API**

Run: `pnpm --filter @plotguard/rules build`

Run: `pnpm --filter @plotguard/api typecheck`

Expected: both exit 0.

- [ ] **Step 7: Commit the persistence contract**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260912000000_mutation_workflow/migration.sql apps/api/prisma/seed.ts packages/rules/src/types/api.ts
git commit -m "feat: persist mutation workflow state"
```

### Task 3: Enforce mutation access and jurisdiction scope

**Files:**
- Create: `apps/api/src/mutations/mutation-access.ts`
- Create: `apps/api/src/mutations/mutation-access.test.ts`
- Modify: `apps/api/src/mutations/mutations.controller.ts`

**Interfaces:**
- Produces `loadMutationActor(prisma, req)` returning the authenticated database user.
- Produces `coveredJurisdictionIds(actor, jurisdictions)` and `assertMutationActionAccess(actor, mutation)`.
- Consumes `descendantIds()` from `@plotguard/rules`.

- [ ] **Step 1: Write failing access tests**

Cover active Land Office acceptance, citizen/suspended rejection, descendant coverage, sibling-jurisdiction exclusion, same-officer assignment, unassigned access, and different-officer action rejection.

```ts
expect(() => assertLandOfficeActor(citizen)).toThrow(ForbiddenException);
expect(coveredJurisdictionIds(officer, jurisdictions)).toEqual(
  new Set(["j-debidwar", "j-rajamehar"]),
);
expect(() => assertMutationActionAccess(officer, { assignedOfficerId: "usr-other" }))
  .toThrow(ForbiddenException);
```

- [ ] **Step 2: Run the focused API suite and confirm failure**

Run: `pnpm --filter @plotguard/api test -- src/mutations/mutation-access.test.ts`

Expected: FAIL because the access module does not exist.

- [ ] **Step 3: Implement access helpers using the authenticated user record**

```ts
export async function loadMutationActor(prisma: PrismaService, req: Request) {
  const actor = await prisma.user.findUnique({ where: { id: currentUserId(req) } });
  if (!actor || actor.role !== "land-office" || actor.status !== "active") {
    throw new ForbiddenException("Land Office Staff access required.");
  }
  return actor;
}
```

`coveredJurisdictionIds` must include the officer’s own jurisdiction and all descendants. `assertMutationActionAccess` allows unassigned or self-assigned mutations and rejects another officer’s assignment.

- [ ] **Step 4: Apply jurisdiction scope to list and detail reads**

For Land Office list requests, query mutations through the parcel relation:

```ts
where: {
  parcel: { jurisdictionId: { in: [...coveredIds] } },
  ...(query.scope === "assigned" ? { assignedOfficerId: actor.id } : {}),
  ...(query.status ? { status: query.status } : {}),
}
```

Retain `scope=mine` for citizens and do not expose officer workflow actions to them.

- [ ] **Step 5: Run access tests**

Run: `pnpm --filter @plotguard/api test -- src/mutations/mutation-access.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit access enforcement**

```bash
git add apps/api/src/mutations/mutation-access.ts apps/api/src/mutations/mutation-access.test.ts apps/api/src/mutations/mutations.controller.ts
git commit -m "feat: scope mutations to land office jurisdiction"
```

### Task 4: Implement and test persisted workflow endpoints

**Files:**
- Create: `apps/api/src/mutations/complete-verification.dto.ts`
- Modify: `apps/api/src/mutations/mutation-decision.dto.ts`
- Modify: `apps/api/src/mutations/mutations.controller.ts`
- Create: `apps/api/src/mutations/mutations.controller.test.ts`

**Interfaces:**
- Produces `PATCH /mutations/:id/start-verification`.
- Produces `PATCH /mutations/:id/complete-verification`.
- Enhances `PATCH /mutations/:id/decision`.
- Consumes Task 1 gates, Task 2 persistence fields, and Task 3 access helpers.

- [ ] **Step 1: Write failing DTO and controller contract tests**

Test exact effects for start verification, complete verification, approval, and rejection. Include tests that assert no Prisma update/audit call occurs on forbidden or invalid transitions.

```ts
await controller.startVerification("m-1", officerRequest);
expect(tx.mutation.update).toHaveBeenCalledWith(expect.objectContaining({
  where: { id: "m-1" },
  data: expect.objectContaining({
    status: "verification",
    assignedOfficerId: "usr-officer",
    verificationStartedById: "usr-officer",
  }),
}));
expect(audit.append).toHaveBeenCalledWith(tx, expect.objectContaining({
  action: "status-change",
  payload: expect.objectContaining({ previousStatus: "submitted", newStatus: "verification" }),
}));
```

Approval tests must assert parcel ownership update, old ownership row closure, new ownership row creation with `mutationId`, and audit append all occur within one transaction. Add explicit second-approval and `parcel.ownerId !== mutation.fromOwnerId` conflict tests.

- [ ] **Step 2: Run controller tests and confirm failure**

Run: `pnpm --filter @plotguard/api test -- src/mutations/mutations.controller.test.ts`

Expected: FAIL because the DTOs/endpoints/fields are incomplete.

- [ ] **Step 3: Implement validated DTOs**

Use nested validation-compatible explicit fields rather than accepting arbitrary status values:

```ts
export class CompleteVerificationDto {
  @IsBoolean() applicantVerified!: boolean;
  @IsBoolean() previousOwnerVerified!: boolean;
  @IsBoolean() proposedOwnerVerified!: boolean;
  @IsBoolean() dagKhatianVerified!: boolean;
  @IsBoolean() deedVerified!: boolean;
  @IsBoolean() landRecordMatched!: boolean;
  @IsBoolean() documentsPresent!: boolean;
  @IsString() @MinLength(1) notes!: string;
}
```

For decisions, use conditional validation so `rejectionReason` is required only when `decision === "reject"`, and `approvalNote` is optional only for approval.

- [ ] **Step 4: Implement Start verification transactionally**

Re-read the mutation in the transaction, apply access and gate checks, then conditionally update only a Submitted row. Store actor/timestamp and append a status-change audit payload.

- [ ] **Step 5: Implement Complete verification transactionally**

Validate all checks/notes with `verificationGate`. Load `Policy.id = "singleton"`; set `objectionStartDate = now` and `objectionWindowEndsAt = addDays(now, policy.objectionWindowDays)`. Persist verifier fields and append an audit event with previous/new status and notes.

- [ ] **Step 6: Harden approval and rejection**

Approval must use the server clock, resolution-aware gate, valid proposed owner, matching `parcel.ownerId === mutation.fromOwnerId`, and current status `objection-period`. Rejection must accept only active states and a trimmed non-empty reason. Save the dedicated actor/time/note fields and compatibility `decidedAt`. New citizen filings must capture `fromOwnerId` from the parcel rather than from request input.

- [ ] **Step 7: Expand mutation detail from actual relations and audit events**

Fetch applicant, assigned officer, parcel, documents, and mutation audit events. Map audit entries in ascending time order:

```ts
timeline: events.map((event) => ({
  id: event.id,
  action: event.action,
  at: event.createdAt.toISOString(),
  actorName: event.actorName ?? "System",
  actorRole: typeof event.payload.actorRole === "string" ? event.payload.actorRole : undefined,
  previousStatus: asMutationStatus(event.payload.previousStatus),
  newStatus: asMutationStatus(event.payload.newStatus),
  note: asOptionalString(event.payload.note ?? event.payload.reason),
}))
```

- [ ] **Step 8: Run endpoint tests and complete API verification**

Run: `pnpm --filter @plotguard/api test -- src/mutations/mutations.controller.test.ts`

Run: `pnpm --filter @plotguard/api test`

Run: `pnpm --filter @plotguard/api typecheck`

Expected: all pass.

- [ ] **Step 9: Commit workflow endpoints**

```bash
git add apps/api/src/mutations/complete-verification.dto.ts apps/api/src/mutations/mutation-decision.dto.ts apps/api/src/mutations/mutations.controller.ts apps/api/src/mutations/mutations.controller.test.ts
git commit -m "feat: implement mutation verification and decisions"
```

### Task 5: Mirror the workflow in MSW

**Files:**
- Modify: `lib/mocks/data.ts`
- Modify: `lib/mocks/handlers.ts`
- Create: `lib/mocks/mutation-store.ts`
- Modify: `lib/mocks/audit-chain.ts`

**Interfaces:**
- Mirrors Task 4 endpoint paths, payloads, responses, error envelopes, audit entries, and ownership effects.
- Consumes shared rules from Task 1 and expanded detail types from Task 2.
- Persists preview workflow changes across browser refreshes under session-storage key `plotguard.mutation-workflow.v1`.

- [ ] **Step 1: Enrich mock mutation and audit seed data**

Add the same coherent examples created in the production seed. Set `status: "open"` on legacy active objections and include real timestamps/checklists for verification and objection-period rows.

- [ ] **Step 2: Add the focused preview persistence adapter**

`hydrateMutationState()` runs once before mutation handlers read data. `persistMutationState()` writes only mutation rows, affected parcel owner/last-mutation fields, and ownership records to `sessionStorage`; it does not persist unrelated application data. In non-browser test environments both functions safely no-op.

Update `getAuditChain()` to load a stored chain from `plotguard.mutation-audit.v1` when present, and update `appendAudit()` to save the appended chain after hashing it.

- [ ] **Step 3: Add reusable mock authorization/scope helpers**

Use `currentUser(request)`, `descendantIds`, and parcel jurisdiction IDs. Return the existing `forbidden`, `notFound`, `conflict`, or `unprocessable` envelopes; add a small `forbidden()` helper if one is absent.

- [ ] **Step 4: Implement MSW start and complete verification handlers**

Each handler must hydrate before reading, mutate `db.mutations` only after all validations pass, append an audit event, persist after success, and return the updated mutation. Complete verification reads `db.policies.objectionWindowDays` and derives both objection dates.

- [ ] **Step 5: Replace the loose decision handler with the full gate**

Require a rejection reason, enforce current status and assignment, reject second decisions, update the parcel and ownership chain only on approval, attach `mutationId` to the new ownership row, and append the same audit payload shape as NestJS.

- [ ] **Step 6: Expand list and detail handlers**

Apply jurisdiction plus assigned/status filtering together. The detail response must include applicant, assigned officer, documents, parcel, and an ascending timeline built from `getAuditChain()`.

- [ ] **Step 7: Build the shared package and type-check the web app**

Run: `pnpm --filter @plotguard/rules build`

Run: `pnpm exec tsc --noEmit`

Expected: both exit 0.

- [ ] **Step 8: Commit MSW parity**

```bash
git add lib/mocks/data.ts lib/mocks/handlers.ts lib/mocks/mutation-store.ts lib/mocks/audit-chain.ts
git commit -m "feat: mirror mutation workflow in preview API"
```

### Task 6: Add frontend workflow hooks and action presentation

**Files:**
- Modify: `hooks/queries.ts`
- Create: `components/mutations/mutation-action-state.ts`
- Create: `components/mutations/mutation-ui-contract.test.mjs`

**Interfaces:**
- Produces `useStartMutationVerification(id)`, `useCompleteMutationVerification(id)`, and enhanced `useMutationDecision(id)`.
- Produces `mutationActionState(mutation, actorId, now)` for consistent labels, disabled reasons, and visible controls.

- [ ] **Step 1: Write a failing client-module contract test**

Follow the existing `.mjs` test style and assert that `hooks/queries.ts` exports all three workflow hooks and `mutation-action-state.ts` delegates to the shared workflow gate instead of hard-coding status transitions.

Run: `node --test components/mutations/mutation-ui-contract.test.mjs`

Expected: FAIL before the new hooks and action-state module exist.

- [ ] **Step 2: Implement query hooks with shared invalidation**

```ts
function invalidateMutationWorkflow(qc: QueryClient, id: string, includeParcel = false) {
  qc.invalidateQueries({ queryKey: ["mutation", id] });
  qc.invalidateQueries({ queryKey: ["mutations"] });
  qc.invalidateQueries({ queryKey: ["audit", "mutation", id] });
  if (includeParcel) qc.invalidateQueries({ queryKey: ["parcel"] });
}
```

POST/PATCH only through the existing `api` client. Approval invalidates parcel queries; every successful action invalidates list/detail/audit.

- [ ] **Step 3: Implement `mutationActionState` as a pure presentation adapter**

Return an object with:

```ts
interface MutationActionState {
  primary: "start-verification" | "complete-verification" | "approve" | null;
  canReject: boolean;
  terminal: "approved" | "rejected" | null;
  holdCode?: string;
}
```

Derive it from `mutationActionGate`; do not reproduce workflow decisions in JSX.

- [ ] **Step 4: Run the UI contract and TypeScript checks**

Run: `node --test components/mutations/mutation-ui-contract.test.mjs`

Run: `pnpm exec tsc --noEmit`

Expected: both pass.

- [ ] **Step 5: Commit hooks and presentation logic**

```bash
git add hooks/queries.ts components/mutations/mutation-action-state.ts components/mutations/mutation-ui-contract.test.mjs
git commit -m "feat: add mutation workflow client actions"
```

### Task 7: Build the detail and confirmation dialogs

**Files:**
- Create: `components/mutations/mutation-verification-form.tsx`
- Create: `components/mutations/mutation-decision-dialog.tsx`
- Create: `components/mutations/mutation-detail-dialog.tsx`
- Modify: `lib/i18n/dictionaries/en.ts`
- Modify: `lib/i18n/dictionaries/bn.ts`

**Interfaces:**
- `MutationDetailDialog({ mutationId, open, onOpenChange })` owns detail loading and composes actions.
- `MutationVerificationForm({ mutation, onSuccess })` submits the seven checks and notes.
- `MutationDecisionDialog({ mutation, decision, open, onOpenChange })` confirms approval or rejection.

- [ ] **Step 1: Add all English and Bangla dictionary keys before JSX**

Add labels and messages for mutation information, ownership change, land information, documents, verification, objection, timeline, all checklist items, notes/reason fields, assignment holds, workflow actions, loading, retry, success, and failure states. Do not place hard-coded English prose in new components.

- [ ] **Step 2: Implement verification form with controlled local state**

Initialize all seven checks to false and notes to empty whenever a new mutation opens. Disable completion unless every check is true, notes trim non-empty, and the request is not pending. On error, keep the entered values and show a Sonner error.

- [ ] **Step 3: Implement approval and rejection confirmation dialogs**

Approval displays ID, owners, Dag, current status, confirmation question, and optional note. Rejection displays ID, required reason, and rejects whitespace-only input. Disable both dialog buttons while submitting and show action-specific loading text.

- [ ] **Step 4: Implement the scrollable detail dialog**

Reuse `Dialog`, `Card`, `StatusMetaBadge`, `IdChip`, existing formatters, and table/list primitives. Render all seven specified sections. Timeline keys and dates come from `MutationDetail.timeline`; documents use an actual preview URL when present and otherwise render an unavailable label rather than a clickable dead button.

- [ ] **Step 5: Add independent detail states**

Render a skeleton while loading, `Mutation not found.` for a 404, and a retry action for other errors. Closing/reopening the dialog must not clear the parent list or filters.

- [ ] **Step 6: Type-check and lint the new components**

Run: `pnpm exec tsc --noEmit`

Run: `pnpm exec eslint components/mutations lib/i18n/dictionaries/en.ts lib/i18n/dictionaries/bn.ts`

Expected: both exit 0.

- [ ] **Step 7: Commit the detail workspace**

```bash
git add components/mutations/mutation-verification-form.tsx components/mutations/mutation-decision-dialog.tsx components/mutations/mutation-detail-dialog.tsx lib/i18n/dictionaries/en.ts lib/i18n/dictionaries/bn.ts
git commit -m "feat: add mutation review workspace"
```

### Task 8: Integrate the workflow into the existing Mutations page

**Files:**
- Modify: `app/(app)/mutations/page.tsx`
- Modify: `components/mutations/mutation-ui-contract.test.mjs`

**Interfaces:**
- Consumes Tasks 5–7 without adding a route or changing the page’s visual system.
- Preserves Citizen `MyMutationCard` behavior and filing link.

- [ ] **Step 1: Run the UI contract to establish the failing integration assertions**

First extend `mutation-ui-contract.test.mjs` to assert that the page imports the three workflow hooks, preserves the two scope values and all six status filters, opens `MutationDetailDialog`, and links parcels using `/parcels/${mutation.parcelId}`.

Run: `node --test components/mutations/mutation-ui-contract.test.mjs`

Expected: FAIL on page integration assertions.

- [ ] **Step 2: Move scope/status state to URL search parameters**

Use `useSearchParams`, `usePathname`, and `useRouter.replace` with validation:

```ts
const scope = searchParams.get("scope") === "assigned" ? "assigned" : "all";
const rawStatus = searchParams.get("status");
const status = isMutationStatus(rawStatus) ? rawStatus : "all";
```

Update one parameter while preserving the other. Do not reload the page.

- [ ] **Step 3: Add list errors and retry without changing existing loading/empty visuals**

Use TanStack Query’s `isError` and `refetch`. Distinguish the empty jurisdiction queue from filtered-empty output with the exact required messages.

- [ ] **Step 4: Make officer cards accessible detail triggers**

Support click, Enter, and Space. Nested Start/Complete/Approve/Reject/View parcel controls stop propagation. Store only `selectedMutationId` in page state so refreshed detail data stays authoritative.

- [ ] **Step 5: Replace generic decision buttons with state-specific actions**

Use `mutationActionState`. Submitted starts verification; verification opens the checklist; eligible objection-period records open approval; all active stages may open rejection; terminal records expose no workflow command. Render hold explanations where actions are blocked.

- [ ] **Step 6: Compose the detail and confirmation dialogs**

Render one detail dialog and one decision dialog at page level, keyed by the selected mutation. On successful actions, keep the dialog open with refreshed server data unless the user closes it.

- [ ] **Step 7: Preserve parcel navigation state**

Because filters live in `/mutations?scope=...&status=...`, the existing `/parcels/:id` link and browser back restore the queue state without modifying the parcel page.

- [ ] **Step 8: Run UI contract, type-check, and focused lint**

Run: `node --test components/mutations/mutation-ui-contract.test.mjs`

Run: `pnpm exec tsc --noEmit`

Run: `pnpm exec eslint 'app/(app)/mutations/page.tsx' components/mutations hooks/queries.ts`

Expected: all pass.

- [ ] **Step 9: Commit page integration**

```bash
git add app/(app)/mutations/page.tsx components/mutations/mutation-ui-contract.test.mjs
git commit -m "feat: connect land office mutation queue"
```

### Task 9: Run full regression and browser verification

**Files:**
- Modify only files required to fix failures directly caused by Tasks 1–8.

**Interfaces:**
- Verifies the complete feature and all global constraints.

- [ ] **Step 1: Run all shared rules tests**

Run: `pnpm test`

Expected: all rules tests pass.

- [ ] **Step 2: Run the complete API suite and type-check**

Run: `pnpm --filter @plotguard/api test`

Run: `pnpm --filter @plotguard/api typecheck`

Expected: both pass.

- [ ] **Step 3: Run frontend contract, type, and lint checks**

Run: `node --test components/mutations/mutation-ui-contract.test.mjs components/shell/land-office-navigation.test.mjs`

Run: `pnpm exec tsc --noEmit`

Run: `pnpm lint`

Expected: all pass with no new warnings in changed files.

- [ ] **Step 4: Build production applications**

Run: `pnpm build`

Run: `pnpm --filter @plotguard/api build`

Expected: both exit 0 with no broken imports or routes.

- [ ] **Step 5: Verify requested browser scenarios against MSW**

Start: `pnpm dev`

Verify at desktop, tablet, and mobile widths:

1. `/mutations` loads mutation requests without console errors.
2. Submitted and Approved tabs show only matching records.
3. Assigned to me composes with Objection period.
4. A Submitted card opens detail and Start verification persists after reload.
5. An In verification record cannot continue until all checks and notes are present.
6. Complete verification enters Objection period and shows policy-derived dates.
7. Approval is blocked while the period is open or objections remain unresolved.
8. A closed unobstructed mutation opens approval confirmation and becomes Approved.
9. A rejection dialog requires a reason and leaves the record visible under Rejected.
10. View parcel opens the correct parcel, and browser back restores filters.
11. Timeline reflects the actions just performed.
12. A repeated approval request is rejected and does not duplicate ownership history.
13. Citizen role can still view/file mutations but sees no officer commands.

- [ ] **Step 6: Verify durable backend persistence when PostgreSQL is available**

Run the API with its configured database, execute start verification/complete verification/decision requests, restart the API, and confirm `GET /mutations/:id` returns the saved state and timeline. If no database service is available, record this as an environmental limitation rather than claiming it passed.

- [ ] **Step 7: Review the final diff for scope and security**

Run: `git diff --check`

Run: `git status --short`

Confirm `app/(app)/ocr-queue/page.tsx` and unrelated modules are absent from the diff, no owner is updated outside the approval transaction, and no officer endpoint trusts a caller-provided status or actor ID.

- [ ] **Step 8: Commit verification fixes, if any**

Stage only the mutation files shown by `git status --short`, then run `git commit -m "test: verify land office mutation workflow"`. If no fixes were required, do not create an empty commit.
