/**
 * Rules for the administrative hierarchy — Division › District › Upazila › Mouza.
 * Pure, and the backend has to enforce the same things server-side: this is the
 * tree `covers()` in lib/assignment.ts walks to decide whether an agent may be
 * sent to a parcel, and every parcel and user hangs off a node in it. A shared-
 * package candidate alongside lib/inheritance.ts, lib/mutations.ts, lib/ocr.ts.
 */
import type { Jurisdiction, JurisdictionLevel, Parcel, User } from "./types";

/** The ladder, top down. A node's parent sits exactly one rung above it. */
export const LEVELS: JurisdictionLevel[] = ["division", "district", "upazila", "mouza"];

const CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function parentLevelOf(level: JurisdictionLevel): JurisdictionLevel | null {
  const i = LEVELS.indexOf(level);
  return i > 0 ? LEVELS[i - 1] : null;
}

/** null at mouza — the bottom of the ladder takes no children. */
export function childLevelOf(level: JurisdictionLevel): JurisdictionLevel | null {
  const i = LEVELS.indexOf(level);
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null;
}

export function countByLevel(all: Jurisdiction[]): Record<JurisdictionLevel, number> {
  const counts = { division: 0, district: 0, upazila: 0, mouza: 0 };
  for (const j of all) counts[j.level]++;
  return counts;
}

// --- Shape -----------------------------------------------------------------

export interface JurisdictionNode {
  jurisdiction: Jurisdiction;
  depth: number;
  children: JurisdictionNode[];
}

export interface JurisdictionTree {
  roots: JurisdictionNode[];
  /**
   * Rows the walk never reached: a `parentId` pointing at a deleted node, or a
   * cycle. Broken data, but it belongs on screen rather than silently dropped —
   * a jurisdiction nobody can see is one nobody can fix.
   */
  unreachable: Jurisdiction[];
}

export function buildTree(all: Jurisdiction[]): JurisdictionTree {
  const byId = new Map(all.map((j) => [j.id, j]));
  const childrenOf = new Map<string, Jurisdiction[]>();

  for (const j of all) {
    if (!j.parentId || !byId.has(j.parentId)) continue;
    childrenOf.set(j.parentId, [...(childrenOf.get(j.parentId) ?? []), j]);
  }

  const byName = (a: Jurisdiction, b: Jurisdiction) => a.name.localeCompare(b.name);
  const visited = new Set<string>();

  function build(j: Jurisdiction, depth: number): JurisdictionNode {
    visited.add(j.id);
    // The filter is the cycle guard: a node already on the path is not a child.
    const kids = (childrenOf.get(j.id) ?? []).filter((c) => !visited.has(c.id));
    return {
      jurisdiction: j,
      depth,
      children: kids.sort(byName).map((c) => build(c, depth + 1)),
    };
  }

  const roots = all.filter((j) => !j.parentId).sort(byName).map((r) => build(r, 0));
  return { roots, unreachable: all.filter((j) => !visited.has(j.id)) };
}

/** Every node beneath `id`, at any depth. Excludes `id` itself. */
export function descendantIds(id: string, all: Jurisdiction[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const j of all) {
    if (!j.parentId) continue;
    childrenOf.set(j.parentId, [...(childrenOf.get(j.parentId) ?? []), j.id]);
  }

  const found = new Set<string>();
  const queue = [...(childrenOf.get(id) ?? [])];
  while (queue.length > 0) {
    const next = queue.pop()!;
    // Guards against a malformed parentId cycle walking forever.
    if (next === id || found.has(next)) continue;
    found.add(next);
    queue.push(...(childrenOf.get(next) ?? []));
  }
  return found;
}

/** The chain from the root down to `id`, `id` last. */
export function ancestryOf(id: string, all: Jurisdiction[]): Jurisdiction[] {
  const byId = new Map(all.map((j) => [j.id, j]));
  const chain: Jurisdiction[] = [];
  let cursor: string | null | undefined = id;
  for (let hops = 0; cursor && hops <= all.length; hops++) {
    const node: Jurisdiction | undefined = byId.get(cursor);
    if (!node) break;
    chain.unshift(node);
    cursor = node.parentId;
  }
  return chain;
}

