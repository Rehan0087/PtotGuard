# Final mutation review fix report

## Findings addressed

- Citizen list/detail reads now derive identity from the active database actor,
  force citizen list predicates to `requestedById`, reject cross-applicant
  details, and reject unsupported roles in NestJS and MSW.
- Verification completion now validates the active recipient and every
  referenced document inside the transaction. Shared rules reject missing,
  foreign, parcel-mismatched, owner-only, and wrong-type references; MSW uses
  the same rule and response fields.
- Mutation detail/API/MSW now expose verification starter/verifier,
  jurisdiction, objection total/unresolved/status, and ordinary gate holds;
  the existing dialog renders those values.
- Mutation cards now use a sibling native full-card overlay button, preserving
  click/Enter/Space activation without nesting actions under a button ancestor.
- Approved `m-1180` now resolves to `Iqbal Enterprise` in Prisma and MSW,
  including a closed prior ownership row and mutation-linked current row; the
  later `m-1220` source-owner snapshot matches.

## Fresh evidence

- `pnpm.cmd --filter @plotguard/rules test`: 12 files, 317 tests passed.
- `pnpm.cmd --filter @plotguard/api test`: 7 files, 143 tests passed.
- Mutation/detail/MSW/navigation contracts: 15 tests passed.
- Focused ESLint over changed mutation/API/rules/MSW/seed files: exit 0.
- `git diff --check`: exit 0.
- API typecheck still reports only the pre-existing disputes-controller
  `filer` diagnostics; frontend typecheck still has baseline dictionary errors.
  No changed mutation files emitted diagnostics in the filtered checks.
- Browser/PostgreSQL checks remain unavailable in this environment.

## Commit

The scoped changes and both review reports are committed as:
`fix: close final mutation review findings`.
