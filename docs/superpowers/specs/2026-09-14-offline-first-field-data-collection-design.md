# Offline-First Field Data Collection Design

## Goal

Make PlotGuard's Field Agent boundary walk resilient to lost connectivity. The browser must persist the active survey and every real GPS point before attempting upload, restore them after a reload, and synchronize them automatically and idempotently when the server becomes reachable again.

## Prerequisite and Scope

This checkout contains the approved Real GPS Boundary Walk design in `docs/superpowers/specs/2026-09-14-real-gps-boundary-walk-design.md`, but not its implementation. Chunk 5 therefore includes implementation of that design as a prerequisite: real browser geolocation, continuous ordered GPS capture, append-only point persistence, map display, validation, completion calculations, ownership enforcement, and batching.

Chunk 5 adds durable browser storage, queued start/point/complete operations, automatic synchronization, retry limits, conflict preservation, and reload recovery. It does not add background GPS capture after the browser suspends the page, offline map-tile downloads, service-worker background sync, or photo/video evidence.

The existing Field Agent routes, case cards, capture-page structure, GPS card, map style, controls, typography, colors, findings workflow, and photo placeholder remain intact. Only compact GPS, connectivity, and synchronization states are added where the current UI already presents survey status.

## Chosen Architecture

The browser uses IndexedDB directly through a small typed repository. IndexedDB is preferred because GPS tracks can grow beyond the safe size of localStorage, writes are transactional, and records can be indexed without serializing one growing document. localStorage is not used for survey payloads or GPS data.

Three browser stores separate responsibilities:

- `surveys`: one durable local snapshot per field report, including local/server session identity, survey state, timestamps, next sequence, synchronization state, and the latest acknowledged server version.
- `gpsPoints`: append-only points keyed by client UUID and indexed by field report plus sequence. Optional sensor values remain absent when unavailable.
- `operations`: the durable synchronization queue. Operations are processed in creation order for each survey.

The browser writes a point and its pending append operation in one IndexedDB transaction before updating the visible track. Network availability never gates GPS acquisition. The server remains authoritative for assignment, accepted workflow state, point validation, ordering, completion analysis, and final survey state.

## Local Data Contract

### Local survey

```ts
interface OfflineFieldSurvey {
  fieldReportId: string;
  localSessionId: string;
  serverSessionId?: string;
  assignedAgentId: string;
  state: "starting" | "in-progress" | "completing" | "completed" | "conflict";
  startedAt: string;
  completedAt?: string;
  nextSequence: number;
  syncStatus: SyncStatus;
  serverVersion?: number;
  updatedAt: string;
}
```

The authenticated agent ID is part of local ownership. Loading a local survey requires both the active user and field report to match, preventing one account on a shared device from seeing another account's cached work.

### GPS point

The point shape follows the Real GPS Boundary Walk contract: client UUID, local/server session association, positive sequence, latitude, longitude, browser timestamp, accuracy, and optional altitude, speed, and heading. No missing value is invented. Points are never edited or deleted through the application.

### Queue operation

```ts
type SyncStatus = "PENDING" | "UPLOADING" | "SYNCED" | "FAILED" | "CONFLICT";

interface FieldSyncOperation {
  localId: string;
  operationType: "START_SURVEY" | "APPEND_POINTS" | "COMPLETE_SURVEY";
  entityType: "field-survey";
  entityId: string;
  fieldReportId: string;
  assignedAgentId: string;
  payload: unknown;
  createdAt: string;
  syncStatus: SyncStatus;
  retryCount: number;
  lastError?: string;
  nextAttemptAt?: string;
  serverResult?: unknown;
  conflict?: { localData: unknown; serverData: unknown };
}
```

`localId` is a cryptographically random UUID generated once and reused for every retry. Timestamps are descriptive only and never serve as idempotency keys.

## Real GPS Lifecycle

Starting a walk checks geolocation availability, queries the Permissions API when supported, and requests a high-accuracy initial fix from the user's click. Permission denied, unavailable, and timeout remain distinct localized states. Production code never falls back to parcel centroids, random offsets, or other synthetic coordinates.

After the initial fix, `watchPosition` records continuously with high accuracy. Each fix receives its immutable sequence immediately. The browser commits it to IndexedDB before it appears in the track. Optional altitude, speed, and heading are stored only when the browser supplies a finite value.

The existing Start action creates an offline-capable local session and queues `START_SURVEY`. If online, synchronization begins immediately. If offline, recording continues against the local session. A page reload restores the survey and points; GPS watching resumes automatically only when permission is already granted. Otherwise the existing GPS action area presents a Resume/Retry action so the permission request remains tied to a user gesture.

