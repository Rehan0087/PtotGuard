import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const newMutation = await readFile(
  new URL("../../app/(app)/mutations/new/page.tsx", import.meta.url),
  "utf8",
);
const mutationQueue = await readFile(
  new URL("../../app/(app)/mutations/page.tsx", import.meta.url),
  "utf8",
);
const mutationDetail = await readFile(new URL("./mutation-detail-dialog.tsx", import.meta.url), "utf8");
const ocrQueue = await readFile(
  new URL("../../app/(app)/ocr-queue/page.tsx", import.meta.url),
  "utf8",
);
const documentController = await readFile(
  new URL("../../apps/api/src/documents/documents.controller.ts", import.meta.url),
  "utf8",
);
const fieldReportController = await readFile(
  new URL("../../apps/api/src/field-reports/field-reports.controller.ts", import.meta.url),
  "utf8",
);
const boundaryWalk = await readFile(
  new URL("../../hooks/use-boundary-walk.ts", import.meta.url),
  "utf8",
);
const assignedVisitCapture = await readFile(
  new URL("../../app/(app)/visits/[id]/page.tsx", import.meta.url),
  "utf8",
);
const landOfficeAgents = await readFile(
  new URL("../../app/(app)/agents/page.tsx", import.meta.url),
  "utf8",
);
const queries = await readFile(new URL("../../hooks/queries.ts", import.meta.url), "utf8");
const paymentDialog = await readFile(
  new URL("../payment-confirmation-dialog.tsx", import.meta.url),
  "utf8",
);
const mutationController = await readFile(
  new URL("../../apps/api/src/mutations/mutations.controller.ts", import.meta.url),
  "utf8",
);

test("citizen mutation selects one required deed PDF from the selected parcel", () => {
  assert.match(newMutation, /documentIds: z\.array\(z\.string\(\)\)\.min\(1,/);
  assert.match(newMutation, /useDocuments\(\{ owner: "me", parcelId:/);
  assert.match(newMutation, /document\.parcelId === parcelId/);
  assert.match(newMutation, /document\.mimeType === "application\/pdf"/);
  assert.match(newMutation, /document\.type === "sale-deed"/);
  assert.match(newMutation, /document\.type === "title-deed"/);
  assert.match(newMutation, /type="radio"/);
  assert.match(newMutation, /setValue\("documentIds", \[doc\.id\]/);
});

test("mutation uses the shared logo, account-details, and PIN payment flow", () => {
  assert.match(newMutation, /PaymentConfirmationDialog/);
  assert.match(newMutation, /onConfirm=\{\(confirmedMethod\)/);
  assert.doesNotMatch(newMutation, /const PAYMENT_METHODS/);
});

test("mobile wallets require OTP 1234 before PIN without exposing the demo PIN", () => {
  assert.match(paymentDialog, /type Step = "method-and-number" \| "otp" \| "pin"/);
  assert.match(paymentDialog, /setStep\(isCard \? "pin" : "otp"\)/);
  assert.match(paymentDialog, /if \(otp !== "1234"\)/);
  assert.match(paymentDialog, /setStep\("pin"\)/);
  assert.match(paymentDialog, /if \(pin !== "1234"\)/);
  assert.match(paymentDialog, /onConfirm\(method\)/);
  assert.doesNotMatch(paymentDialog, /Demo OTP/);
  assert.doesNotMatch(paymentDialog, /Demo PIN/);
});

test("submitted mutation verification is routed to its OCR queue", () => {
  assert.match(mutationQueue, /href=\{`\/ocr-queue\?mutation=\$\{mutation\.id\}`\}/);
  assert.match(mutationDetail, /href=\{`\/ocr-queue\?mutation=\$\{mutation\.id\}`\}/);
  assert.match(ocrQueue, /useSearchParams\(\)\.get\("mutation"\)/);
  assert.match(ocrQueue, /\{ mutationId, pageSize: 100 \}/);
});

test("only officer deed acceptance advances a submitted mutation", () => {
  assert.match(documentController, /body\.decision === "verify"/);
  assert.match(documentController, /status: "under-primary-verification"/);
  assert.match(documentController, /source: "ocr-queue-acceptance"/);
  assert.match(mutationDetail, /role !== "land-office"/);
});

test("field submission completes verification and links reported disputes automatically", () => {
  assert.match(boundaryWalk, /await api\.post<Pick<FieldReportDetail, "report" \| "survey">>/);
  assert.match(boundaryWalk, /\/field-reports\/\$\{encodeURIComponent\(fieldReportId\)\}\/survey\/complete/);
  assert.doesNotMatch(boundaryWalk, /queueCompletion\(key/);
  assert.match(assignedVisitCapture, /report\.status === "in-progress" && survey\?\.status === "in-progress"/);
  assert.match(assignedVisitCapture, /disabled=\{!active \|\| !review\.canFile \|\| !walk\.online \|\| filing\}/);
  assert.doesNotMatch(assignedVisitCapture, /captureFakePoint|Add Fake GPS|Add GPS Point/);
  assert.match(fieldReportController, /status: "field-verification-complete"/);
  assert.match(fieldReportController, /updatedReport\.disputeFound === true/);
  assert.match(fieldReportController, /status: "under-land-office-review"/);
  assert.match(fieldReportController, /disputeId/);
});

test("land-office board refreshes and keeps submitted field reports visible", () => {
  assert.match(queries, /refetchInterval: role === "land-office" \? 15_000 : false/);
  assert.match(landOfficeAgents, /visit\.status === "completed"/);
  assert.match(landOfficeAgents, /completedReports/);
  assert.match(landOfficeAgents, /"field-verification-complete" : "field-investigation"/);
  assert.match(landOfficeAgents, /visit\.submittedAt/);
});

test("field evidence upload refreshes the active capture detail", () => {
  assert.match(queries, /queryKey: \["field-report", id\]/);
  assert.doesNotMatch(queries, /queryKey: \["field-reports", id\]/);
});

test("DCR payment uses the shared checkout and completes the mutation for BDT 1170", () => {
  assert.match(mutationQueue, /PaymentConfirmationDialog/);
  assert.match(mutationQueue, /MUTATION_DCR_AMOUNT_BDT/);
  assert.match(mutationQueue, /payDcr\.mutate\(method/);
  assert.match(mutationController, /dcrPaymentMethod: body\.paymentMethod/);
  assert.match(mutationController, /status: "complete"/);
});
