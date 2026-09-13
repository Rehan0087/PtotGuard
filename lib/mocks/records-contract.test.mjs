import assert from "node:assert/strict";
import test from "node:test";

let filterLandOfficeRecords;
let recordAuditEvents;
try {
  ({ filterLandOfficeRecords, recordAuditEvents } = await import("./records-contract.mjs"));
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

test("preview record status and filtering come from related active mutations", () => {
  const active = filterLandOfficeRecords({
    actor,
    jurisdictions,
    parcels,
    mutations: [{ parcelId: "owner", status: "verification" }],
    status: "under-mutation",
  });
  assert.deepEqual(active.map((item) => [item.id, item.registryStatus]), [
    ["owner", "under-mutation"],
  ]);

  const rejected = filterLandOfficeRecords({
    actor,
    jurisdictions,
    parcels,
    mutations: [{ parcelId: "owner", status: "rejected" }],
    status: "under-mutation",
  });
  assert.deepEqual(rejected, []);
});

test("record audit includes parcel, mutation, dispute, and document events", () => {
  const events = [
    { id: "a-parcel", entityType: "parcel", entityId: "p-1", createdAt: "2026-01-01" },
    { id: "a-mutation", entityType: "mutation", entityId: "m-1", createdAt: "2026-01-04" },
    { id: "a-dispute", entityType: "dispute", entityId: "ds-1", createdAt: "2026-01-03" },
    { id: "a-document", entityType: "document", entityId: "d-1", createdAt: "2026-01-02" },
    { id: "a-other", entityType: "document", entityId: "d-other", createdAt: "2026-01-05" },
  ];

  assert.deepEqual(
    recordAuditEvents({
      events,
      parcelId: "p-1",
      mutationIds: ["m-1"],
      disputeIds: ["ds-1"],
      documentIds: ["d-1"],
    }).map((event) => event.id),
    ["a-mutation", "a-dispute", "a-document", "a-parcel"],
  );
});
