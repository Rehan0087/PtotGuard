import assert from "node:assert/strict";
import test from "node:test";
import { documentPreviewUrl } from "./document-preview.ts";

const document = { parcelId: "p-142", fileName: "deed scan.pdf" };

test("builds the repository deed-PDF URL", () => {
  assert.equal(documentPreviewUrl(document), "/documents/p-142/deed%20scan.pdf");
});

test("prefers a safe explicit storage URL", () => {
  assert.equal(documentPreviewUrl({ ...document, thumbnailUrl: "https://files.example/deed.pdf" }), "https://files.example/deed.pdf");
});

test("does not make a path for documents without stored parcel content", () => {
  assert.equal(documentPreviewUrl({ fileName: "identity.pdf" }), null);
});
