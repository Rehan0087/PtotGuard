import { describe, expect, it } from "vitest";
import { assessLandTax, type LandTaxInput, type LandTaxRates } from "./land-tax";

const RATES: LandTaxRates = {
  perDecimalByLandUse: {
    agricultural: 2,
    residential: 10,
    commercial: 25,
    industrial: 30,
    mixed: 15,
    vacant: 5,
  },
  agriculturalExemptionDecimals: 825, // 25 bigha
  arrearSurchargePercent: 10,
  maxArrearYears: 3,
};

function input(over: Partial<LandTaxInput> = {}): LandTaxInput {
  return {
    area: { value: 100, unit: "decimal" },
    landUse: "residential",
    assessmentYear: 2026,
    paidThroughYear: 2025,
    liableFromYear: 2020,
    ...over,
  };
}

describe("assessLandTax — exemption", () => {
  it("exempts a smallholder agricultural plot entirely", () => {
    // Relief is by holding size, and it clears the whole ledger — an exempt
    // holding must not carry arrears a later exemption would have to unwind.
    const result = assessLandTax(
      input({ landUse: "agricultural", area: { value: 82, unit: "decimal" }, paidThroughYear: null }),
      RATES,
    );
    expect(result.exemption).toEqual({
      code: "smallholder-agricultural",
      thresholdDecimals: 825,
    });
    expect(result.total).toBe(0);
    expect(result.arrears).toBe(0);
    expect(result.years).toEqual([]);
  });

  it("taxes agricultural land above the threshold", () => {
    const result = assessLandTax(
      input({ landUse: "agricultural", area: { value: 826, unit: "decimal" } }),
      RATES,
    );
    expect(result.exemption).toBeNull();
    expect(result.total).toBe(1652); // 826 × 2
  });

  it("treats the threshold itself as exempt", () => {
    // "Up to 25 bigha" includes 25 bigha — an off-by-one here bills the
    // exact-threshold smallholder the relief is aimed at.
    const result = assessLandTax(
      input({ landUse: "agricultural", area: { value: 25, unit: "bigha" } }),
      RATES,
    );
    expect(result.exemption?.code).toBe("smallholder-agricultural");
  });

  it("reports a zero rate as an exemption, not an empty bill", () => {
    const rates: LandTaxRates = {
      ...RATES,
      perDecimalByLandUse: { ...RATES.perDecimalByLandUse, vacant: 0 },
    };
    const result = assessLandTax(input({ landUse: "vacant" }), rates);
    expect(result.exemption).toEqual({ code: "zero-rated", landUse: "vacant" });
    expect(result.total).toBe(0);
  });
});

describe("assessLandTax — the current year", () => {
  it("charges area × rate when everything prior is settled", () => {
    const result = assessLandTax(input(), RATES);
    expect(result.years).toHaveLength(1);
    expect(result.currentYearDue).toBe(1000); // 100 decimals × 10
    expect(result.arrears).toBe(0);
    expect(result.total).toBe(1000);
  });

  it("never surcharges the year being billed", () => {
    // The current year is not late; only prior unpaid years carry a penalty.
    const result = assessLandTax(input(), RATES);
    expect(result.years[0]).toMatchObject({ year: 2026, surcharge: 0, isArrear: false });
  });

  it("converts the area before applying the rate", () => {
    // A bill quoted per decimal against a bigha figure would be 33× wrong.
    const result = assessLandTax(input({ area: { value: 1, unit: "bigha" } }), RATES);
    expect(result.decimals).toBe(33);
    expect(result.total).toBe(330);
  });
});

