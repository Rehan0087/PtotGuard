# Land Office Mutations Workflow Design

**Date:** 2026-09-11  
**Status:** Approved for implementation planning  
**Scope:** Make the existing Land Office → Mutations page functional without redesigning it

## 1. Objective

Complete the existing Mutations module by connecting its current Land Office UI to a persisted, permission-checked mutation workflow. Officers will be able to filter their queue, inspect a mutation, start and complete verification, observe objection-period rules, approve or reject eligible applications, open the related parcel, and read an immutable action timeline.

The work preserves the current Mutations page, Citizen Portal, sidebar, routes, component library, and visual language. It does not implement OCR, Records, Field Agents, dispute resolution, or unrelated Land Office modules. The referenced OCR Queue page is not part of this change.

## 2. Existing Architecture

The implementation extends the architecture already present in the repository:

- Next.js App Router, React, TypeScript, Tailwind CSS, and existing shadcn-style controls for the frontend.
- TanStack Query and the central API client for remote state.
- NestJS, Prisma, and PostgreSQL for the production API and persistence layer.
- MSW and structured in-memory demo data for the default preview environment.
- `@plotguard/rules` for shared domain types and business rules.
- The existing append-only, hash-chained audit ledger for mutation history.
- The current `/mutations` page, mutation cards, status badges, dialogs, Sonner notifications, and `/parcels/[id]` parcel view.

The existing `Mutation` entity remains authoritative. A second mutation or generic service-application model will not be introduced.

## 3. Workflow State Machine

The only forward transitions are:

```text
Submitted → In verification → Objection period → Approved
     └──────────────┬──────────────────┬──────→ Rejected
                    └──────────────────┘
```

In stored values, these statuses remain:

- `submitted`
- `verification`
- `objection-period`
- `approved`
- `rejected`

The UI continues to label `verification` as “In verification.”

### 3.1 Rejection policy

Rejection is permitted from all three active states:

- Submitted → Rejected
- In verification → Rejected
- Objection period → Rejected

A non-empty rejection reason is mandatory. Approved and rejected mutations are terminal within this module. No reopen, reverse, or duplicate-decision transition is introduced.

### 3.2 Assignment policy

Starting verification assigns the authenticated Land Office Staff member when the mutation is unassigned. If the mutation is already assigned to the authenticated officer, work may continue. If it is assigned to a different officer, the mutation remains visible within the jurisdiction queue but workflow actions are blocked.

This keeps “All in jurisdiction” useful while preventing two officers from processing the same application concurrently.

## 4. Domain and Database Changes

The existing Prisma `Mutation` model and shared `Mutation` contract gain additive workflow fields.

### 4.1 Verification fields

- `verificationStartedAt`
- `verificationStartedById`
- `verifiedAt`
- `verifiedById`
- `verificationNotes`
- `verificationChecklist`

`verificationChecklist` stores the seven named boolean checks as structured JSON:

- applicant information verified
- previous owner verified
- proposed owner verified
- Dag/Khatian verified
- supporting deed verified
- land record matched
- required documents present

### 4.2 Objection fields

- `objectionStartDate`
- existing `objectionWindowEndsAt`, retained as the end date

Each existing JSON objection gains additive resolution metadata:

- `status`: `open` or `resolved`
- optional `resolvedAt`
- optional `resolvedById`
- optional `resolutionNote`

Legacy objections without a status are treated as open. This module displays objection resolution state and enforces it during approval, but it does not add an objection-resolution action or endpoint.

### 4.3 Decision and lifecycle fields

- `approvedAt`
- `approvedById`
- `approvalNote`
- `rejectedAt`
- `rejectedById`
- `rejectionReason`
- `createdAt`
- `updatedAt`

The existing `decidedAt` remains populated for compatibility. Existing API fields are not removed or renamed.

### 4.4 Relationships

Officer identifier fields reference the existing `User` model. Applicant, previous-owner snapshot, proposed-owner relationship, parcel relationship, and document identifiers continue to use the current model. Owner data is not duplicated beyond existing historical display snapshots.

