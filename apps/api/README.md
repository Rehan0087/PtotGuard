# @plotguard/api

The real PlotGuard backend — NestJS + Postgres, behind the same frozen API
spec the frontend's mock (`lib/mocks/handlers.ts` in the web app) already
implements. Point the frontend at this instead of the mock by setting
`NEXT_PUBLIC_API_MOCKING=disabled` — nothing in a screen or hook changes.

If you haven't read the root [`README.md`](../../README.md) yet, start there:
it explains the product, the design system, and `@plotguard/rules`, the
package this app is built on top of.

## Running it locally

```bash
podman run -d --name plotguard-pg -e POSTGRES_PASSWORD=plotguard \
  -e POSTGRES_DB=plotguard -p 55432:5432 docker.io/library/postgres:16-alpine
cp .env.example .env   # already points at the container above
pnpm --filter @plotguard/rules build
pnpm exec prisma migrate dev
pnpm exec prisma db seed
pnpm dev
```

`docker` works the same if you have it instead of `podman`. The seed data
(`prisma/seed.ts`) is a line-for-line port of the frontend mock's dataset
(`lib/mocks/data.ts`), so the app looks identical whichever one you're
pointed at — that's deliberate, so drift between them is visible on sight.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server with reload, on `:3001` |
| `pnpm build` | Compile to `dist/` (excludes `*.test.ts`) |
| `pnpm start` | Run the compiled build |
| `pnpm test` | Vitest — pure-function and contract tests, no DB needed |
| `pnpm typecheck` | `tsc --noEmit`, includes test files |
| `pnpm exec prisma migrate dev` | Apply schema changes |
| `pnpm exec prisma db seed` | Reset to the demo dataset |
| `pnpm exec prisma migrate reset --force` | Wipe and rebuild the local DB from scratch |

## How a request is organized

One folder per REST resource under `src/`, each holding some subset of:

- `*.controller.ts` — routes. Reads inject `PrismaService` directly and
  return a Prisma call; there is no repository or service layer for a query
  with no logic to isolate, only for HTTP wiring.
- `*.module.ts` — Nest's own wiring, one per folder, always the same four
  lines.
- `*.dto.ts` — request-body shape + `class-validator` decorators, for
  writes only. `ValidationPipe` (registered in `main.ts`) rejects anything
  a DTO doesn't declare, so a write's DTO is the actual contract for what a
  client may send — not a comment, a type the pipe enforces.
- A plain `.ts` file (no controller/module suffix) when a folder's logic is
  reused by another resource — `parcel-view.ts`, `dispute-audience.ts`,
  `audit-hash.ts`. If you're looking for where something is computed and it
  isn't in the controller, it's one of these.

`src/common/` and `src/prisma/` are the two folders that aren't a REST
resource: the error envelope + pagination helpers every controller shares,
and the Prisma client. Both are wired once in `app.module.ts` and available
everywhere without an explicit import (`@Global()`).

## The write pattern

Every write in the frozen spec that isn't a bare field update follows the
same four steps, because the frontend's mock already established this shape
and the real backend has to honor it exactly:

1. **Gate.** Call the matching pure rule from `@plotguard/rules`
   (`approvalGate`, `filingReview`, `rulingGate`, `reviewDraft`,
   `deletionGate`, `extractionReview`). Refuse with `ValidationError` and
   the gate's own blocker code if it says no — the gate decides, the
   controller only translates its answer into an HTTP status.
2. **Transaction.** Everything below runs inside one
   `prisma.$transaction(async (tx) => …)`. A write that partially applies —
   the record changes but the audit entry doesn't, or the reverse — is
   exactly the inconsistency this exists to rule out.
3. **Propagate.** Update the record; if it moves a dispute along, write the
   dispute's timeline entry too; if anyone has a stake in the outcome,
   notify them (`disputeAudience()` in `src/disputes/dispute-audience.ts`
   finds who).
4. **Audit.** `AuditService.append(tx, …)` (`src/audit/audit.service.ts`) —
   always last, always inside the same `tx`. It serialises itself against
   concurrent writers with a Postgres advisory lock, so two requests
   appending at once can't both read the same tail hash and fork the chain.