/** The nodes that may legally parent a `level` node. */
export function eligibleParents(
  level: JurisdictionLevel,
  all: Jurisdiction[],
  /** The node being edited — it and its own subtree cannot host it. */
  excludeId?: string,
): Jurisdiction[] {
  const needs = parentLevelOf(level);
  if (!needs) return [];
  const ownSubtree = excludeId ? descendantIds(excludeId, all) : new Set<string>();
  return all
    .filter((j) => j.level === needs && j.id !== excludeId && !ownSubtree.has(j.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Codes are hierarchical, so a new child starts from its parent's prefix. */
export function suggestCode(parent: Jurisdiction | null | undefined): string {
  return parent ? `${parent.code}-` : "";
}

// --- Usage and deletion ----------------------------------------------------

export interface JurisdictionUsage {
  /** Direct children only. */
  children: number;
  /** Users assigned to exactly this node. */
  users: number;
  /** Parcels registered against exactly this node. */
  parcels: number;
  /** The same counts for this node and everything beneath it. */
  subtree: { jurisdictions: number; users: number; parcels: number };
}

export function usageOf(
  id: string,
  all: Jurisdiction[],
  users: User[],
  parcels: Parcel[],
): JurisdictionUsage {
  const below = descendantIds(id, all);
  const inSubtree = (jurisdictionId: string) => jurisdictionId === id || below.has(jurisdictionId);
  return {
    children: all.filter((j) => j.parentId === id).length,
    users: users.filter((u) => u.jurisdictionId === id).length,
    parcels: parcels.filter((p) => p.jurisdictionId === id).length,
    subtree: {
      jurisdictions: below.size,
      users: users.filter((u) => inSubtree(u.jurisdictionId)).length,
      parcels: parcels.filter((p) => inSubtree(p.jurisdictionId)).length,
    },
  };
}

/**
 * What is in the way of a delete, as a code plus its counts. The screen turns
 * each one into a noun phrase and the fix that clears it (`t.jurisdictions.blocker`);
 * the rule itself carries no English, so the backend can return the same codes.
 */
export type DeletionBlocker =
  | { code: "missing" }
  | { code: "children"; count: number; childLevel: JurisdictionLevel | null }
  | { code: "parcels"; count: number }
  | { code: "users"; count: number };

export interface DeletionGate {
  canDelete: boolean;
  blockers: DeletionBlocker[];
}

/**
 * Removal is refused while anything still points at the node — the referential
 * rule the database enforces with a foreign key, stated here so the screen can
 * name what is holding it instead of greying out a button. Deleting a
 * jurisdiction out from under a parcel would leave a record nobody can place.
 */
export function deletionGate(
  id: string,
  all: Jurisdiction[],
  users: User[],
  parcels: Parcel[],
): DeletionGate {
  const target = all.find((j) => j.id === id);
  if (!target) {
    return { canDelete: false, blockers: [{ code: "missing" }] };
  }

  const usage = usageOf(id, all, users, parcels);
  const blockers: DeletionBlocker[] = [];
  const childLevel = childLevelOf(target.level);

  if (usage.children > 0) {
    blockers.push({ code: "children", count: usage.children, childLevel });
  }
  if (usage.parcels > 0) {
    blockers.push({ code: "parcels", count: usage.parcels });
  }
  if (usage.users > 0) {
    blockers.push({ code: "users", count: usage.users });
  }

  return { canDelete: blockers.length === 0, blockers };
}

// --- Validation ------------------------------------------------------------

export interface JurisdictionDraft {
  /** Set when editing an existing node, absent when creating one. */
  id?: string;
  name: string;
  /** Optional throughout — nothing keys off it, so it carries no rules. */
  nameBn?: string;
  code: string;
  level: JurisdictionLevel;
  parentId: string | null;
}

export type JurisdictionField = "name" | "code" | "level" | "parentId";

/**
 * Why a field is rejected. Every variant carries the names and levels its
 * sentence needs, so `t.jurisdictions.error` can word it in any language —
 * including ones that order "a mouza sits under an upazila" differently.
 */
export type JurisdictionError =
  | { code: "name-required" }
  | { code: "code-required" }
  | { code: "code-pattern" }
  | { code: "code-taken"; holderName: string; holderCode: string }
  | { code: "division-has-no-parent" }
  | { code: "parent-required"; needs: JurisdictionLevel; level: JurisdictionLevel }
  | { code: "parent-missing" }
  | {
      code: "parent-wrong-level";
      level: JurisdictionLevel;
      needs: JurisdictionLevel;
      parentName: string;
      parentLevel: JurisdictionLevel;
    }
  | { code: "self-parent" }
  | { code: "cycle"; parentName: string; currentName: string | null }
  | {
      code: "children-stranded";
      count: number;
      exampleName: string;
      exampleLevel: JurisdictionLevel;
      wants: JurisdictionLevel | null;
    };

/** Conventions, flagged and never enforced. See `t.jurisdictions.warning`. */
export type JurisdictionWarning =
  | { code: "code-prefix"; parentCode: string }
  | { code: "stale-descendant-codes"; count: number; currentCode: string }
  | { code: "sibling-name"; name: string };

export interface DraftReview {
  /** A reason per field. Any entry means the draft cannot be saved. */
  errors: Partial<Record<JurisdictionField, JurisdictionError>>;
  /** Worth saying, not worth blocking — conventions rather than constraints. */
  warnings: JurisdictionWarning[];
  valid: boolean;
}

/**
 * Everything that has to hold before a jurisdiction can be written. Three of
 * these are easy to miss and all three corrupt the tree:
 *
 * - **The ladder is strict.** A mouza sits under an upazila, never straight
 *   under a district — `covers()` walks parent links and a skipped rung makes
 *   coverage mean something different at each branch.
 * - **A move must not close a loop.** Re-parenting a node under its own
 *   descendant makes both unreachable and sends a tree walk in circles.
 * - **A level change is judged from below as well as above.** Promoting an
 *   upazila to a district leaves its mouzas hanging off the wrong rung, so the
 *   children constrain the parent's level just as much as the parent does.
 */
export function reviewDraft(draft: JurisdictionDraft, all: Jurisdiction[]): DraftReview {
  const errors: DraftReview["errors"] = {};
  const warnings: JurisdictionWarning[] = [];

  const name = draft.name.trim();
  const code = draft.code.trim().toUpperCase();
  const parent = draft.parentId ? all.find((j) => j.id === draft.parentId) : null;
  const current = draft.id ? all.find((j) => j.id === draft.id) : null;

  if (!name) errors.name = { code: "name-required" };

  if (!code) {
    errors.code = { code: "code-required" };
  } else if (!CODE_PATTERN.test(code)) {
    errors.code = { code: "code-pattern" };
  } else {
    const clash = all.find((j) => j.id !== draft.id && j.code.toUpperCase() === code);
    if (clash) {
      errors.code = { code: "code-taken", holderName: clash.name, holderCode: clash.code };
    }
  }

  // Where it sits: the rung above.
  const needs = parentLevelOf(draft.level);
  if (!needs) {
    if (draft.parentId) errors.parentId = { code: "division-has-no-parent" };
  } else if (!draft.parentId) {
    errors.parentId = { code: "parent-required", needs, level: draft.level };
  } else if (!parent) {
    errors.parentId = { code: "parent-missing" };
  } else if (parent.level !== needs) {
    errors.parentId = {
      code: "parent-wrong-level",
      level: draft.level,
      needs,
      parentName: parent.name,
      parentLevel: parent.level,
    };
  } else if (draft.id) {
    if (parent.id === draft.id) {
      errors.parentId = { code: "self-parent" };
    } else if (descendantIds(draft.id, all).has(parent.id)) {
      errors.parentId = {
        code: "cycle",
        parentName: parent.name,
        currentName: current?.name ?? null,
      };
    }
  }

  // Where it sits: the rung below. Children constrain the level too.
  if (draft.id) {
    const stranded = all
      .filter((j) => j.parentId === draft.id)
      .filter((child) => parentLevelOf(child.level) !== draft.level);
    if (stranded.length > 0) {
      const example = stranded[0];
      errors.level = {
        code: "children-stranded",
        count: stranded.length,
        exampleName: example.name,
        exampleLevel: example.level,
        wants: parentLevelOf(example.level),
      };
    }
  }

  // Conventions below this line: flagged, never enforced.
  if (parent && code && !errors.code && !code.startsWith(`${parent.code.toUpperCase()}-`)) {
    warnings.push({ code: "code-prefix", parentCode: parent.code });
  }
  if (current && code && current.code.toUpperCase() !== code) {
    const stale = [...descendantIds(current.id, all)]
      .map((id) => all.find((j) => j.id === id))
      .filter((j): j is Jurisdiction => Boolean(j))
      .filter((j) => j.code.toUpperCase().startsWith(`${current.code.toUpperCase()}-`));
    if (stale.length > 0) {
      warnings.push({
        code: "stale-descendant-codes",
        count: stale.length,
        currentCode: current.code,
      });
    }
  }
  const twin = all.find(
    (j) =>
      j.id !== draft.id &&
      j.parentId === draft.parentId &&
      j.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (name && twin) {
    warnings.push({ code: "sibling-name", name: twin.name });
  }

  return { errors, warnings, valid: Object.keys(errors).length === 0 };
}
