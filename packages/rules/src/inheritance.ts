/**
 * Inheritance share calculators — pure functions, no I/O.
 *
 * This is deliberately framework-agnostic: the mock API's /inheritance/calculate
 * uses it now, and the same file is the natural seed for the shared package the
 * real NestJS backend would consume. It's also the easiest thing in the system to
 * unit-test properly.
 *
 * Both methods are SIMPLIFIED to the common heir set {spouse, parents, sons,
 * daughters} and note their limitations — not a complete legal engine.
 */
import type {
  InheritanceInput,
  InheritanceNote,
  InheritanceResult,
  HeirShare,
  Heir,
  HeirRelation,
} from "./types";

function count(heirs: Heir[], rel: HeirRelation): number {
  return heirs.filter((h) => h.relation === rel).reduce((s, h) => s + h.count, 0);
}

/** Best rational approximation via continued fractions — exact for clean shares. */
function toFraction(x: number, maxDen = 10000): string {
  if (x <= 0) return "0";
  let a = Math.floor(x);
  let h1 = 1,
    h0 = 0,
    k1 = 0,
    k0 = 1,
    b = x;
  do {
    a = Math.floor(b);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1;
    h1 = h2;
    k0 = k1;
    k1 = k2;
    b = 1 / (b - a);
  } while (Math.abs(x - h1 / k1) > 1e-9 && isFinite(b));
  return `${h1}/${k1}`;
}

function build(
  method: InheritanceResult["method"],
  totals: Partial<Record<HeirRelation, number>>,
  heirs: Heir[],
  estateValue: number | undefined,
  notes: InheritanceNote[],
): InheritanceResult {
  const shares: HeirShare[] = [];
  for (const rel of Object.keys(totals) as HeirRelation[]) {
    const totalShare = totals[rel] ?? 0;
    if (totalShare <= 1e-9) continue;
    shares.push({
      relation: rel,
      count: count(heirs, rel),
      totalShare,
      fraction: toFraction(totalShare),
      amount: estateValue != null ? Math.round(totalShare * estateValue) : undefined,
    });
  }
  return { method, shares, notes };
}

function faraiz(heirs: Heir[], estateValue?: number): InheritanceResult {
  const notes: InheritanceNote[] = ["faraiz-scope", "faraiz-omissions"];
  const c = (r: HeirRelation) => count(heirs, r);
  const sons = c("son");
  const daughters = c("daughter");
  const hasChildren = sons + daughters > 0;
  const totals: Partial<Record<HeirRelation, number>> = {};
  let remaining = 1;

  if (c("husband")) {
    const s = hasChildren ? 1 / 4 : 1 / 2;
    totals.husband = s;
    remaining -= s;
  }
  if (c("wife")) {
    const s = hasChildren ? 1 / 8 : 1 / 4;
    totals.wife = s;
    remaining -= s;
  }
  if (c("mother")) {
    const s = hasChildren ? 1 / 6 : 1 / 3;
    totals.mother = s;
    remaining -= s;
  }
  if (c("father") && hasChildren) {
    totals.father = 1 / 6;
    remaining -= 1 / 6;
  }

  if (sons > 0) {
    // Residuary: sons and daughters split 2:1.
    const parts = sons * 2 + daughters;
    totals.son = (remaining * (sons * 2)) / parts;
    if (daughters > 0) totals.daughter = (remaining * daughters) / parts;
    remaining = 0;
  } else if (daughters > 0) {
    const fixed = daughters === 1 ? 1 / 2 : 2 / 3;
    totals.daughter = Math.min(fixed, remaining);
    remaining -= totals.daughter;
    if (c("father")) {
      totals.father = (totals.father ?? 0) + remaining;
      remaining = 0;
    }
  } else if (c("father")) {
    // No children — father takes the residue.
    totals.father = (totals.father ?? 0) + remaining;
    remaining = 0;
  }

  if (remaining > 1e-9) {
    notes.push("faraiz-residue");
  }
  return build("faraiz", totals, heirs, estateValue, notes);
}

function hindu(heirs: Heir[], estateValue?: number): InheritanceResult {
  const notes: InheritanceNote[] = ["hindu-scope", "hindu-omissions"];
  const totals: Partial<Record<HeirRelation, number>> = {};
  const relations: HeirRelation[] = ["husband", "wife", "mother", "son", "daughter"];
  const heads = relations.reduce((sum, r) => sum + count(heirs, r), 0);
  if (heads === 0) return build("hindu", totals, heirs, estateValue, notes);
  for (const rel of relations) {
    const c = count(heirs, rel);
    if (c > 0) totals[rel] = c / heads;
  }
  return build("hindu", totals, heirs, estateValue, notes);
}

export function calcInheritance(input: InheritanceInput): InheritanceResult {
  return input.method === "faraiz"
    ? faraiz(input.heirs, input.estateValue)
    : hindu(input.heirs, input.estateValue);
}
