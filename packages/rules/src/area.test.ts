import { describe, expect, it } from "vitest";
import { convertArea, toDecimals } from "./area";
import type { AreaUnit } from "./types";

describe("toDecimals", () => {
  it("leaves decimals alone", () => {
    expect(toDecimals({ value: 82, unit: "decimal" })).toBe(82);
  });

  it("converts the Bangladesh land measures", () => {
    // The figures records are actually kept in: 1 bigha = 33 decimals,
    // 20 katha = 1 bigha. A wrong factor here misprices every tax bill.
    expect(toDecimals({ value: 1, unit: "bigha" })).toBe(33);
    expect(toDecimals({ value: 20, unit: "katha" })).toBe(33);
    expect(toDecimals({ value: 1, unit: "acre" })).toBe(100);
  });

  it("converts the metric and imperial units", () => {
    expect(toDecimals({ value: 4046.86, unit: "sqm" })).toBeCloseTo(100, 4);
    expect(toDecimals({ value: 43560, unit: "sqft" })).toBeCloseTo(100, 4);
  });

  it("covers every area unit", () => {
    // A unit with no entry converts to NaN and silently zeroes a bill.
    const all: AreaUnit[] = ["decimal", "katha", "bigha", "acre", "sqm", "sqft"];
    for (const unit of all) {
      expect(Number.isFinite(toDecimals({ value: 1, unit }))).toBe(true);
    }
  });
});

describe("convertArea", () => {
  it("round-trips through decimals", () => {
    const acres = convertArea({ value: 33, unit: "decimal" }, "bigha");
    expect(acres.value).toBeCloseTo(1, 10);
    expect(acres.unit).toBe("bigha");
  });

  it("is reversible", () => {
    const original = { value: 82, unit: "decimal" as const };
    const there = convertArea(original, "sqft");
    expect(convertArea(there, "decimal").value).toBeCloseTo(82, 10);
  });
});
