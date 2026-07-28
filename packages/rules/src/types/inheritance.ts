/**
 * Inheritance (succession share) calculation. Pure input/output — no I/O — so
 * this is the same shape the backend's Faraiz + Hindu-succession calculators use,
 * and the ideal candidate for a shared, well-unit-tested package.
 */

export type SuccessionMethod = "faraiz" | "hindu";

export type HeirRelation =
  | "husband"
  | "wife"
  | "son"
  | "daughter"
  | "father"
  | "mother";

export interface Heir {
  relation: HeirRelation;
  count: number;
}

export interface InheritanceInput {
  method: SuccessionMethod;
  /** Optional monetary estate, so results can be shown as amounts too. */
  estateValue?: number;
  heirs: Heir[];
}

export interface HeirShare {
  relation: HeirRelation;
  count: number;
  /** Fraction of the whole estate going to this heir group (0..1). */
  totalShare: number;
  /** Human fraction label, e.g. "1/8". */
  fraction: string;
  /** Present only when estateValue was supplied. */
  amount?: number;
}

/**
 * Caveats on a calculation, as codes. Both methods here are simplified, and
 * saying so is part of the result — but the sentence that says it belongs to the
 * UI (`t.inheritance.notes`), so the calculator stays language-free.
 */
export type InheritanceNote =
  | "faraiz-scope"
  | "faraiz-omissions"
  | "faraiz-residue"
  | "hindu-scope"
  | "hindu-omissions";

export interface InheritanceResult {
  method: SuccessionMethod;
  shares: HeirShare[];
  notes: InheritanceNote[];
}
