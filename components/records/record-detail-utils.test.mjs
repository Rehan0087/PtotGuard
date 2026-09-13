import assert from "node:assert/strict";
import test from "node:test";

let ownershipTransitions;
let usableRecordDocumentUrl;
try {
  ({ ownershipTransitions, usableRecordDocumentUrl } = await import("./record-detail-utils.mjs"));
} catch {
  // The assertions below capture the missing presentation behavior.
}

test("ownership transitions derive the previous owner without mutating history", () => {
  assert.equal(typeof ownershipTransitions, "function");
  const source = [
    { id: "new", ownerName: "New Owner", fromDate: "2026-01-01T00:00:00Z", toDate: null },
    { id: "old", ownerName: "Old Owner", fromDate: "2020-01-01T00:00:00Z", toDate: "2026-01-01T00:00:00Z" },
  ];

  assert.deepEqual(ownershipTransitions(source), [
    { ...source[0], previousOwnerName: "Old Owner" },
    { ...source[1], previousOwnerName: undefined },
  ]);
  assert.equal(source[0].previousOwnerName, undefined);
});

test("document actions accept only usable local or HTTP preview URLs", () => {
  assert.equal(typeof usableRecordDocumentUrl, "function");
  assert.equal(usableRecordDocumentUrl("/documents/deed.pdf"), "/documents/deed.pdf");
  assert.equal(usableRecordDocumentUrl("https://records.example/deed.pdf"), "https://records.example/deed.pdf");
  assert.equal(usableRecordDocumentUrl("javascript:alert(1)"), null);
  assert.equal(usableRecordDocumentUrl(""), null);
  assert.equal(usableRecordDocumentUrl(undefined), null);
});
