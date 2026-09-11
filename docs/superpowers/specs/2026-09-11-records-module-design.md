# Land Office Records Module Design

**Date:** 2026-09-11  
**Status:** Approved for implementation planning  
**Scope:** Land Office Portal → Records only

## 1. Objective

Implement the Records workspace for Land Office Staff without redesigning the application or changing the Citizen Portal. The module will extend the existing parcel domain, API, mock layer, and UI components. It will support jurisdiction-scoped record discovery, detailed official-record review, record creation, controlled administrative updates, verification, and immutable audit history.

The implementation explicitly excludes Mutations, OCR Queue, Fraud Review, Field Agents, Revenue Cases, Lease & Settlement, and Acquisition & Requisition. Records may link to existing workflows, but those workflows will not be expanded in this work.

## 2. Existing Architecture

The repository uses:

- Next.js App Router, React, TypeScript, Tailwind CSS, and the existing shadcn-style component library for the web application.
- TanStack Query and the existing API client for frontend data access.
- NestJS with Prisma and PostgreSQL for the real backend.
- MSW as the default preview/demo backend.
- `@plotguard/rules` as the shared domain contract and validation package.
- An append-only, hash-chained audit service on the real backend, with matching mock behavior.

The existing `/records` screen already provides the visual foundation for the required list, while `/parcels/[id]` contains reusable Citizen Portal parcel-detail patterns and GIS components. These will be extended or reused rather than duplicated.

## 3. Domain and Persistence Design

### 3.1 Parcel remains the source of truth

The existing `Parcel` model remains the authoritative land-record entity. A second `LandRecord` model will not be introduced.

Existing fields continue to represent the requested concepts:

| Records concept | Existing representation |
| --- | --- |
| BhumiID | `ulpin` |
| Dag Number | `dagNo` |
| Khatian Number | `khatianNo` |
| Current owner | `ownerId` relation |
| Area | `areaValue` and `areaUnit` in persistence; `area` in domain views |
| Status | `registryStatus` |
| Disputes | related disputes and computed open dispute count |
| Mouza/upazila/district/division | jurisdiction relation and ancestors |

The BhumiID label will be used in the Land Office UI while retaining the existing ULPIN field and established identifier format.

### 3.2 Parcel extensions

The Parcel persistence model and shared domain contract will add:

- `surveyType`
- optional `unionName`
- `createdAt`
- `updatedAt`
- optional `verifiedAt`
- optional `verifiedById`
- optional `verificationNotes`

`unionName` is parcel metadata rather than a new jurisdiction level. The existing Division → District → Upazila → Mouza hierarchy will remain unchanged to avoid breaking existing jurisdiction logic.

The supported registry statuses remain:

- `verified`
- `pending`
- `disputed`
- `flagged`
- `under-mutation`

No status changes happen implicitly. Creation sets `pending`; verification is the only Records workflow that changes an eligible record to `verified`.

### 3.3 Ownership history extensions

`OwnershipRecord` remains append-only. It will gain optional relationships to:

- the mutation/application that caused the ownership event
- the officer who recorded or approved the event

The Records detail aggregate will derive the previous and new owner for each chronological event and enrich it with related mutation and document information. Ownership events are read-only in the Records module.

### 3.4 Uniqueness

In addition to unique BhumiID/ULPIN enforcement, duplicate official records will be prevented for the combination:

`Mouza jurisdiction + Survey Type + Dag Number + Khatian Number`

The database constraint and service validation will use the same normalized combination. Conflicts will return a clear duplicate-record error.

## 4. Authorization and Jurisdiction Rules

All authenticated users retain their existing read behavior where currently allowed. Records management writes are restricted to active users with the `land-office` role.

Land Office Staff may:

- view and search records within their assigned jurisdiction and its descendants
- view record details, ownership history, mutations, disputes, documents, GIS data, verification data, and audit history
- create records when active and assigned to a jurisdiction
- update the permitted administrative metadata
- verify eligible records
- open or request related existing workflows

Land Office Staff may not:

- delete official records or audit entries
- directly change the current owner
- modify ownership or mutation history
- change dispute decisions or field-agent evidence
- bypass the verification workflow

The real API and MSW handlers will enforce the same role and jurisdiction rules. UI visibility is only a usability layer and is not the authorization boundary.

## 5. API Design

Existing project naming conventions will be retained.

### 5.1 Existing endpoints retained

