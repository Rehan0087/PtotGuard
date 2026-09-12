import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detailSource = await readFile(new URL("./mutation-detail-dialog.tsx", import.meta.url), "utf8");

let isUsableMutationPreviewUrl;
let mutationDetailPresentation;
let mutationTimelineActionGroup;
try {
  ({ isUsableMutationPreviewUrl, mutationDetailPresentation, mutationTimelineActionGroup } =
    await import("./mutation-detail-utils.mjs"));
} catch {
  // The assertion below records the missing implementation as a test failure.
}

test("mutation timeline headings localize every seeded and workflow action", () => {
  assert.match(detailSource, /mutationTimelineActionGroup\(action\)/);
  assert.match(detailSource, /t\.domain\.auditAction\[action/);
  assert.match(detailSource, /t\.pages\.mutations\.timelineAction\s*\[\s*action/);
  assert.match(detailSource, /t\.pages\.mutations\.timelineAction\.unknown/);
  assert.doesNotMatch(detailSource, /sentenceCase\(event\.action\)/);

  assert.equal(typeof mutationTimelineActionGroup, "function");
  for (const action of ["create", "status-change", "approve", "reject"]) {
    assert.equal(mutationTimelineActionGroup(action), "audit", action);
  }
  for (const action of [
    "start-verification",
    "verify",
    "complete-verification",
    "start-objection-period",
    "file-objection",
    "objection-added",
    "objection-resolved",
  ]) {
    assert.equal(mutationTimelineActionGroup(action), "workflow", action);
  }
  assert.equal(mutationTimelineActionGroup("unrecognised-action"), "unknown");
});

test("mutation document previews allow only usable same-app or http URLs", () => {
  assert.equal(typeof isUsableMutationPreviewUrl, "function");
  assert.equal(isUsableMutationPreviewUrl("/documents/preview.pdf"), true);
  assert.equal(isUsableMutationPreviewUrl("https://records.example/preview.pdf"), true);
  assert.equal(isUsableMutationPreviewUrl("http://records.example/preview.pdf"), true);

  for (const value of [
    "preview.pdf",
    "./preview.pdf",
    "http:preview.pdf",
    "//records.example/preview.pdf",
    "/\\records.example/preview.pdf",
    "javascript:alert(1)",
    "data:text/plain,preview",
    "file:///C:/preview.pdf",
    "https://",
    "https:///host/path",
    "https:////host/path",
    "https://\\host/path",
    "http:///host/path",
    "http:////host/path",
    "  ",
  ]) {
    assert.equal(isUsableMutationPreviewUrl(value), false, value);
  }
});

test("mutation detail labels authoritative identifiers and statuses", () => {
  assert.equal(typeof mutationDetailPresentation, "function");

  const presentation = mutationDetailPresentation(
    {
      mutation: {
        id: "internal-database-id",
        mutationNumber: "MUT-2026-0042",
        status: "approved",
      },
      documents: [
        { id: "document-1", verificationStatus: "verified" },
        { id: "document-2", verificationStatus: "rejected" },
      ],
    },
    "loading-fallback-id",
  );

  assert.equal(presentation.identifier, "MUT-2026-0042");
  assert.equal(presentation.currentStatus, "approved");
  assert.deepEqual(
    presentation.documents.map(({ document, verificationStatus }) => ({
      id: document.id,
      verificationStatus,
    })),
    [
      { id: "document-1", verificationStatus: "verified" },
      { id: "document-2", verificationStatus: "rejected" },
    ],
  );
  assert.match(detailSource, /mutationDetailPresentation\(/);
});
