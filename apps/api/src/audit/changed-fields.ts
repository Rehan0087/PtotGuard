import type { Prisma } from "@prisma/client";

/** A field this helper accepts — deliberately narrower than `unknown`, so its
 * result is always assignable to AuditEntry.payload without a cast at every
 * call site. Nothing audited here is ever a nested object; that's the point. */
type Scalar = string | number | boolean | null | undefined;

/**
 * Flat `field.from` / `field.to` pairs for the fields that actually changed.
 *
 * Audit payloads are stored as JSON but rendered on screen by coercing each
 * value to a string, so every entry in the ledger has to stay flat scalars —
 * nesting a before/after object would read as "[object Object]" on the audit
 * page. Recording only what moved also keeps a one-field edit from looking
 * like a rewrite of the whole record.
 */
export function changedFields<T extends Record<string, Scalar>>(
  before: T,
  after: T,
): Prisma.InputJsonObject {
  // Prisma.InputJsonObject's index signature is read-only (by design, so it
  // can't be mutated after being handed to the client) — built as a plain
  // record instead and returned as that type, since the shapes agree.
  const payload: Record<string, string | number | boolean | null> = {};
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      payload[`${key}.from`] = before[key] ?? null;
      payload[`${key}.to`] = after[key] ?? null;
    }
  }
  return payload;
}