- `GET /parcels` — list/search/filter parcels
- `GET /parcels/:id` — existing Citizen-compatible parcel details
- `GET /audit/parcel/:id` — read-only parcel audit history

For Land Office requests, list and record-detail results are constrained to the current officer’s jurisdiction. Existing Citizen Portal behavior is preserved.

### 5.2 New Records endpoints

- `GET /parcels/:id/record`
  - Returns the Land Office aggregate: parcel, jurisdiction path, limited current-owner information, enriched ownership history, mutation history, disputes, documents, GIS information, verification information, and audit history.
  - Requires an active Land Office Staff user and in-scope jurisdiction.

- `POST /parcels`
  - Creates a new record in `pending` status.
  - Validates required data, identifier uniqueness, owner existence, jurisdiction coverage, and composite record uniqueness.
  - Creates the initial ownership record and audit entry in the same database transaction.

- `PATCH /parcels/:id/metadata`
  - Allows only title, land-use classification, area/unit, survey type, union, and administrative location metadata.
  - Requires a reason and at least one actual change.
  - Rejects ownership, status, history, audit, and other sensitive fields.
  - Writes the record changes and a before/after audit entry transactionally.

- `POST /parcels/:id/verify`
  - Requires all six checklist values and non-empty officer remarks.
  - Allows verification of `pending` and `flagged` records.
  - Blocks verification of `disputed` and `under-mutation` records so their controlling workflows are not overwritten.
  - Saves `verifiedAt`, `verifiedById`, and notes; changes the status to `verified`; and appends an audit entry in one transaction.

### 5.3 Error behavior

Endpoints will use the application’s existing error envelope and return appropriate status codes:

- `400` for malformed input
- `401` for unauthenticated requests
- `403` for incorrect role or out-of-jurisdiction access
- `404` when the land record or referenced entity does not exist
- `409` for duplicate BhumiID or duplicate parcel combinations
- `422` for a validly shaped request that violates a Records workflow rule

## 6. Frontend Design

### 6.1 Records list

The existing `/records` layout, page label, title, description, search field, filter tabs, table styling, badges, spacing, typography, colors, and responsive behavior will be preserved.

The page will provide:

- case-insensitive search across Dag, Khatian, owner name, title, and BhumiID
- functional `All`, `Verified`, `Pending`, `Disputed`, `Flagged`, and `Under mutation` filters
- combined search and filter behavior
- clickable and keyboard-accessible rows opening `/records/[id]`
- `+ Add Land Record` for authorized Land Office Staff
- existing table columns: Dag / Khatian, Title, Owner, Land use, Area, Status, and Disputes

Desktop retains the table. Narrow screens use compact record cards to avoid unnecessary horizontal scrolling while retaining the same information and design language.

States include:

- `Loading land records...`
- an unfiltered empty-register state
- `No land records found` with `Clear search` when filters or search remove all results
- `Unable to load land records. Please try again.` with a retry action

Search and filters update the data without a full-page reload.

### 6.2 Land Office record detail

A dedicated `/records/[id]` route will be added. The Citizen Portal `/parcels/[id]` route will remain unchanged.

The page will reuse existing cards, badges, buttons, tables, formatting helpers, document/dispute presentation, and the Leaflet parcel map. It will contain:

1. Land Record
   - BhumiID, Dag, Khatian, title, Mouza, Union, Upazila, District, and Division
2. Land Information
   - land use, area, area unit, survey type, and status
3. Current Owner
   - name, reference identifier, and address only when a safe address field is available
4. Ownership History
   - chronological, read-only previous/new owner events with date, mutation/application, supporting document, responsible officer, and status
5. Mutation History
   - mutation ID, type, applicant, date, status, and responsible officer
6. Disputes
   - case ID, type, filed date, status, and priority, or `No active disputes`
7. Documents
   - name, type, date, verification status, and reference number, with View and Download actions
8. Plot Location
   - existing map/polygon when available; otherwise the existing-style GIS placeholder, plus Dag, coordinate/reference, area, boundary status, and `View on Map`
9. Verification
   - status, last verified date, verifier, and notes
10. Audit History
    - read-only user, role, action, timestamp, before/after values, and reason

Unavailable mock document files will show disabled View/Download actions instead of broken links.

Record-not-found and API-error states will use existing page patterns.

### 6.3 Record actions

The page action area may show, according to permission and state:

- Verify Record
- View Audit History
- View GIS
- View Documents
- Start Mutation
- Request Field Verification

