# Real GPS Boundary Walk Design

## Goal

Extend the existing Field Verification Session so an assigned Field Agent can start a real browser GPS watch, record an ordered and immutable land-boundary track, inspect it on the existing Leaflet map style, and complete the survey with server-calculated quality and geometry results. Production code must never synthesize coordinates.

## Scope

This chunk covers browser permission handling, continuous GPS acquisition, bounded in-memory batching, append-only persistence, map rendering, server-side completion analysis, mock parity, authorization, reload recovery, and automated tests. It does not add offline synchronization, service-worker/background capture, IndexedDB queues, evidence capture, or new pause controls.

The current Field Agent routes, page hierarchy, cards, colors, typography, Start action, Complete action, findings workflow, and photo area remain intact. The GPS card changes only where required to show live state, the existing parcel boundary, current position, track, accuracy, and actionable errors.

## Chosen Architecture

GPS points are stored as relational, append-only rows under the existing `FieldSurveySession`. This is preferred over expanding `FieldReport.gpsCaptures` or storing one growing JSON array because appending rows avoids rewriting the full track, supports a unique sequence constraint, makes retries and concurrent writes safe, and keeps raw points queryable without conflating a continuous walk with legacy manually captured evidence.

The browser owns acquisition and short-lived batching. The server owns authorization, durable ordering, validation, quality classification, and completion calculations. The same shared types and pure analysis rules are consumed by the frontend, MSW mock, and Nest backend.

## Shared Domain Contract

Add these concepts to `@plotguard/rules`:

- `FieldSurveyGpsPoint`: point ID, session ID, positive integer sequence, latitude, longitude, recorded timestamp, accuracy, and nullable altitude, speed, and heading.
- `GpsPointInput`: the browser-supplied fields before the server associates the point with a session.
- `GpsPointIssue`: `poor-accuracy`, `very-poor-accuracy`, `unrealistic-jump`, or `non-increasing-time`.
- `FieldSurveySummary`: total points, start/end timestamps, approximate path length, optional approximate area, accuracy statistics, geometry state, confidence, issue counts, and whether path length is reliable.
- `FieldSurveySession` gains `points` and optional `summary` in API responses. Stored Prisma relations are projected into this contract rather than exposed directly.

Optional sensor values remain absent at acquisition when the browser reports `null`. The API transport and database may represent absence as `null`, but no fallback value is generated.

The legacy `FieldReport.gpsCaptures` contract remains readable for previously stored reports. New boundary-walk points are not duplicated into that JSON field. `filingReview` receives an optional GPS-count override so existing callers retain current behavior while an active survey uses its persisted track count.

## Point Validation and Quality Rules

Every submitted point must have:

- A UUID-compatible client point ID used for idempotent retries.
- A positive integer sequence.
- Latitude from `-90` through `90` and longitude from `-180` through `180`.
- A valid ISO timestamp.
- Finite, non-negative accuracy.
- Finite altitude when present.
- Finite, non-negative speed when present.
- Finite heading in the range `0` through less than `360` when present.

Raw points passing structural validation are always retained, including inaccurate or suspicious points. Quality flags annotate rather than delete them:

- Accuracy over 25 metres: `poor-accuracy`.
- Accuracy over 50 metres: `very-poor-accuracy` as well as poor accuracy.
- A timestamp not later than its predecessor: `non-increasing-time`.
- Implied movement over 45 metres per second between consecutive, time-ordered points: `unrealistic-jump`.

These constants live in the pure rules module and are tested as part of the shared contract.

## Ordering and Idempotency

The browser initializes its next sequence from the last persisted point returned by report detail. Each new `GeolocationPosition` receives the next sequence immediately and is never renumbered in memory.

The database enforces unique `(fieldSurveySessionId, sequence)` and a unique point ID. A batch must be contiguous relative to the last persisted sequence. An exact replay of already-persisted point IDs and values succeeds idempotently. Reusing an ID with different content, reusing a sequence for another point, or creating a gap returns `409 Conflict`. There are no update or delete endpoints for track points.

## Browser GPS Lifecycle

### Start

The existing Start action performs the following sequence from its user gesture:

1. Check that `navigator.geolocation` exists.
2. Query `navigator.permissions` for geolocation when that API is available, recording `granted`, `prompt`, or `denied`. Lack of Permissions API support is `unknown`, not denial.
3. Request one high-accuracy position with a 15-second timeout and no cached result (`maximumAge: 0`).
4. If the fix succeeds, call the existing survey-start endpoint, queue the real first point, and begin `watchPosition` with high accuracy.
5. If permission is denied, GPS is unavailable, or the request times out, show the matching localized error and do not create the server session.