## 5. Authorization and Jurisdiction

Workflow writes require an authenticated, active `land-office` user. The backend is the authorization boundary; hiding controls in the UI is not considered enforcement.

For Land Office requests:

- “All in jurisdiction” returns mutations whose parcel jurisdiction is the officer’s assigned jurisdiction or a descendant.
- “Assigned to me” applies the same jurisdiction scope and additionally requires `assignedOfficerId` to equal the authenticated user ID.
- Detail access uses the same jurisdiction boundary.
- Start verification, complete verification, approve, and reject require the active Land Office role, jurisdiction coverage, and compatible assignment.

Citizens retain their existing ability to file and view their own mutation applications. They cannot invoke officer workflow endpoints. Other roles cannot perform Land Office mutation decisions.

The current demo-header authentication mechanism is reused; names such as Nasrin Akter are obtained from the authenticated user record and are not hard-coded into workflow logic.

## 6. API Design

### 6.1 List mutations

`GET /mutations`

Existing query parameters remain:

- `scope=mine` for Citizen Portal filings
- `scope=assigned` for mutations assigned to the authenticated officer
- `status=<mutation-status>`
- pagination parameters

Land Office list requests are always jurisdiction-scoped. Scope and status constraints are combined in a single query.

### 6.2 Mutation detail

`GET /mutations/:id`

The existing endpoint becomes the detail aggregate and returns:

- mutation information
- applicant and assigned-officer display information
- related parcel information
- supporting documents
- verification information
- objection details and computed counts
- audit-derived timeline

The timeline is generated from actual audit events ordered chronologically. Static timeline text is not stored in components.

### 6.3 Start verification

`PATCH /mutations/:id/start-verification`

Preconditions:

- actor is active Land Office Staff
- mutation is within the actor’s jurisdiction
- mutation status is `submitted`
- mutation is unassigned or assigned to the actor

Transaction effects:

- assign the actor if currently unassigned
- set status to `verification`
- set `verificationStartedAt` and `verificationStartedById`
- update `updatedAt`
- append an audit event containing previous/new status, actor, role, and timestamp

Repeated or stale requests return a conflict and do not create duplicate events.

### 6.4 Complete verification

`PATCH /mutations/:id/complete-verification`

Request body:

- the seven-item checklist
- required verification notes

Preconditions:

- actor passes the role, jurisdiction, and assignment checks
- current status is `verification`
- all seven checklist values are true
- notes are non-empty
- required documents and recipient references still exist

Transaction effects:

- set status to `objection-period`
- save checklist, `verifiedById`, `verifiedAt`, and notes
- set objection start to the transaction timestamp
- calculate the objection end using the existing policy’s `objectionWindowDays`
- append verification-completed and objection-period-started facts to the audit entry payload

No officer-provided arbitrary status or objection date is accepted.

### 6.5 Decide mutation

`PATCH /mutations/:id/decision`

The existing endpoint remains and accepts one of two command bodies:

- `{ decision: "approve", approvalNote?: string }`
- `{ decision: "reject", rejectionReason: string }`

Approval preconditions:

- current status is `objection-period`
- actor passes role, jurisdiction, and assignment checks
- objection end is at or before the server’s current time
- no objection is unresolved
- proposed owner is linked to a valid citizen account
- the parcel’s current owner still matches the mutation’s recorded source owner

Approval transaction effects:

- change mutation status to `approved`
- save `approvedAt`, `approvedById`, optional note, `decidedAt`, and `updatedAt`
- update the existing parcel’s current owner and `lastMutationAt`
- close the current ownership-history row
- append a new ownership-history row tied to the mutation and supporting document where available
- preserve the mutation record
- append an immutable audit event

Rejection preconditions:

- current status is `submitted`, `verification`, or `objection-period`
- actor passes role, jurisdiction, and assignment checks
- rejection reason is non-empty

Rejection transaction effects:

- change status to `rejected`
- save `rejectedAt`, `rejectedById`, rejection reason, `decidedAt`, and `updatedAt`
- leave parcel ownership unchanged
- preserve the mutation record
- append an immutable audit event