The last two actions only navigate to or initiate already-existing workflows; this implementation does not build those modules. No generic unrestricted Edit Record action will be added.

### 6.4 Verify Record dialog

The existing modal components will display identifying record information, current status, six required checklist items, and an officer remarks field.

Checklist items:

- Dag verified
- Khatian verified
- Owner verified
- Area verified
- Land-use classification verified
- Supporting documents checked

Submission remains disabled until all checks are complete and remarks are provided. Success updates the detail/list/audit caches and shows:

`Land record {BhumiID} has been verified.`

### 6.5 Add Land Record

An authorized Land Office Staff user can open `/records/new`. The form will use the project’s React Hook Form and Zod conventions and existing form controls.

Fields:

- BhumiID
- Dag Number
- Khatian Number
- Title
- Mouza
- Union
- Upazila
- District
- Land Use
- Area
- Area Unit
- Survey Type
- Owner
- Initial Status, displayed as Pending and not user-overridable

Owner selection uses existing user/citizen lookup data rather than duplicating owner information. Required fields and numeric area are validated client-side and server-side. The server remains authoritative for duplicates and permissions.

### 6.6 Controlled metadata update

The detail page will expose a clearly named administrative update action for authorized staff. Its dialog shows the previous value, proposed value, and a required reason. It includes only the allowed fields described in the API design.

Successful updates refresh list, detail, and audit queries and show an existing-style success notification. There is no direct ownership or status control.

## 7. Audit Design

The existing append-only audit service remains authoritative. Creation, verification, and each controlled metadata update create immutable entries in the same transaction as the record change.

Entries capture:

- actor user and role
- action
- timestamp
- parcel/record identifier
- previous value
- new value
- reason or verification notes

Audit history is read-only in both the API and UI. No delete or update endpoint will be introduced.

## 8. Mock and Production Parity

Structured Bangladesh demo data will be maintained in the existing mock-data area and will use realistic Dag/Khatian values and fictional people. Mock handlers will expose the same payloads, validation, status transitions, authorization checks, audit behavior, and errors as the real NestJS API.

Mock state changes are session-local and are not presented as production persistence. Production persistence remains Prisma/PostgreSQL.

## 9. Data Flow

### Read flow

1. `/records` requests jurisdiction-scoped records with search and status parameters.
2. The API applies search, status, and jurisdiction conditions together.
3. Selecting a row opens `/records/[id]`.
4. The detail route retrieves the Land Office record aggregate.
5. Sections render from the aggregate while reusing shared domain types and components.

### Write flow

1. The UI validates the form or dialog.
2. The API independently authenticates the actor and checks role/jurisdiction.
3. The service validates workflow and uniqueness rules.
4. Prisma performs the record write and audit append transactionally.
5. The response updates TanStack Query caches and triggers a success notification.

## 10. Testing and Verification

Implementation will be test-driven around the following behavior:

- records list loads successfully
- case-insensitive search works for all required fields
- each status filter works
- search and status filters compose correctly
- no-result, empty, loading, API-error, and record-not-found states render
- row interaction opens record details
- ownership, mutation, document, dispute, GIS, verification, and audit sections render
- Land Office role and jurisdiction restrictions are enforced by the API and mock layer
- creation validates required fields and forces `pending`
- duplicate BhumiID and composite parcel combinations are rejected
- metadata updates reject forbidden fields and require a reason
- verification requires the complete checklist and remarks
- disputed and under-mutation records cannot be overwritten by verification
- successful verification saves verifier data, changes status, and appends an audit entry
- audit entries cannot be modified or deleted
- responsive Records screens avoid unnecessary horizontal scrolling
- Citizen Portal parcel behavior and routes remain intact
- TypeScript, linting, relevant unit/integration tests, production build, and browser console checks pass

## 11. Migration and Compatibility

The Prisma migration will add nullable verification and union fields where necessary and backfill/default `surveyType` for existing demo records before enforcing the new composite uniqueness rule. Seed and MSW records will be updated together.

Existing API response fields will not be removed or renamed. New fields are additive, and the new office aggregate uses a separate endpoint so Citizen Portal clients are not forced to consume office-only data.

## 12. Completion Criteria

The Records module is complete when authorized Land Office Staff can discover, inspect, create, administratively update, and verify jurisdiction-scoped records through the existing visual system; sensitive ownership and history data remain workflow-controlled and read-only; all material changes are audited; mock and real APIs agree; and the Citizen Portal continues to work without regression.