Geolocation error code 1 maps to permission denied, code 2 to unavailable, and code 3 to timeout. Unsupported browsers produce the unavailable state. No error path falls back to parcel coordinates or random values.

### Active Walk

While the session is active, `watchPosition` records every structurally valid browser fix. The current position and accuracy status update immediately. Points are buffered in memory and flushed when five points accumulate or ten seconds elapse. Only one flush runs at a time; later points remain queued. A batch contains at most 50 points.

Network errors keep the unsent batch in memory, show a non-destructive synchronization error, and retry on the next scheduled flush while the page remains open. This is not offline synchronization: there is no durable browser queue, background worker, or later-session replay.

### Reload and Resume

Report detail returns the active session and all persisted points. On reload, the page restores the track and next sequence. If permission is already `granted`, it restarts the GPS watch automatically. If permission is `prompt`, `denied`, `unknown`, or the GPS attempt fails, the existing GPS action area offers a localized Resume/Retry GPS action so permission-sensitive work occurs from a user gesture. It does not create another server session.

An abrupt page termination may lose only the current in-memory, unacknowledged batch. Durable offline queuing and later synchronization are explicitly deferred.

### Complete and Cleanup

Complete first stops the watcher, drains the current batch, and only then calls the completion endpoint. If the drain fails, completion does not proceed and the user can retry without losing the in-memory points. Navigation/unmount clears the watch and timers. Completing, closing, or changing to a non-active session prevents further acquisition.

The existing screen has no Pause control, so this chunk does not add one. Reload recovery is session resume, not a new lifecycle state.

## Persistence Model

Add `FieldSurveyGpsPoint` to Prisma:

- `id: String` primary key supplied as the client point ID.
- `fieldSurveySessionId: String` foreign key to `FieldSurveySession` with cascade delete at the database relationship level; the application exposes no session deletion flow.
- `sequence: Int`.
- `latitude: Float` and `longitude: Float`.
- `recordedAt: DateTime` from the browser position timestamp.
- `receivedAt: DateTime` defaulting to server time.
- `accuracyMeters: Float`.
- Nullable `altitudeMeters`, `speedMetersPerSecond`, and `headingDegrees`.
- `issues: Json`, holding the server-calculated issue-code array.

Add unique `(fieldSurveySessionId, sequence)` plus indexes on `(fieldSurveySessionId, recordedAt)` and `receivedAt`.

Add nullable `summary: Json` to `FieldSurveySession`. It is written once when completion succeeds. Points remain the raw authoritative record; the summary is a reproducible completion snapshot.

## API Contract

### Batch Append

`POST /field-reports/:id/survey/points`

Request:

```ts
{ points: GpsPointInput[] }
```

Response:

```ts
{ points: FieldSurveyGpsPoint[]; acceptedThroughSequence: number }
```

The body must contain 1 through 50 points. The endpoint requires a valid access token and `field-agent` role. It resolves the authenticated actor from the token and finds the report by both route ID and `assignedAgentId`; another agent receives `404`. It then verifies that the report and owned session are both `in-progress` before validating idempotency, continuity, and quality inside a transaction.

The route ID is only a lookup hint. The server derives the session, assignment, and parcel relationship from authenticated database records and never trusts a client-supplied case or agent ID.

### Detail

`GET /field-reports/:id` retains its route and ownership behavior. Its `survey` value now contains persisted points ordered ascending by sequence and the completion summary when present. This supports map restoration and reload resume.

### Complete

`POST /field-reports/:id/survey/complete` retains its notes body and atomic report/dispute/audit behavior. Before changing state it loads ordered persisted points, passes their count into the existing filing gate, calculates the summary, and stores it on the session.

The existing purpose-specific evidence minimum still applies. For example, a boundary survey with fewer than two durable GPS points remains `422` and active. Tracks meeting the evidence minimum can complete even when polygon geometry is open, inaccurate, or otherwise low confidence; the resulting summary must state that condition instead of fabricating area.

The audit payload adds point count, path length, optional area, confidence, geometry state, and issue counts.

## Completion Calculations

Calculations use points in ascending sequence:

- `totalPoints`: number of persisted raw points.
- `startedAt`: first point timestamp, falling back to the session start only when there are no points.
- `endedAt`: last point timestamp, falling back to server completion time only when there are no points.
- `pathLengthMeters`: sum of Haversine distances for every consecutive coordinate pair.
- `pathLengthReliable`: false when any segment is an unrealistic jump or has non-increasing time.
- Accuracy minimum, maximum, arithmetic mean, and p95 over every point.
- Issue counts over all stored point annotations.

