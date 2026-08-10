/**
 * @plotguard/rules — the domain model, and the rules that govern it.
 *
 * Everything here is pure: no I/O, no framework, no user-facing strings. Rules
 * return **codes plus the values their sentence needs**, never sentences, so the
 * same check can explain itself in English or Bangla in the client and be
 * enforced verbatim by the server.
 *
 * Both sides of PlotGuard are meant to consume this package rather than
 * reimplement it. The tests next to each module are the specification —
 * `pnpm --filter @plotguard/rules test`.
 */
export * from "./types";

export * from "./inheritance";
export * from "./mutations";
export * from "./ocr";
export * from "./assignment";
export * from "./jurisdictions";
export * from "./field-capture";
export * from "./hearings";
export * from "./ulpin";
export * from "./restrictions";
export * from "./area";
export * from "./land-tax";
