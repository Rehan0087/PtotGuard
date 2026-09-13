# Task 9 report — final mutation review verification

## Result

Final-review blockers were fixed and the scoped changes were committed in
`62c4176` (`fix: close final mutation review findings`).
Browser interaction and PostgreSQL restart persistence remain environmental
limitations.

## Verification matrix

| Check | Result |
| --- | --- |
| `pnpm.cmd --filter @plotguard/rules test` | 0 — 12 files, 317 tests |
| `pnpm.cmd --filter @plotguard/api test` | 0 — 7 files, 143 tests |
| Mutation/detail/MSW/navigation contracts | 0 — 15 tests |
| Focused ESLint on touched mutation files | 0 |
| `git diff --check` | 0 |
| API type diagnostics | Only pre-existing disputes-controller `filer` errors |
| Frontend type diagnostics | Only baseline dictionary errors; no changed mutation-file errors |

## Final-review evidence

- Citizen read authorization is identity-derived, applicant-scoped, active-only,
  and rejects unsupported roles in both API and MSW.
- Verification revalidates the recipient and all document references in the
  transaction; exact missing/foreign/association/type cases are covered in
  rules, API, and MSW tests.
- Detail data and the existing dialog include starter/verifier, jurisdiction,
  objection totals/unresolved/status, and ordinary gate hold explanations.
- Full-card navigation uses a sibling native overlay trigger, avoiding an
  ancestor `role="button"` while retaining keyboard activation and nested
  actions.
- Approved `m-1180` parcel ownership history and mock/Prisma data are aligned,
  including the mutation-linked current ownership record.

No browser session or PostgreSQL service was available, so those checks are not
claimed as passing.
