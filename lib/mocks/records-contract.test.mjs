import assert from "node:assert/strict";
import test from "node:test";

let filterLandOfficeRecords;
try {
  ({ filterLandOfficeRecords } = await import("./records-contract.mjs"));
} catch {
  // The assertions below record the missing preview contract as test failures.
}

const jurisdictions = [
  { id: "j-root", parentId: null },
  { id: "j-local", parentId: "j-root" },
  { id: "j-mouza", parentId: "j-local" },
  { id: "j-outside", parentId: "j-root" },
];
const parcels = [
  { id: "dag", jurisdictionId: "j-mouza", registryStatus: "verified", dagNo: "CS-142", khatianNo: "512", title: "Paddy", ownerName: "Ayesha", ulpin: "ILR-ONE" },
  { id: "owner", jurisdictionId: "j-local", registryStatus: "pending", dagNo: "RS-88", khatianNo: "217", title: "Homestead", ownerName: "Karim", ulpin: "ILR-TWO" },
  { id: "outside", jurisdictionId: "j-outside", registryStatus: "verified", dagNo: "CS-999", khatianNo: "999", title: "Outside", ownerName: "Ayesha", ulpin: "ILR-THREE" },
];
const actor = { id: "officer", role: "land-office", status: "active", jurisdictionId: "j-local" };

test("preview record list scopes officers to their jurisdiction and descendants", () => {
  assert.equal(typeof filterLandOfficeRecords, "function");
  assert.deepEqual(
    filterLandOfficeRecords({ actor, jurisdictions, parcels }).map((item) => item.id),
    ["dag", "owner"],
  );
});

test("preview record list composes status with dag, khatian, title, and owner search", () => {
  for (const [query, expectedId] of [
    ["cs-142", "dag"],
    ["512", "dag"],
    ["paddy", "dag"],
    ["ayesha", "dag"],
  ]) {
    assert.deepEqual(
      filterLandOfficeRecords({ actor, jurisdictions, parcels, q: query, status: "verified" })
        .map((item) => item.id),
      [expectedId],
    );
  }
});

test("preview record list rejects inactive or non-office actors", () => {
  for (const invalidActor of [
    { ...actor, role: "citizen" },
    { ...actor, status: "suspended" },
  ]) {
    assert.throws(
      () => filterLandOfficeRecords({ actor: invalidActor, jurisdictions, parcels }),
      (error) => error?.code === "forbidden",
    );
  }
});