The browser cannot guarantee location callbacks while the operating system suspends or closes the page. PlotGuard preserves all callbacks already received and clearly resumes the same session when the page is active again.

## Queue Construction and Batching

Point records are durable individually, while network operations batch contiguous unsynchronized points. A batch contains no more than 50 points. The queue coalesces adjacent pending point operations for the same survey when safe, but never changes point IDs, sequence values, or raw values.

Operations for one survey are strictly ordered:

1. `START_SURVEY`
2. one or more `APPEND_POINTS`
3. `COMPLETE_SURVEY`

Completion first stops the watcher, persists any final point, and queues completion behind all point batches. The UI may show completion as pending, but the local record does not become fully completed until the server acknowledges it.

Only one synchronizer runs per browser tab. A short IndexedDB lease prevents overlapping processors in multiple PlotGuard tabs. An expired lease can be recovered after a crash.

## Connectivity and Synchronization

`navigator.onLine` and browser `online`/`offline` events provide immediate UI hints and trigger attempts, but only an acknowledged HTTP response proves synchronization. The processor also runs on application startup, after queue writes while apparently online, and on a bounded periodic timer while visible.

For each eligible operation the processor:

1. atomically changes `PENDING` or retryable `FAILED` to `UPLOADING`;
2. sends the operation with its stable idempotency key;
3. waits for server acknowledgement;
4. stores the acknowledgement and marks the operation `SYNCED`;
5. updates local survey/server identity or point acknowledgement state;
6. advances to the next operation for that survey.

An `UPLOADING` operation found after reload is returned to `PENDING`; the stable idempotency key makes replay safe. Synchronized queue metadata remains archived locally for auditability. Large acknowledged payloads are compacted after a retention window while identity, type, timestamps, status, retry count, and acknowledgement remain.

## Retry and Failure Policy

Network failures, timeouts, `408`, `425`, `429`, and `5xx` responses are retryable. Retries use exponential backoff with jitter, starting near two seconds and capped at five minutes. A foreground operation receives at most five automatic retries. After that it remains durable as `FAILED` and the existing survey status area exposes a Retry Sync action. A manual retry resets eligibility but not the operation ID or retry history.

Authentication failures pause the processor without discarding data. Validation failures are terminal `FAILED` records. A later successful login by the same assigned agent can resume the queue.

The processor never loops continuously, and an offline event cancels scheduled immediate work while keeping the next-attempt metadata.

## Idempotency Protocol

Every mutating survey request carries `Idempotency-Key: <operation.localId>`. The server stores a `FieldSurveySyncReceipt` with operation ID, authenticated agent ID, field report ID, operation type, canonical payload hash, status code, and response body.

When a key is first seen, the server executes the mutation and receipt write in one database transaction. An exact replay by the same authenticated agent returns the stored response without reapplying the mutation. Reusing the key with a different actor, report, operation type, or payload hash returns `409 Conflict`.

GPS point UUIDs and the unique `(fieldSurveySessionId, sequence)` constraint provide a second idempotency layer. A replay cannot create duplicate points even if a receipt recovery is required.

## Server API

The existing endpoints remain recognizable and accept the idempotency header:

- `POST /field-reports/:id/survey/start`
- `POST /field-reports/:id/survey/points`
- `POST /field-reports/:id/survey/complete`

Start accepts the client-generated `localSessionId` and uses it to create or resolve the one-to-one server session. Point append accepts 1 through 50 ordered point inputs. Complete accepts findings plus the expected server version.

Each route authenticates the token, requires the `field-agent` role, and resolves the field report by both route ID and `assignedAgentId`. The frontend's agent, case, session, or parcel identifiers are never trusted as authorization evidence.

Responses include the server session ID, monotonically increasing survey version, acknowledged point sequences, and current server survey state. The detail endpoint returns the complete ordered server track and summary so the client can reconcile after reload.

## Conflict Handling

The server returns `409` with a structured current survey snapshot when an operation is well-formed but incompatible with server state: changed assignment, divergent session identity, sequence collision, completion-version mismatch, or a server-completed survey receiving new local points.

The client marks the operation and local survey `CONFLICT`, stores both the immutable local payload and server snapshot, stops automatic processing for that survey, and leaves all local GPS points intact. It never selects a winner or overwrites either side. The existing survey status area displays a conflict state and directs the agent to retain the device data for authorized resolution. An administrative conflict-resolution workflow is outside this chunk.

Ownership-hiding `404` and explicit `403` responses are not treated as mergeable conflicts; they pause the queue as failed authorization while preserving local data.