`src/mutations/mutations.controller.ts`'s `decide()` method is the smallest
complete example (gate → transaction → audit, no propagation). `src/hearings
/hearings.controller.ts`'s `issueRuling()` is the fullest one (gate →
transaction → resolve a dispute → timeline entry → notify → audit).

## Endpoint status

Every `GET` in the frozen spec is implemented and verified against a real
seeded database. Writes are landing gate-by-gate; unchecked rows still
serve from the mock only.

| Resource | Reads | Writes |
| --- | --- | --- |
| `jurisdictions` | ✅ list | ✅ create, update, delete (`reviewDraft`/`deletionGate`) |
| `parcels` | ✅ list, detail (+restrictions/transfer), history, neighbours, ULPIN lookup, public view | — (read-only resource) |
| `users` | ✅ list | — |
| `documents` | ✅ list, detail | ⬜ create, decision, fields, reprocess |
| `disputes` | ✅ list, detail | ⬜ create, status, assign-agent |
| `policies` | ✅ get | ✅ update |
| `mutations` | ✅ list, detail | ✅ create (`transferReview`), decision (`approvalGate`) |
| `service-applications` | ✅ list, detail | ✅ create, submit, pay, decision — shared foundation (see below) |
| `land-tax` | ✅ holdings (+assessment) | ✅ pay (`assessLandTax`) |
| `field-reports` | ✅ list, detail, assigned | ✅ update/file (`filingReview`) · ⬜ create, media |
| `hearings` | ✅ list, detail | ✅ ruling (`rulingGate`), sessions · ⬜ create |
| `notifications` | ✅ list (own inbox) | ✅ mark read, mark all read |
| `audit` | ✅ list, per-entity, verify | — (append-only, written by other endpoints) |
| `auth` | ✅ me (dev stand-in) | ⬜ login, refresh (real auth — see below) |

`service-applications` is the shared model behind six land services —
apply → pay → track → decide is the same workflow for all of them, so this
is one controller instead of six, with `details` (`Json`) holding whatever
each service differs on. Land Development Tax is the first built on it;
Acquisition & Requisition, Lease & Settlement, Land Administration, Revenue
Cases, and Land Information Bank still have no screen. Mutation (e-Namjari)
predates this model and keeps its own table rather than folding in — see the
`ServiceApplication` doc comment in `@plotguard/rules`.

`land-tax` shows how a service sits on that foundation: it computes each
holding's bill with `assessLandTax()` and records payment as a
ServiceApplication, so tracking and audit come for free. Two things about it
are deliberate. **Rates are not in the code** — they live on the `Policy`
singleton, because statutory rates change by finance act and vary by
district, so the rule takes them as input. And **the amount is never
accepted from the client**: `POST /land-tax/pay` carries only which holding
and which method, and recomputes what is owed server-side.

## What's still a stand-in

- **Auth.** `src/auth/dev-current-user.ts` maps the `x-plotguard-role`
  header to a fixed demo user per role — the same mechanism the mock uses.
  It's isolated behind one function (`currentUserId(req)`) on purpose, so
  swapping it for real JWT-derived identity later is a one-file change, not
  a rewrite of every controller that calls it.
- **`passwordHash`** exists on the `User` model for when real auth lands,
  but is never populated and is globally excluded from every response via
  Prisma's `omit` in `PrismaService` — see the comment there before adding
  a query that needs it.

## Testing

`*.test.ts` next to what they test — the same convention as
`packages/rules` (there is one convention in this monorepo, not one per
workspace). Two kinds:

- **Pure-function tests** (`audit-hash.test.ts`, `dispute-audience.test.ts`,
  `pagination.test.ts`) — no DB, no Nest, just inputs and outputs.
- **Contract tests** (`error-contract.test.ts`) — boot a real Nest app
  in-process and assert on the HTTP response, pinning the error envelope
  shape the frontend's `lib/api-client.ts` parses.

Nothing here spins up Postgres. Endpoints that touch the database are
verified by hand against the local container as they're built — real gaps
that surfaced this way (a Prisma enum silently not matching its `@map`
value, `main.ts` never loading `.env`, `passwordHash` leaking into
responses) would not have shown up in a mocked-DB unit test, which is why
this hasn't been automated away yet. A DB-backed contract-test harness is
open debt, not an oversight — flagged rather than built speculatively.
