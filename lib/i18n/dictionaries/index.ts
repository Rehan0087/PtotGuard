import type { Locale } from "../config";
import { en, type Dictionary } from "./en";
import { bn } from "./bn";

const DICTIONARIES: Record<Locale, Dictionary> = { en, bn };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export { en, bn };
export type { Dictionary };
