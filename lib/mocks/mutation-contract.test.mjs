import assert from "node:assert/strict";
import test from "node:test";

let filterMutationReads;
try {
  ({ filterMutationReads } = await import("./mutation-contract.mjs"));
} catch {
  // The assertion records the missing MSW contract implementation.
}

const mutations = [
  { id: "mine", requestedById: "citizen", assignedOfficerId: "officer", parcelId: "p-local", status: "submitted" },
  { id: "foreign", requestedById: "other", assignedOfficerId: "officer", parcelId: "p-local", status: "submitted" },
  { id: "outside", requestedById: "other", assignedOfficerId: null, parcelId: "p-outside", status: "approved" },
];
const parcels = [
  { id: "p-local", jurisdictionId: "j-local" },
  { id: "p-outside", jurisdictionId: "j-outside" },
];

test("MSW mutation reads force citizens to their own rows for every scope", () => {
  assert.equal(typeof filterMutationReads, "function");
  const actor = { id: "citizen", role: "citizen", status: "active" };
  for (const scope of [null, "mine", "assigned", "jurisdiction", "hostile"]) {
    assert.deepEqual(
      filterMutationReads({ actor, mutations, parcels, coveredJurisdictionIds: new Set(), scope })
        .map((item) => item.id),
      ["mine"],
      String(scope),
    );
  }
});

test("MSW mutation reads preserve officer jurisdiction and assignment filters", () => {
  const actor = { id: "officer", role: "land-office", status: "active" };
  assert.deepEqual(
    filterMutationReads({ actor, mutations, parcels, coveredJurisdictionIds: new Set(["j-local"]), scope: "assigned" })
      .map((item) => item.id),
    ["mine", "foreign"],
  );
});

test("MSW mutation reads forbid unsupported and inactive actors", () => {
  for (const actor of [
    { id: "admin", role: "admin", status: "active" },
    { id: "citizen", role: "citizen", status: "suspended" },
  ]) {
    assert.throws(
      () => filterMutationReads({ actor, mutations, parcels, coveredJurisdictionIds: new Set(), scope: null }),
      (error) => error?.code === "forbidden",
    );
  }
});
