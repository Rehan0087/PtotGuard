import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detailSource = await readFile(new URL("./mutation-detail-dialog.tsx", import.meta.url), "utf8");

let isUsableMutationPreviewUrl;
try {
  ({ isUsableMutationPreviewUrl } = await import("./mutation-detail-utils.mjs"));
} catch {
  // The assertion below records the missing implementation as a test failure.
}

test("mutation timeline headings use translated labels and a neutral fallback", () => {
  assert.match(detailSource, /t\.domain\.auditAction\[action\]/);
  assert.match(detailSource, /t\.pages\.mutations\.timelineAction\[action\]/);
  assert.match(detailSource, /t\.pages\.mutations\.timelineAction\.unknown/);
  assert.doesNotMatch(detailSource, /sentenceCase\(event\.action\)/);
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
    "  ",
  ]) {
    assert.equal(isUsableMutationPreviewUrl(value), false, value);
  }
});