## 7. Shared Business Rules

`@plotguard/rules` will own pure, independently tested rules for:

- allowed state transitions
- assignment compatibility
- mandatory verification checklist and notes
- objection window calculation and closure
- unresolved objection detection
- approval eligibility
- rejection eligibility
- terminal-state protection
- missing-recipient and stale-current-owner holds

The frontend uses these rules to explain disabled actions. NestJS and MSW enforce the same rules independently of the UI.

## 8. Existing-Page Frontend Behavior

The `/mutations` page retains its current header, tabs, cards, badges, actions, typography, colors, spacing, and responsive composition.

### 8.1 Filters

The existing scope tabs become fully functional:

- All in jurisdiction
- Assigned to me

The existing status filters remain:

- All
- Submitted
- In verification
- Objection period
- Approved
- Rejected

Scope and status are sent together in the same list request. Their values are reflected in URL query parameters so navigation to a parcel and browser-back restore the prior queue view. Active controls continue to use the page’s existing secondary/ghost styles.

### 8.2 Mutation cards

Cards become pointer- and keyboard-accessible detail triggers. Nested action buttons prevent the card trigger from firing unintentionally.

Actions are state-dependent:

- Submitted: Start verification, Reject, View parcel
- In verification: Complete verification, Reject, View parcel
- Objection period still open: approval hold message, Reject, View parcel
- Objection period closed with open objections: objection hold message, Reject, View parcel
- Objection period closed without open objections: Approve namjari, Reject, View parcel
- Approved: terminal Approved presentation and View parcel
- Rejected: terminal Rejected presentation and View parcel

Controls unavailable because another officer owns the assignment are disabled with a clear explanation. There are no dead buttons or generic status selectors.

### 8.3 Detail workspace

Because the requirement says not to create another mutation page, selecting a card opens a scrollable existing-style dialog on `/mutations` rather than creating a new route.

The dialog contains:

1. Mutation Information
   - mutation number, type, application date, status, applicant, assigned officer
2. Ownership Change
   - previous owner → proposed owner
3. Land Information
   - Dag, Khatian, Mouza/location, area, land use, jurisdiction
4. Documents
   - filename, type, upload date, verification status, and View action when a usable preview URL exists
5. Verification
   - verification state, starter/verifier, dates, checklist, and notes
6. Objection
   - start/end dates, total/open counts, status, and individual objection resolution state
7. Timeline
   - chronologically ordered, read-only events derived from the audit ledger

Unavailable document previews display an explicit unavailable state instead of an inert button.

### 8.4 Verification dialog/workspace

Starting verification uses a confirmation action with a loading state. Once started, the detail dialog displays the seven mandatory checkboxes and required notes. Complete verification is disabled until the client-side requirements are met; the server validates them again.

### 8.5 Approval dialog

Approve Namjari opens a confirmation dialog showing mutation number, source owner, proposed owner, Dag, current status, confirmation text, and an optional approval note. It never approves on the initial click.

### 8.6 Rejection dialog

Reject opens a confirmation dialog showing the mutation number and a mandatory rejection-reason textarea. The UI may offer the listed example reasons as guidance, but the persisted reason is the officer’s submitted text.

### 8.7 Immediate updates and feedback

Each successful action invalidates or updates the mutation list, mutation detail, mutation audit, and parcel queries as appropriate. Existing Sonner notifications report success. Pending buttons show action-specific loading text and are disabled to prevent repeated submissions.

An API failure leaves the last confirmed server state on screen and shows an action-specific error notification.

### 8.8 Parcel navigation

View parcel opens the existing `/parcels/[id]` view. The Mutations filter state in the URL allows browser-back navigation to restore the selected scope and status. No duplicate parcel viewer is created.

## 9. Loading, Empty, and Error States

The existing skeleton and empty-state components will present:

