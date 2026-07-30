# PlotGuard

A civic platform for secure land records, ownership mutations, dispute resolution, and
field surveys. Five role-based portals — **Citizen**, **Land Office**, **Field Agent**,
**Mediator**, and **Administrator** — over one shared record system.

> **Status: frontend done, backend underway.** The UI (this repo's root) is built against a
> mock API (MSW) matching the **frozen Core API spec** exactly. `apps/api` is a real
> NestJS + Postgres implementation of that same spec, growing endpoint by endpoint — see its
> [status table](apps/api/README.md#endpoint-status). Every `GET` is done; writes are landing
> gate-by-gate. Swapping the mock for it is a config change, not a rewrite, for whatever part
> is already live (see [Mock → real backend](#mock--real-backend)).
>
> **Setting:** Cumilla District, Bangladesh — dag/khatian records, upazila/mouza hierarchy,
> namjari (mutation), Faraiz + Hindu succession, BDT.
>
> **Languages:** the whole UI is bilingual — **English** and **বাংলা** — switchable from the
> top bar (see [Languages](#languages)).

---

## Getting started

Requires Node.js ≥ 20 and [pnpm](https://pnpm.io) (via `corepack enable`).

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. The app starts on the **Citizen** portal; use the
**"Preview as"** switcher in the top bar to jump between all five portals (see
[Dev role switcher](#dev-role-switcher)).

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests for the rule modules (Vitest) |
| `pnpm test:watch` | The same, in watch mode |
| `pnpm exec tsc --noEmit` | Type-check |

---

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (Base UI primitives) — the "Cadastre" design system
- **TanStack Query** for all data fetching
- **MSW** (Mock Service Worker) as the stand-in API
- **Zustand** for small client state (active role)
- **React Hook Form + Zod** for forms (wired; used as screens are built)
- **date-fns** for formatting
- **English + বাংলা** throughout, from typed dictionaries — no i18n library

---

## Project structure

```
app/
  (app)/               # Authenticated shell — sidebar + topbar wrap every screen
    dashboard/         # Citizen dashboard (built)
    search|documents|disputes|inheritance/   # Citizen
    records|mutations|ocr-queue|fraud-review|agents/   # Land Office
    visits/            # Field Agent
    cases/             # Mediator
    users|jurisdictions|policies/   # Admin
    parcels/[id]/      # Parcel detail (built)
    disputes/[id]/     # Dispute detail + timeline (built)
  page.tsx             # Redirects to the active role's home
  layout.tsx           # Root: fonts, theme init, providers
components/
  ui/                  # shadcn/ui primitives
  shell/               # App shell: sidebar, topbar, role/language switchers, menus
  *.tsx                # Design-system pieces (StatusBadge, ParcelCard, …)
hooks/
  queries.ts           # All TanStack Query hooks — the data API for screens
  use-debounced-value.ts  # Keeps keystroke-driven queries off every keypress
  use-theme.ts         # Tiny SSR-safe light/dark theme
apps/
  api/                 # ★ @plotguard/api — the real backend (see apps/api/README.md)
    src/
      <resource>/      # One folder per REST resource: controller + module (+ dto, +
                        # a shared helper when another resource reuses its logic)
      common/          # Error envelope + pagination — every controller's shared floor
      prisma/          # The one Prisma client, connected once at boot
    prisma/
      schema.prisma    # The DB schema — one table per entity with independent identity
      seed.ts          # Ports lib/mocks/data.ts row for row, so mock and real API agree
packages/
  rules/               # ★ @plotguard/rules — the shared contract (see below)
    src/
      types/           # The domain model — single source of truth
      inheritance.ts   # Pure Faraiz + Hindu succession calc
      mutations.ts     # Pure namjari approval gate (objection window + objections)
      ocr.ts           # Pure extraction gate (required fields + register mismatch)
      field-capture.ts # Pure survey filing gate (evidence required per purpose)
      hearings.ts      # Pure ruling gate (a party never heard is never ruled against)
      assignment.ts    # Pure survey-assignment rules (jurisdiction tree + agent load)
      jurisdictions.ts # Pure hierarchy rules (level ladder, cycles, referential deletes)
      *.test.ts        # The specification — 191 tests, next to what they specify
lib/
  types/               # Re-export of @plotguard/rules/types, so `@/lib/types` still works
  i18n/                # ★ Every user-facing string — en + bn dictionaries, hooks
  mocks/               # MSW handlers (the frozen API contract) + seed data + audit-chain
  api-client.ts        # The one fetch wrapper (mock ↔ real swap point)
  status.ts            # Domain status → color tone (labels live in the dictionaries)
  format.ts            # Locale-aware date / area / money / coordinate formatting
  nav.ts               # Per-role navigation config
store/
  session.ts           # Active role (Zustand, persisted)
```

**How the three pieces fit together, if you're new here:** `packages/rules` is imported by
*both* of the other two — it's the one place a domain rule (a share of an estate, a filing
gate, a deletion check) is written down, so the frontend and the backend can never quietly
disagree about what one means. The root `app/`/`components/`/`lib/` tree is the Next.js
frontend, and today it talks to `lib/mocks/handlers.ts`, an in-browser mock of the API —
not `apps/api` yet, even though that backend is real and growing. Point it there by setting
`NEXT_PUBLIC_API_MOCKING=disabled`; see [Mock → real backend](#mock--real-backend). If a
question is about *what a rule allows*, look in `packages/rules`. If it's about *how a
screen behaves*, look in `app/`. If it's about *what the server actually enforces*, look in
`apps/api` — and start with [`apps/api/README.md`](apps/api/README.md), not this file.

---

## Architecture

**Data flow:** screen → `hooks/queries.ts` (TanStack Query) → `lib/api-client.ts` →
MSW handler (`lib/mocks/handlers.ts`) → seed data (`lib/mocks/data.ts`). Once
`NEXT_PUBLIC_API_MOCKING=disabled`, the last two steps are `apps/api`'s controllers and
Postgres instead — same shapes, same rules, real persistence.

- **`@plotguard/rules/types` is the contract.** Every mock response and every eventual backend DTO
  conforms to these interfaces. Start here when adding a feature.
- **`lib/api-client.ts` is the only place that talks to the network.** It attaches the
  active role as a header (stand-in for auth) and is the single swap point for the real API.
- **`hooks/queries.ts` is the data API screens use.** Role is part of every query key, so
  switching roles refetches automatically.
- **`lib/i18n/dictionaries/` is the string contract.** No user-facing text is written inline in
  a component; `en.ts` defines the shape and `bn.ts` must satisfy it (see [Languages](#languages)).

### `@plotguard/rules` — the shared contract

The domain model and every pure rule live in `packages/rules`, a workspace package the frontend
consumes today and **the backend is meant to consume rather than reimplement**. Nothing in it
does I/O, touches a framework, or contains a user-facing string: rules return codes plus the
values their sentence needs, so the same check explains itself per locale in the client and is
enforced verbatim on the server.

It ships TypeScript source rather than a build artifact, so both sides compile the same files and
neither can drift onto a stale `dist` — Next is told to transpile it via `transpilePackages`. A
consumer that wants compiled output has `pnpm --filter @plotguard/rules build`, which emits JS
plus declarations to `dist`.

`@/lib/types` still resolves: it is now a re-export of `@plotguard/rules/types`, because an
import path is not worth churning across fifty files to say the same thing.

Prose in a README is not a specification you can hand someone, so the rules are pinned by tests
that travel with the package:

```bash
pnpm test
```

`packages/rules/src/*.test.ts`, run by Vitest against the default node environment — no DOM, no
React, no fixtures beyond a builder per record type. **All seven modules are covered**, 191
tests, and `pnpm test` at the repo root runs them. They are
written as statements about the domain ("counts attendance across sittings, not within one", "a
son takes twice a daughter's portion", "a standing objection outranks a closed window") so that a
reimplementation can be checked against them, and so a change in behaviour has to be argued for
rather than merely committed.

Faraiz has the most coverage, because it divides land: every worked estate asserts that the
shares sum to the whole, and the one combination the simplified heir set cannot place is
asserted to *report* its residue rather than quietly lose it.

Two guards in `jurisdictions.ts` are unreachable by construction rather than merely
untested, and the tests say so instead of implying coverage: every node carries exactly one
`parentId`, so a node inside a cycle can never also have a root ancestor. `buildTree`'s `visited`
filter and `reviewDraft`'s cycle branch are both defence in depth for data that is *already*
malformed, and the tests that reach them supply exactly that.

### Mock → real backend

**The backend exists now** — `apps/api`, a NestJS + Postgres app implementing this same
spec. It's not fully caught up to the mock yet; see
[its endpoint status table](apps/api/README.md#endpoint-status) for exactly what's real
today versus still mock-only. To point the frontend at it instead of the mock:

1. `NEXT_PUBLIC_API_BASE=http://localhost:3001/api` and `NEXT_PUBLIC_API_MOCKING=disabled`.
2. Real auth doesn't exist yet either — `apps/api` honors the same `x-plotguard-role` header
   the mock does, so nothing else changes for now. See apps/api's README for the plan there.

Nothing in the screens or hooks changes either way, as long as whichever backend is live
honors the shapes in `lib/types/` (`@plotguard/rules/types`, really — see below).

### API surface

`lib/mocks/handlers.ts` implements the frozen spec — this file *is* the contract
`apps/api` builds against, endpoint for endpoint. Endpoint groups: `auth`
(`/auth/login`, `/refresh`, `/me`), `parcels` (+`/neighbours`, `/history`, dag/khatian/bbox
search), `documents` (+`/reprocess`, `PATCH /:id/decision`, `PATCH /:id/fields`), `mutations`
(`PATCH /:id/decision`), `disputes` (`PATCH /:id/status`, `POST /:id/assign-agent`),
`field-reports` (`/assigned`, `/:id/media`, `POST /` to book a survey), `hearings`
(`PATCH /:id/ruling`), `inheritance/calculate`, and `audit` (`/:entityType/:id`, `/verify`).

Two are worth noting: `inheritance/calculate` runs the real (simplified) calculator in
`inheritance.ts`, and `audit/verify` walks a genuine SHA-256 hash chain
(`lib/mocks/audit-chain.ts`) — the same tamper-evidence guarantee `apps/api` enforces for
real, with a Postgres trigger that makes the ledger table physically append-only, not just
convention.

**The ledger is live, not a fixture.** Decisions taken in the app are appended to it as they
happen — a document or mutation decision, a dispute filed or moved, a ruling, a filed survey, a
policy change, and jurisdiction writes. `appendAudit` links each new entry to the hash already
at the tail rather than rebuilding the chain from source, because a write that recomputed the
whole ledger could quietly paper over a break — which is the one thing the chain exists to make
impossible. Verify after acting: the count goes up and the chain still reports intact.

Payload values are rendered by coercing each to a string, so **every payload is flat scalars** —
an update records `field.from` / `field.to` for the fields that actually moved, never a nested
before/after object.

**Additive to the frozen spec** (needed by screens; `apps/api` implements these as it reaches
each resource — check its status table rather than assuming from this list):

| Endpoint | Purpose |
| --- | --- |
| `PATCH /documents/:id/decision` | Officer clears (`verify`) or rejects a flagged document — fraud review queue. Mirrors the `/mutations/:id/decision` verb. |
| `GET /audit` | Full ledger for the admin audit page (the spec froze only per-entity + `/verify`). |
| `POST /jurisdictions` · `PATCH /jurisdictions/:id` · `DELETE /jurisdictions/:id` | Editing the administrative tree (the spec froze only the `GET`). `422` when the body breaks a rule in `jurisdictions.ts`, `409` when other records still point at the node. |
| `PATCH /field-reports/:id` | The agent's own edits to a survey they are carrying out — status along the ladder, notes, and filing. `status: "completed"` is the filing and `422`s with a code from `field-capture.ts` when the evidence that purpose requires is missing. |
| `PATCH /policies` | Admin edits to fees, the objection window, and the fraud threshold (the spec froze only the `GET`). |
| `POST /hearings/:id/sessions` | Recording a sitting. The ruling gate reads these, so this is the write that unblocks a decision. `422` when the summary is empty. |

Note `GET /documents?fraud=true` means *awaiting review* — it filters on
`verificationStatus === "flagged"`, so a decision removes the document from the queue.

### Dev role switcher

There is no real auth yet. The **"Preview as"** control (top bar) sets an active role in
`store/session.ts`; the api-client sends it as a header and the mock resolves it to a
canonical user per role (`CURRENT_USER_BY_ROLE` in `lib/mocks/data.ts`). Replace this with
real authentication later.

---

## Design system — "Cadastre"

Grounded in the world of land surveying and civic records, not generic govtech.

- **Color:** deep pine (land / officialdom) · surveyor's amber (`--marker`, the signature
  accent) · stamp red (flags/disputes) · warm drafting-paper neutrals. Full light + dark
  palettes as CSS variables in `app/globals.css`.
- **Type:** **Public Sans** (USWDS civic typeface) for UI · **Space Grotesk** for display ·
  **Space Mono** for parcel IDs and coordinates (`.tabular`) · **Noto Sans Bengali** for Bangla.
- **Signatures:** cadastral survey-grid underlays (`.cadastral-grid`), corner survey-marker
  ticks (`<SurveyCorners />`), GeoJSON parcel-boundary thumbnails (`<ParcelBoundary />`), and
  mono ID chips (`<IdChip />`).
- **Status colors** are semantic: every domain status maps to a tone in `lib/status.ts`,
  rendered by `<StatusBadge />`.

---

## Languages

The UI ships in **English** and **বাংলা**. The switcher sits in the top bar next to the theme
toggle; switching is a re-render, not a reload.

### How it works

`lib/i18n/` holds everything:

| File | What it is |
| --- | --- |
| `dictionaries/en.ts` | **The source of truth.** Every user-facing string, and `type Dictionary = typeof en`. |
| `dictionaries/bn.ts` | Declared `const bn: Dictionary` — so a missing or mistyped key is a **build error**, never a string that silently ships in English. |
| `provider.tsx` | `<LocaleProvider>` plus the `useT()` / `useLocale()` hooks. |
| `format.ts` | `useFmt()` — formatters already bound to the active locale. |
| `status.ts` | `useStatusMeta()` — the `{ tone, label }` maps `<StatusMetaBadge>` takes. |
| `content.ts` | `useNotificationText()` / `useDisputeEventTitle()` for system-generated records. |

A screen reads `const t = useT()` and writes `t.pages.records.colOwner`. Strings that take
variables are **functions**, not templates with placeholders — the argument list is part of the
type, so a translation can reorder or re-case its inputs and TypeScript still checks the call
site. There are no bare prepositions in the dictionary: sentences are translated whole, because
composing one from fragments works in English and falls apart in verb-final Bangla.

### Locale lives in a cookie

The root layout reads it during SSR, so the first paint is already in the right language and
`<html lang>` is correct. This is the one thing the theme's localStorage approach can't do:
a `.dark` class can be patched in before hydration, but **text can't** — it would mismatch.

Reading a cookie in the root layout makes every route server-rendered on demand (`ƒ` in the
build output). That is the intended trade: this app is a logged-in console over live records,
so there is no static shell worth keeping.

### Rules explain themselves in both languages

`mutations.ts`, `ocr.ts`, `jurisdictions.ts`, `assignment.ts` and
`inheritance.ts` used to return English sentences. They now return **codes plus the values
the sentence needs**:

```ts
// mutations.ts
hold: { code: "objection-window", days: 3 }
// the screen: t.pages.mutations.hold.objectionWindow(3)
```

This is better architecture regardless of language — the backend enforces these same rules and
can return the same codes over the wire, where an English sentence would be useless. Errors from
the mock carry the code in `ApiError.reason` for the same reason. Note that names travel as
**ids**, not names (`agentAreaId`, not `agentArea`): what a jurisdiction is called depends on
who is reading.

### What is *not* translated, and why

Chrome is translated. **Record content is not** — owner names, parcel titles, dispute
descriptions, objection reasons, field notes, and values read off a scan stay exactly as filed.
A land record says what it says; rewriting it per reader would misrepresent the file.

The line runs through system-generated text too. A notification or a timeline **headline** is
generated per reader, so it carries an optional structured `content` (`NotificationContent`,
`DisputeEventContent`) the client words per locale. A clerk's `description` on that same
timeline entry is evidence, and stays as typed.

`Jurisdiction.nameBn` is the pattern for records that genuinely carry both forms: optional,
additive, and nothing keys off it — `name` remains the one used for search, sorting, and codes.
`<JurisdictionName>` picks the right one; follow the same shape for owner names and parcel
titles when those need Bangla.

### Numbers stay readable, identifiers stay citable

In Bangla, dates, areas, money, counts and percentages render in Bengali digits with lakh/crore
grouping (`Intl` with `bn-BD` — `১২,৩৪,৫৬৭`). date-fns emits Latin digits even under its `bn`
locale, so formatted dates go through `toBengaliDigits`.

**Identifiers do not follow the reader.** Dag and khatian numbers, jurisdiction codes, case
numbers, hashes and coordinates stay Latin in both languages — they are copied, cited, and typed
into other instruments, and "CS-১৪২" would make a record uncitable.

### Fonts need no work

**Noto Sans Bengali** is appended to *every* font stack in `globals.css` rather than swapped in:

```css
--font-sans: var(--font-public-sans), var(--font-noto-bengali);
```

Font fallback is per glyph, not per element. Public Sans has no Bengali coverage, so Bengali
codepoints fall through automatically while Latin stays in Public Sans — mixed strings render
correctly in one run, with **no language detection and no wrapper class** at the call site.

One caveat: Bengali has no monospace companion, so Bangla inside `.tabular` loses the grid but
stays legible. Since identifiers are Latin, this rarely bites.

### Adding a string

1. Add it to `lib/i18n/dictionaries/en.ts` under the right `pages.*` section.
2. Run `pnpm exec tsc --noEmit` — it will fail, naming the key missing from `bn.ts`.
3. Translate it there. That failure *is* the workflow; don't work around it.

---

## Screen status

**Built and wired to data:** Citizen dashboard, **registry search** (deep-linkable, with a
cadastral result map), parcel detail (chain of title, documents, disputes), dispute detail
(tracking timeline), **dispute-filing wizard** (3-step, RHF + Zod), **inheritance calculator**
(Faraiz + Hindu — the reference form pattern), Land Office records table, **mutations queue**
(objection windows + approval gate), **OCR queue** (pipeline stages + a digitisation station),
**fraud review queue** (score meters, AI findings, clear/reject/re-run), **field-agent board**
(jurisdiction-aware assignment + roster load), Field Agent visits, Mediator cases, Admin users,
**jurisdictions** (the hierarchy editor, with referential delete guards), **audit ledger**
(live SHA-256 hash-chain verify — the demo centerpiece), and the disputes/documents lists.

**field capture** (GPS + photos + findings, behind the filing gate), **case detail** (sittings,
attendance, and the ruling gate), and **policies** (fees, objection window, fraud threshold).

Every route in `lib/nav.ts` is now built; nothing is left scaffolded.

### Registry search

`/search` has two modes over the same endpoint: **quick** (free-text `q`) and **by dag /
khatian** (the `dag` + `khatian` params, which is how people actually cite a plot). Both
compose with the registry-status filter.

State is mirrored to the URL — `/search?dag=RS&status=verified` restores the fields *and*
picks the right mode on load, so a search is shareable. The write uses
`window.history.replaceState`, not the router: no re-render, no history entries, which is why
seeding state from the URL once on mount is sufficient.

`<ParcelMap />` plots the result set on one shared cadastral frame (a single scale for both
axes, so relative position and size stay honest). Hovering a card highlights its marker and
vice versa. It's a locator, not the primary path — the card grid stays the accessible route
to a parcel.

### Mutations and the approval gate

A namjari can't be approved just because an officer clicks approve. `mutations.ts`
(`approvalGate`) is the pure rule: a **standing objection** blocks approval outright, and an
**open statutory objection window** blocks it until the window closes. Rejection stays
available in both cases — an officer can turn down a bad application without waiting out the
clock. Decided mutations expose no actions at all.

The screen renders the *reason* for a hold, not just a disabled button, and the approve action
takes an inline confirmation naming the incoming owner, since the transfer is what actually
moves the record.

Treat `approvalGate` the way you treat `inheritance.ts` — the backend must enforce the
same rule server-side; this copy exists so the UI can explain itself.

The gate returns a **code**, not a sentence (`{ code: "objections", count: 2 }`), and the screen
words it per locale. Every pure rule module works this way — see
[Rules explain themselves in both languages](#rules-explain-themselves-in-both-languages).

### The OCR queue and the extraction gate

`/ocr-queue` is the Land Office's view of digitisation. The stage tiles (**Ready to check /
Unreadable / Reading / Queued**) double as the filter, so the pipeline and the worklist are the
same control. A document leaves the queue once an officer has accepted, returned, or escalated
it — the queue holds work, not history.

`ocr.ts` (`extractionReview`) is the pure rule, and it is stricter than "did the reader
finish":

- **`REQUIRED_FIELDS`** says what each document type has to yield (a title deed needs Dag No,
  Khatian, Owner; a tax receipt needs Khatian and Amount). Anything the reader missed is keyed
  in on the card itself — that's the digitisation station, and those keystrokes are what open
  the gate. `extractionReview` takes the unsaved values so the gate reacts as you type.
- **A value that contradicts the register outranks a gap.** If the dag on the scan isn't the dag
  it was filed against, keying the rest in wouldn't make it safe — so acceptance is blocked
  outright and the card routes to fraud review instead. (Same shape as objections outranking the
  clock in `approvalGate`.)

Accepting writes the keyed fields (`PATCH /documents/:id/fields`) and then the decision. The
escalation path is `PATCH /documents/:id/decision` with `flag`, which is how the two Land Office
queues connect — an officer-escalated document carries no model score, so fraud review renders
"Not scored · flagged by an officer" rather than an empty meter reading as low risk.

Both `/fields` and the `flag` verb are additive to the frozen spec, in the same style as the
existing `/decision` verb.

### Assigning field surveys

`/agents` is the booking board: open disputes with nobody going to look at the land, the roster
and what each agent is carrying, and the visits already in flight. The roster tiles double as
the filter for the visit list.

`assignment.ts` is the pure rule set:

- **`covers()`** walks the jurisdiction tree, so a district survey officer covers every upazila
  and mouza beneath them while a mouza-level amin does not. Sending someone outside their area
  is **blocked by default** and takes an explicit tick — real offices do it when short-staffed,
  but it should be a decision, not an accident. (That's how the seeded cross-boundary visit on
  BS-205 came to exist.)
- **A suspended account can't be given work**, full stop.
- **`rankCandidates()` puts the cheapest trip first.** An agent with an open visit already booked
  on that parcel leads the list — one trip covers both jobs. After that it sorts by load.
- **`disputesNeedingSurvey()`** is what fills the board: open disputes with no live field report.
  A cancelled visit puts the job back on the board.
- **`PURPOSE_FOR_DISPUTE`** pre-selects the survey the case actually calls for (a boundary
  dispute wants a boundary survey, a fraud case wants possession verified). The officer can
  change it.

Booking posts to `POST /field-reports` with an agent and a date, which also moves the dispute to
`field-visit-scheduled` and writes a `field-visit` entry on its tracking timeline — so the case
detail screen reflects the booking without any extra call.

### Carrying out the survey

`/visits/[id]` is the other half of the booking board: what the agent does once they are
standing on the land. It moves the visit along its status ladder (assigned → en route → on
site), collects GPS points and photos, and takes the findings that the case will actually read.

`field-capture.ts` (`filingReview`) is the pure rule, and it is a rule about *evidence*:

- **`EVIDENCE_REQUIRED` is per purpose, not one blanket minimum.** A boundary survey needs two
  GPS points because a line needs two ends; a possession check needs a photograph, because what
  it establishes is what was visible. Sending an agent to measure and getting back a paragraph
  is not a survey.
- **Findings are always required.** Points and pictures without a reading of them is data
  nobody downstream can act on — the dispute timeline quotes the notes, not the coordinates.
- **A filed or cancelled report is not a draft.** It exposes no capture controls at all.

The gate returns **codes plus the counts the sentence needs** (`{ code: "need-gps", have: 1,
need: 2 }`) and the screen words them per locale, the same way `approvalGate` and
`extractionReview` do. It lists *every* blocker rather than one at a time, because an agent on
site wants the whole remaining checklist, not a repeating prompt.

Filing is `PATCH /field-reports/:id` with `status: "completed"` — additive to the frozen spec.
The mock runs `filingReview` on that request and answers `422` with the code, so the client
copy explains a refusal while the server copy is what actually refuses.

Filing also **moves the dispute back**: the booking put it in `field-visit-scheduled`, and the
survey is what it was waiting on, so it returns to `under-review` with the agent's findings on
the tracking timeline. That only happens when the visit is what held the case up — a dispute
that moved on in the meantime is left where it is.

> GPS uses the device when the browser will give it and otherwise simulates a point near the
> parcel centroid, labelled as such. The preview has no way to be standing in a field, and a
> capture screen with nothing captured isn't reviewable.

### Hearing a case, and ruling on it

`/cases` opens with **what has been referred but not yet listed** — the same board shape as
`/agents`, filled by `disputesNeedingHearing()`. Referral is the officer's decision, so it only
picks up disputes already moved to `in-mediation`; a case still under review belongs to the land
office however obviously contested it looks. Listing one takes a date and nothing else: the
parties come off the dispute rather than being retyped, because the hearing is over that record
and a name keyed in twice is a name that can differ.

The board is computed against **every** hearing, not just the signed-in mediator's — a case a
colleague has listed has been listed, and must not sit on anyone's board as pending.

`/cases/[id]` is the mediator's working surface: the sittings held so far, who was present at
each, and the ruling. Recording a sitting is the write that moves the case — a case with a
sitting on record is `in-hearing`, not merely `scheduled`, so the mediator never sets a status
by hand.

`hearings.ts` (`rulingGate`) is the pure rule, and the rule that matters is older than the
software: **a case is not decided against someone who was never heard.**

- **Attendance is aggregated across sittings, not per sitting.** A party who came to the first
  hearing and missed the second has been heard. Requiring everyone in one room would make a
  ruling hostage to whoever declines to show up last.
- **No sittings at all reports itself as such**, rather than listing every party as unheard —
  with none held, "nobody has been heard" is the same fact stated twice.
- **A decided case is not a draft.** `ruled` and `appealed` short-circuit to a single blocker
  and the screen drops the capture form entirely; listing what else is missing would imply
  there is still something to do.

The gate returns **codes plus the names the sentence needs** (`{ code: "unheard", parties:
[...] }`) and the screen words them per locale, the same way `approvalGate` and `filingReview`
do. The parties panel doubles as the read on this: each name carries Heard / Not yet heard, so
the blocker explains a state the mediator can already see.

`PATCH /hearings/:id/ruling` runs the gate server-side and answers `422` with the code, so the
client copy explains a refusal while the server copy is what actually refuses. Recording a
sitting on a decided case is refused the same way — the screen hides the form, and this is what
makes that true of the record rather than only of the UI.

**Every write moves the dispute**, the way booking a survey does (see
[Assigning field surveys](#assigning-field-surveys)). Convening a hearing lists the case as
`hearing-scheduled` and assigns the mediator; a sitting puts it `in-mediation` and writes a
`hearing-held` entry on the tracking timeline; a ruling resolves it, stores the ruling text as
the dispute's `resolution`, and writes a `ruled` entry. All skip a dispute that is already
`resolved`, `rejected`, or `withdrawn` — a decided case is not reopened by a late write.

**The parties are told.** Listing a case and ruling on it both notify everyone on the dispute
with an account — whoever filed it, plus any party matched to a user — deduped, and never the
mediator who just acted. The ruling text is deliberately *not* in the notification: it is record
content, and the case is where it is read.

### The jurisdiction tree

`/jurisdictions` edits the hierarchy everything else hangs off — parcels, users, and (through
`covers()`) who may be sent to survey what. The tree is the primary control: selecting a node
opens an inspector with what is registered under it, the edit form, and the delete gate.

`jurisdictions.ts` is the pure rule set. Three of its rules are easy to miss and each one
corrupts the tree:

- **The ladder is strict** — Division › District › Upazila › Mouza, one rung at a time. A mouza
  may not hang straight off a district, because `covers()` walks parent links and a skipped rung
  makes "covers" mean something different on each branch.
- **A move must not close a loop.** Re-parenting a node under its own descendant makes both
  unreachable. `eligibleParents()` already excludes the subtree, so the check in `reviewDraft`
  is defence in depth against data that is already malformed.
- **A level change is judged from below as well as above.** Promoting an upazila to a district
  leaves its mouzas on the wrong rung — so the *children* constrain the level just as much as
  the parent does. The form moves level and parent together, which is what makes this error
  surface on its own rather than hiding behind a parent-mismatch.

**Deletion is referential, not soft.** `deletionGate()` refuses while children, parcels, or users
still point at the node, and returns each blocker *with its fix* — the screen lists "3 users
assigned here — Reassign from the Users screen first" rather than greying out a button. Deleting
a jurisdiction out from under a parcel would leave a record nobody can place.

Codes are hierarchical (`CTG-CUM-DEB-RAJ`) and a child's code is expected to extend its parent's,
but that is a **convention, not a constraint** — it surfaces as a warning that doesn't block the
save, alongside the sibling-name and stale-descendant-prefix warnings. Uniqueness *is* enforced.

`buildTree()` returns anything the walk never reached as `unreachable` — a `parentId` pointing at
a deleted row, or a cycle. The screen renders those in their own block, because a jurisdiction
nobody can see is one nobody can fix.

Treat this module the way you treat `inheritance.ts` and `mutations.ts`: the backend must
enforce the same rules server-side. The mock already does — `handlers.ts` runs `reviewDraft` and
`deletionGate` on every write and answers `422` / `409`, so the client copy explains a refusal
while the server copy is what actually refuses.

### Async document processing

Upload (`My documents → Upload document`) models the real queue: `POST /documents` returns
immediately with `ocrStatus: "processing"`, a simulated worker in `lib/mocks/handlers.ts`
(`scheduleOcrWorker`) fills in extracted fields + a fraud score ~6s later, and pushes a
notification — the same sequence BullMQ → AI service will produce.

`useDocuments` polls every 2.5s **only while something is in flight** and stops on its own,
so no screen needs bespoke refresh logic. Seeded in-flight documents drain a few seconds
after load, so the pipeline is visible on a first visit — watch the OCR queue's stage tiles
move as they land. `POST /documents/:id/reprocess` re-queues the worker for real, so a retry
on an unreadable scan drains the same way a fresh upload does.

> **Wizard forms:** don't wrap a multi-step flow in a `<form onSubmit>` — a stray Enter or a
> re-render mid-click can submit early. Use a `<div>` and call `handleSubmit(onSubmit)` from
> the final button's `onClick` (see `disputes/new/page.tsx`). Also: with zod 4 use
> `standardSchemaResolver`, not `zodResolver`.

### Suggested split (5 people)

1. Shared kit + shell + mock data — **done**, extend as needed.
2. Citizen portal (largest surface) — dashboard, search, upload, dispute wizard all done.
3. Land Office portal — records, mutations, OCR queue, fraud review, field-agent board — **done**.
4. Field Agent + Mediator — lists, the capture screen, and the hearing/ruling flow — **done**.
5. Admin + polish — users, audit ledger, jurisdictions, and policies — **done**.

---

## Notes

- Next.js telemetry is disabled.
- In dev you may see a benign React 19 advisory about the inline theme `<script>`; it is
  stripped from production builds.