## Database Changes

Implement the `FieldSurveyGpsPoint` and `FieldSurveySession.summary` model from the Real GPS Boundary Walk design. Add an integer `version` to `FieldSurveySession`, starting at one and incremented by acknowledged mutations.

Add `FieldSurveySyncReceipt`:

- `idempotencyKey: String` primary key;
- `assignedAgentId: String` with a relation to `User`;
- `fieldReportId: String` with a relation to `FieldReport`;
- `operationType: String`;
- `payloadHash: String`;
- `statusCode: Int`;
- `responseBody: Json`;
- `createdAt: DateTime` defaulting to server time.

Indexes cover `(assignedAgentId, createdAt)` and `(fieldReportId, createdAt)`. Receipts are append-only through application code. The migration does not remove or rewrite legacy `FieldReport.gpsCaptures` data.

## Completion and Reconciliation

Completion analysis follows the Real GPS Boundary Walk design: ordered raw point count, first/last timestamps, Haversine path length, valid closed-polygon area only, accuracy minimum/maximum/mean/p95, issue counts, geometry state, confidence, and path-length reliability. Suspicious points remain stored and annotated. Invalid geometry never receives fabricated area.

After every successful synchronization pass, the client compares acknowledged server points with local UUIDs and sequences. Exact matches become acknowledged. Missing server points remain queued. A UUID or sequence with different values becomes a conflict. Server-only points are retained in the merged displayed track and are not copied into a pending local operation.

## UI Preservation

The current capture page remains the host. The GPS card gains only:

- online/offline text using existing status styles;
- pending, syncing, synced, failed, or conflict state;
- unsynchronized point count;
- Retry Sync when automatic retries are exhausted;
- the real GPS map and accuracy/quality information required by Chunk 4.

The Start and Complete controls stay in their existing positions. The page does not add Pause merely for this feature. Existing photo controls are not made offline-capable and are not expanded.

## MSW Parity

MSW gains in-memory GPS point and idempotency-receipt collections. Its start, batch append, detail, and complete handlers enforce the same role, ownership, state, version, sequence, replay, conflict, and completion rules as NestJS. Browser storage and queue tests do not depend on MSW internals.

Simulated geolocation exists only in automated tests through injected browser interfaces. No production module imports test fixtures or generates coordinates.

## Testing Strategy

Development follows red-green-refactor.

Shared rule tests cover point validation, ordering, quality flags, distance, accuracy statistics, valid area, invalid/open geometry, and confidence.

IndexedDB repository tests cover transactional point-plus-operation writes, agent isolation, ordering, archived acknowledgements, stale upload recovery, and reload restoration. Queue tests cover online success, offline deferral, sequential start/append/complete processing, batching, retry caps, manual retry, conflict preservation, and exact replay.

Browser GPS tests inject Permissions and Geolocation interfaces and cover grant, denial, unavailable API, timeout, continuous points, optional sensor values, offline capture, watcher cleanup, and reload resume. Production behavior uses only the real browser APIs.

NestJS tests cover authorization, multi-point append, exact idempotent replay, changed-payload key reuse, sequence conflicts, version conflicts, completion, invalid geometry, and no duplicate server rows. MSW contract tests mirror these cases.

The end-to-end synchronization scenario is:

1. start online and acknowledge the survey;
2. switch the network adapter to offline;
3. record several real-interface test fixes;
4. verify durable local points and pending operations;
5. recreate the repository/controller to model reload;
6. restore the same survey and sequence;
7. reconnect and process the queue;
8. replay the same operations;
9. assert one server session, one copy of each point, correct ordering, completed state, and no pending queue entries.

Final verification includes focused browser tests, shared rules tests, API tests, Prisma format and validation, API build/typecheck, frontend lint/typecheck/build to the extent allowed by existing unrelated failures, `git diff --check`, and rendered browser inspection.

## Acceptance Criteria

- Production GPS uses real browser geolocation and never synthesizes coordinates.
- Losing connectivity does not stop an active boundary walk or discard received points.
- Survey metadata, state, raw points, queued operations, and synchronization state survive reload.
- Restoring connectivity triggers safe ordered synchronization without agent action.
- Exact retries create no duplicate survey, point, completion, dispute event, or audit event.
- Retryable failures stop after the defined automatic limit and remain recoverable.
- Conflicts retain both local and server data and never overwrite silently.
- The server authorizes every operation from the signed actor and assigned report relationship.
- Completion uses durable ordered points and never fabricates invalid polygon area.
- Existing Field Agent structure and styling remain recognizable and no evidence-capture feature is added.