- `Loading mutation requests...`
- `No mutation requests found.` for an empty jurisdiction queue
- `No mutations match the selected filters.` when active filters produce no results
- `Unable to load mutation requests. Please try again.` with a retry action
- `Mutation not found.` when detail retrieval returns 404

Details and action controls also have independent loading and retry states so the list remains usable if a detail request fails.

## 10. Audit and Timeline

The existing append-only audit ledger remains the authoritative mutation event history. Every transition records:

- mutation ID and number
- actor ID/name and role
- action
- timestamp
- previous status
- new status
- verification, approval, or rejection note where applicable

Relevant event actions include creation/application submission, verification started, verification completed/objection period started, approval, and rejection. Existing or future objection-added/resolved events appear when present.

Audit entries cannot be edited or deleted. The timeline is a read-only projection of the audit events, not a separately editable history.

## 11. Error Semantics and Concurrency

The API uses the existing error envelope:

- `400` for malformed DTOs
- `401` for missing authentication once real authentication replaces the current demo header
- `403` for inactive/non-officer actors, out-of-jurisdiction access, or another officer’s assignment
- `404` for missing mutation, parcel, user, policy, or required document references
- `409` for stale transitions, already-decided mutations, duplicate decisions, or a parcel whose current owner changed after filing
- `422` for incomplete verification, an open objection window, unresolved objections, missing recipient, or missing rejection reason

Transactions re-read or conditionally update workflow state before committing, so two simultaneous actions cannot both approve, reject, or advance the same mutation. The UI only adopts the new state after a successful API response.

## 12. MSW and Production Parity

The MSW layer gains the same workflow endpoints, role/jurisdiction checks, transition rules, detail aggregate, audit events, and ownership updates as NestJS. Its writes persist for the current browser session, matching the project’s established preview behavior. PostgreSQL remains the durable production persistence layer.

Demo data will include examples for every status, an assigned and unassigned mutation, an open objection window, a closed unobstructed window, and a closed window with an unresolved objection.

## 13. Compatibility and Migration

The Prisma migration adds nullable workflow fields and timestamps so existing rows remain valid. Seed and MSW data are enriched with actual historical workflow values and audit events where appropriate. Existing Citizen filing payloads and response fields remain compatible.

No UI changes are made to OCR Queue or other excluded modules. Existing Citizen mutation filing, parcel viewing, navigation, and role switching remain intact.

## 14. Testing and Verification

Implementation will follow test-driven development and cover:

### Shared-rule tests

- every permitted transition
- every forbidden transition
- rejection from all three active states with a required reason
- complete/incomplete verification checklists
- objection-window open/closed calculations
- resolved and unresolved objection gating
- missing recipient, terminal state, assignment, and stale-owner holds

### API tests

- Land Office jurisdiction and assignment filtering
- combined scope/status filters
- role, active-user, jurisdiction, and assignment authorization
- start-verification persistence and audit entry
- complete-verification persistence, policy-derived dates, and audit entry
- approval transaction, ownership-chain update, and audit entry
- rejection persistence and mandatory reason
- double-approval and stale-transition conflicts
- detail aggregate and timeline ordering

### MSW parity and frontend tests

- list and detail payload compatibility
- buttons shown or disabled for each status
- filters compose and persist in the URL
- card and keyboard interaction opens details
- verification validation
- approval and rejection confirmation dialogs
- immediate query refresh after successful actions
- no optimistic status change after a failed request
- parcel navigation and filter restoration
- loading, empty, filtered-empty, not-found, and retryable error states

### Final verification

- relevant unit and integration test suites
- TypeScript checking
- linting
- production build
- desktop, tablet, and mobile browser checks
- no browser console errors
- no broken mutation or parcel routes
- Citizen Portal mutation filing and parcel regression checks

## 15. Completion Criteria

The module is complete when the existing Mutations page behaves as a persistent, jurisdiction-scoped officer queue; every visible control performs a valid action or clearly explains why it is unavailable; workflow transitions and ownership changes are enforced transactionally; the detail dialog presents real documents, verification, objection, and audit data; and existing Citizen Portal and parcel behavior remain intact.