A polygon is valid for area only when it has at least four recorded points, at least three distinct coordinate positions, no unrealistic-jump or non-increasing-time issues, no very-poor-accuracy point, and the last point lies within 15 metres of the first. The calculation closes that already-near ring mathematically and applies a local equirectangular projection plus the shoelace formula. If any validity condition fails, `areaSquareMeters` is absent and geometry is classified as `insufficient-points`, `open`, or `invalid`.

Confidence is:

- `invalid` when any point sequence contains non-increasing time or an unrealistic jump.
- `low` when the track avoids those invalidating issues but has insufficient/open polygon geometry or any point has poor accuracy.
- `high` only when the polygon is valid and no point has a quality issue.

Path length remains reported for transparency even when flagged unreliable. Area is never reported for invalid geometry.

## Map and Existing UI

Create a focused Leaflet component following `ParcelLiveMap`'s direct Leaflet integration and dynamic-import boundary. It renders:

- The existing parcel boundary when present, without inventing one from a centroid.
- The ordered recorded track as a polyline.
- The current live position as a circle marker whose radius reflects accuracy where practical.

The map sits inside the existing GPS card and keeps its current spacing and visual tokens. The point list remains and shows sequence, coordinates, timestamp, accuracy, and quality status. The existing manual simulated-point note is removed. The photo and findings cards are not redesigned or expanded.

Because the existing Leaflet maps use OpenStreetMap tiles, the basemap may not load without connectivity. GPS acquisition and local live-track rendering do not depend on a successful tile request; offline tile caching is outside this chunk.

## MSW Parity

The mock database gains an append-only GPS point collection and summary-bearing sessions. Mock start/detail/batch/complete handlers enforce the same authentication, role, ownership, active-state, batch-size, continuity, idempotency, analysis, and response rules as Nest.

Automated mock inputs are deterministic simulated fixtures. The production browser module has no import or runtime path to those fixtures.

## Error Handling

- Browser permission denied: localized persistent GPS-card error and no fallback point.
- GPS unavailable or unsupported: localized unavailable error.
- Initial or watch timeout: localized timeout error with Retry GPS action.
- Poor accuracy: point is stored and visibly marked; tracking continues.
- Unrealistic jump: point is stored and visibly marked; summary becomes unreliable/invalid.
- Batch validation or sequence conflict: points remain queued in memory and completion is blocked until reconciled or detail is refreshed.
- Network failure: queued in memory only for the current page lifetime; completion is blocked while unsent points remain.
- Unauthorized or wrong-owner submission: `401`, `403`, or ownership-hiding `404`, with no point written.

## Testing Strategy

Development follows red-green-refactor.

Shared rule tests cover Haversine distance, ordered path length, p95 accuracy, closed valid polygon area, open polygon without area, too few points, poor/very-poor accuracy, non-increasing timestamps, unrealistic jumps, issue counts, and confidence.

Browser GPS service/controller tests inject fake Permissions and Geolocation interfaces and cover granted permission, prompt-to-granted, denied permission, unavailable API, timeout, multiple watch points, nullable sensor values, cleanup, batching, failed flush retention, completion drain, and initialization from a persisted active session. Browser simulation exists only in these tests.

Nest tests cover valid multi-point append, exact replay idempotency, sequence gaps/conflicts, malformed values, inactive sessions, completion summary persistence, invalid/open geometry, low accuracy, and another agent's rejected submission. Existing start, resume, completion, filing, and concurrent-transition tests remain passing.

MSW contract tests or extracted mock-state tests cover the same append, authorization, resume, and completion behavior. Final verification includes shared tests, frontend GPS tests, API tests, Prisma format/validation, API and frontend type checks, lint, production builds, `git diff --check`, and rendered browser inspection when the environment provides a browser.

## Acceptance Criteria

- Production Start requests real geolocation permission and never creates simulated coordinates.
- Denied, unavailable, and timeout states are distinguishable and recoverable.
- An active session continuously records complete browser GPS fields without inventing optional sensor values.
- Durable points are immutable, ordered, append-only, retry-safe, and scoped to the authenticated assigned agent.
- Reload restores all persisted points and can resume the same active session.
- The existing Leaflet design shows parcel reference geometry, recorded track, and current position.
- Completion flushes pending points and stores deterministic calculations and quality results.
- Invalid tracks retain raw data, clearly omit invalid area, and expose confidence/issues.
- The existing Start/Complete workflow and surrounding Field Agent UI remain recognizable and structurally unchanged.
- No offline synchronization, evidence-capture expansion, or Pause control is implemented.
