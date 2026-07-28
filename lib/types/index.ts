/**
 * PlotGuard domain model — re-exported from the shared package.
 *
 * The types themselves now live in `@plotguard/rules`, next to the rules that
 * operate on them, so the backend consumes one package rather than copying a
 * contract. This barrel stays because `@/lib/types` is how the whole app spells
 * it, and an import path is not worth churning across fifty files to say the
 * same thing.
 *
 * New code may import from either; they are the same declarations.
 */
export type * from "@plotguard/rules/types";
export { ROLES } from "@plotguard/rules/types";
