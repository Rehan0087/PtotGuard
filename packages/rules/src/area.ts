/**
 * Land measure conversion.
 *
 * Bangladesh records land in decimal (shotangsho), katha, and bigha alongside
 * the metric and imperial units, and a holding's area decides what it is taxed.
 * Anything that compares or totals areas has to bring them to one unit first,
 * so that conversion lives here once with tests rather than inline at each
 * call site with a different rounding.
 *
 * Decimal is the base: it is the unit Bangladeshi land tax is assessed in, and
 * the one the records themselves most often carry.
 */
import type { Area, AreaUnit } from "./types";

/**
 * Decimals per unit. These are fixed conversions, not policy — 1 acre is 100
 * decimals everywhere. The bigha/katha figures are the Bangladesh standard
 * (1 bigha = 33 decimals, 20 katha = 1 bigha); note that bigha differs across
 * South Asia, so this table is specific to the jurisdiction this system serves.
 */
const DECIMALS_PER_UNIT: Record<AreaUnit, number> = {
  decimal: 1,
  acre: 100,
  bigha: 33,
  katha: 1.65,
  sqm: 1 / 40.4686,
  sqft: 1 / 435.6,
};

/** An area in decimals (shotangsho), the unit tax is assessed in. */
export function toDecimals(area: Area): number {
  return area.value * DECIMALS_PER_UNIT[area.unit];
}

export function convertArea(area: Area, to: AreaUnit): Area {
  return { value: toDecimals(area) / DECIMALS_PER_UNIT[to], unit: to };
}