describe("assessLandTax — arrears", () => {
  it("bills every unpaid year since the last payment", () => {
    const result = assessLandTax(input({ paidThroughYear: 2023 }), RATES);
    expect(result.years.map((y) => y.year)).toEqual([2024, 2025, 2026]);
  });

  it("surcharges each arrear year by how late it is", () => {
    const result = assessLandTax(input({ paidThroughYear: 2023 }), RATES);
    // 2024 is two years late, 2025 one, 2026 current — 10% of 1000 per year.
    expect(result.years.map((y) => y.surcharge)).toEqual([200, 100, 0]);
    expect(result.arrears).toBe(2300); // (1000+200) + (1000+100)
    expect(result.currentYearDue).toBe(1000);
    expect(result.total).toBe(3300);
  });

  it("runs from the liable year when nothing was ever paid", () => {
    const result = assessLandTax(
      input({ paidThroughYear: null, liableFromYear: 2024 }),
      RATES,
    );
    expect(result.years.map((y) => y.year)).toEqual([2024, 2025, 2026]);
  });

  it("does not bill years before the holding was liable", () => {
    // A plot registered in 2024 owes nothing for 2020 — otherwise every new
    // registration arrives pre-loaded with arrears it could not have incurred.
    const result = assessLandTax(
      input({ paidThroughYear: null, liableFromYear: 2024, assessmentYear: 2026 }),
      RATES,
    );
    expect(result.years[0].year).toBe(2024);
  });

  it("does not bill pre-liability years when the payment record predates liability", () => {
    // A plot re-registered after a partition can carry a payment record older
    // than its own liability. Without a floor at liableFromYear the ledger
    // reaches back past the date the holding existed and invents arrears.
    const result = assessLandTax(
      input({ paidThroughYear: 2020, liableFromYear: 2024, assessmentYear: 2026 }),
      RATES,
    );
    expect(result.years.map((y) => y.year)).toEqual([2024, 2025, 2026]);
  });

  it("bills no further back than the recovery window", () => {
    // A plot on the register since 1990 must not present a thirty-seven-line
    // bill: recovery is bounded, and an unbounded ledger is both wrong in
    // practice and unreadable to the person paying it.
    const result = assessLandTax(
      input({ paidThroughYear: null, liableFromYear: 1990, assessmentYear: 2026 }),
      RATES,
    );
    expect(result.years.map((y) => y.year)).toEqual([2023, 2024, 2025, 2026]);
  });

  it("caps the surcharge along with the window", () => {
    // Surcharge accrues per year late, so bounding the window is what keeps a
    // penalty from growing past the tax it penalises.
    const result = assessLandTax(
      input({ paidThroughYear: null, liableFromYear: 1990, assessmentYear: 2026 }),
      RATES,
    );
    const maxSurcharge = Math.max(...result.years.map((y) => y.surcharge));
    expect(maxSurcharge).toBe(300); // 3 years late x 10% of 1000
  });

  it("bills nothing extra when already paid through the assessment year", () => {
    const result = assessLandTax(input({ paidThroughYear: 2026 }), RATES);
    expect(result.years).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("ignores a payment recorded beyond the assessment year", () => {
    // Paid in advance: still nothing due, and no negative ledger.
    const result = assessLandTax(input({ paidThroughYear: 2030 }), RATES);
    expect(result.years).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("totals exactly what its own lines say", () => {
    // A bill whose printed lines don't add up to its printed total is one
    // nobody can pay confidently. Fractional area is the case that exposes it.
    const result = assessLandTax(
      input({ area: { value: 33.33, unit: "decimal" }, paidThroughYear: 2022 }),
      RATES,
    );
    const lineSum = result.years.reduce((a, y) => a + y.due, 0);
    expect(result.total).toBe(lineSum);
    expect(result.arrears + result.currentYearDue).toBe(result.total);
    for (const y of result.years) expect(y.assessed + y.surcharge).toBe(y.due);
  });

  it("bills in whole taka throughout", () => {
    // The payment record stores an integer and the screen renders whole taka,
    // so a fractional figure anywhere here is one the citizen is never shown
    // and never charged — three numbers that must not be allowed to differ.
    const result = assessLandTax(
      // 8.25 decimals at 10/decimal = 82.5, and a 10% surcharge on top.
      input({ area: { value: 5, unit: "katha" }, paidThroughYear: 2023 }),
      RATES,
    );
    for (const y of result.years) {
      expect(Number.isInteger(y.assessed)).toBe(true);
      expect(Number.isInteger(y.surcharge)).toBe(true);
      expect(Number.isInteger(y.due)).toBe(true);
    }
    expect(Number.isInteger(result.arrears)).toBe(true);
    expect(Number.isInteger(result.total)).toBe(true);
  });
});
