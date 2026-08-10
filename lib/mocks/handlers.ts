/**
 * MSW request handlers — a mock of the frozen PlotGuard Core API. Response shapes
 * match the planned NestJS backend exactly, so swapping MSW for the live API is a
 * config change (see lib/api-client.ts), not a rewrite. Paths after the /api base
 * mirror the frozen spec. Writes mutate the in-memory arrays for the session.
 */
import { http, HttpResponse, delay } from "msw";
import type {
  Dispute,
  DisputeStatus,
  FieldReportStatus,
  Jurisdiction,
  JurisdictionLevel,
  Paginated,
  Policy,
  Role,
  User,
} from "@/lib/types";
import { ROLES } from "@/lib/types";
import {
  approvalGate,
  assessLandTax,
  calcInheritance,
  deletionGate,
  filingReview,
  normaliseUlpin,
  reviewDraft,
  rulingGate,
  toPublicParcel,
  transferReview,
  type LandTaxRates,
} from "@plotguard/rules";
import * as db from "./data";
import { appendAudit, getAuditChain, verifyAuditChain } from "./audit-chain";

// --- helpers ---------------------------------------------------------------

async function latency() {
  await delay(180 + Math.random() * 300);
}

function getRole(request: Request): Role {
  const header = request.headers.get("x-plotguard-role");
  return (ROLES as string[]).includes(header ?? "") ? (header as Role) : "citizen";
}

function currentUser(request: Request): User {
  const id = db.CURRENT_USER_BY_ROLE[getRole(request)];
  return db.users.find((u) => u.id === id)!;
}

function paginate<T>(items: T[], url: URL): Paginated<T> {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize") ?? "20"));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

function notFound(message = "Not found") {
  return HttpResponse.json({ error: "not_found", message }, { status: 404 });
}

/**
 * A write refused because the body itself is wrong. `reason` carries the rule's
 * structured code so the client can word the refusal in the reader's language;
 * `message` stays as an English fallback for logs and unknown codes.
 */
function unprocessable(errors: Record<string, { code: string } | undefined>) {
  const [field, reason] = Object.entries(errors).find(([, r]) => r) ?? [];
  return HttpResponse.json(
    {
      error: "validation_failed",
      field,
      reason,
      message: reason ? `Validation failed: ${reason.code}` : "That request is not valid.",
    },
    { status: 422 },
  );
}

/** A write refused because of the state of other records. See `unprocessable`. */
function conflict(message: string, reason?: unknown) {
  return HttpResponse.json({ error: "conflict", message, reason }, { status: 409 });
}

/**
 * Flat `field.from` / `field.to` pairs for the fields that actually changed.
 *
 * Audit payloads are rendered by coercing each value to a string, so every
 * entry in the ledger is a flat scalar — nesting a before/after object would
 * read as "[object Object]". Recording only what moved also keeps a one-field
 * edit from looking like a rewrite of the whole record.
 */
function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      payload[`${key}.from`] = before[key];
      payload[`${key}.to`] = after[key];
    }
  }
  return payload;
}

/**
 * A dispute nobody should be moving any more. Writes that would otherwise
 * advance a case (a sitting, a ruling) leave these alone rather than reopening
 * something that was withdrawn or rejected.
 */
function isClosed(status: DisputeStatus) {
  return status === "resolved" || status === "rejected" || status === "withdrawn";
}

/**
 * Everyone with an account who should hear about a change to this case: the
 * person who filed it and any party matched to a user. Deduped, and never the
 * actor — telling someone what they just did themselves is noise.
 */
function disputeAudience(dispute: Dispute, actorId: string): string[] {
  const ids = [dispute.filedById, ...dispute.parties.map((p) => p.userId)];
  return [...new Set(ids.filter((id): id is string => Boolean(id) && id !== actorId))];
}

function distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng);
}

/**
 * Stands in for the async OCR + fraud-scoring worker (BullMQ → AI service in
 * production). Upload responds immediately with `processing`; a few seconds
 * later the record is updated in place and the owner is notified — the same
 * sequence the real queue produces, so the UI's polling is exercised for real.
 */
const OCR_WORKER_MS = 6000;

function scheduleOcrWorker(documentId: string, parcelId?: string, delayMs = OCR_WORKER_MS) {
  setTimeout(() => {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc || (doc.ocrStatus !== "processing" && doc.ocrStatus !== "pending")) return;

    const parcel = parcelId ? db.parcels.find((p) => p.id === parcelId) : undefined;
    doc.ocrStatus = "extracted";
    doc.fraudScore = 0.04;
    doc.extractedFields = {
      "Document type": doc.type.replace(/-/g, " "),
      ...(parcel ? { "Dag No": parcel.dagNo, Khatian: parcel.khatianNo } : {}),
      "Pages read": String(doc.pageCount ?? 1),
    };

    db.notifications.unshift({
      id: `n-${Date.now()}`,
      userId: doc.ownerId ?? doc.uploadedById,
      at: new Date().toISOString(),
      severity: "success",
      title: "Document processed",
      body: `Text was extracted from ${doc.fileName}. It is now awaiting officer verification.`,
      content: { code: "document-processed", fileName: doc.fileName },
      read: false,
      href: "/documents",
    });
  }, delayMs);
}

// Seeded documents that are already mid-flight drain shortly after load, so the
// pipeline is visible on a first visit and polling doesn't run forever.
db.documents
  .filter((d) => d.ocrStatus === "processing" || d.ocrStatus === "pending")
  .forEach((d, i) => scheduleOcrWorker(d.id, d.parcelId, 7000 + i * 5000));

const API = "/api";

/** Read off the paid land-tax applications themselves — the payment record is
 * the evidence, so there is no second counter to drift from it. Mirrors
 * paidThroughYear() in land-tax.controller.ts. */
function paidThroughYear(
  paid: { parcelId?: string; details: Record<string, unknown> }[],
  parcelId: string,
): number | null {
  const years = paid
    .filter((a) => a.parcelId === parcelId)
    .map((a) => Number(a.details?.assessmentYear))
    .filter((y) => Number.isFinite(y));
  return years.length > 0 ? Math.max(...years) : null;
}

function landTaxRates(): LandTaxRates {
  return {
    perDecimalByLandUse: db.policies.landTaxRatePerDecimalBdt,
    agriculturalExemptionDecimals: db.policies.landTaxAgriculturalExemptionDecimals,
    arrearSurchargePercent: db.policies.landTaxArrearSurchargePercent,
    maxArrearYears: db.policies.landTaxMaxArrearYears,
  };
}

/** The prefix names the service on every application number it issues —
 * mirrors APPLICATION_PREFIX in service-applications.controller.ts. */
const APPLICATION_PREFIX: Record<string, string> = {
  "land-tax": "LDT",
  acquisition: "ACQ",
  "lease-settlement": "LSE",
  "land-admin": "ADM",
  "revenue-case": "RVC",
  "info-bank-request": "INF",
};

// --- handlers --------------------------------------------------------------

export const handlers = [
  // Auth -------------------------------------------------------------------
  http.post(`${API}/auth/login`, async ({ request }) => {
    await latency();
    const user = currentUser(request);
    return HttpResponse.json({
      user,
      tokens: {
        accessToken: `mock.${user.id}.access`,
        refreshToken: `mock.${user.id}.refresh`,
        expiresIn: 3600,
      },
    });
  }),

  http.post(`${API}/auth/refresh`, async ({ request }) => {
    const user = currentUser(request);
    return HttpResponse.json({
      accessToken: `mock.${user.id}.access`,
      refreshToken: `mock.${user.id}.refresh`,
      expiresIn: 3600,
    });
  }),

  http.get(`${API}/auth/me`, async ({ request }) => {
    await latency();
    const user = currentUser(request);
    const jurisdiction = db.jurisdictions.find((j) => j.id === user.jurisdictionId) ?? null;
    return HttpResponse.json({ user, jurisdiction });
  }),

  // Jurisdictions ----------------------------------------------------------
  // The frozen spec has only the GET; the admin screen needs to edit the tree,
  // so the three writes below are additive. They run the same rules the client
  // does (lib/jurisdictions.ts) — the client copy explains a refusal, this copy
  // is what actually refuses. 422 means the body is wrong; 409 means other
  // records are in the way.
  http.get(`${API}/jurisdictions`, async () => {
    await latency();
    return HttpResponse.json(db.jurisdictions);
  }),

  http.post(`${API}/jurisdictions`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as Partial<Jurisdiction>;
    const draft = {
      name: (body.name ?? "").trim(),
      nameBn: body.nameBn?.trim() || undefined,
      code: (body.code ?? "").trim().toUpperCase(),
      level: (body.level ?? "mouza") as JurisdictionLevel,
      parentId: body.parentId ?? null,
    };
    const review = reviewDraft(draft, db.jurisdictions);
    if (!review.valid) return unprocessable(review.errors);

    const created: Jurisdiction = { id: `j-${Date.now()}`, ...draft };
    db.jurisdictions.push(created);

    const me = currentUser(request);
    await appendAudit({
      entityType: "jurisdiction",
      entityId: created.id,
      action: "create",
      actorId: me.id,
      actorName: me.name,
      payload: { name: created.name, code: created.code, level: created.level },
    });

    return HttpResponse.json(created, { status: 201 });
  }),

  http.patch(`${API}/jurisdictions/:id`, async ({ params, request }) => {
    await latency();
    const target = db.jurisdictions.find((j) => j.id === params.id);
    if (!target) return notFound("Jurisdiction not found");

    const body = (await request.json()) as Partial<Jurisdiction>;
    const draft = {
      id: target.id,
      name: (body.name ?? target.name).trim(),
      nameBn: (body.nameBn ?? target.nameBn)?.trim() || undefined,
      code: (body.code ?? target.code).trim().toUpperCase(),
      level: (body.level ?? target.level) as JurisdictionLevel,
      // parentId is nullable, so undefined (absent) and null (clear it) differ.
      parentId: body.parentId === undefined ? target.parentId : body.parentId,
    };
    const review = reviewDraft(draft, db.jurisdictions);
    if (!review.valid) return unprocessable(review.errors);

    const before = { name: target.name, code: target.code, level: target.level };
    Object.assign(target, draft);

    const me = currentUser(request);
    await appendAudit({
      entityType: "jurisdiction",
      entityId: target.id,
      action: "update",
      actorId: me.id,
      actorName: me.name,
      payload: changedFields(before, {
        name: target.name,
        code: target.code,
        level: target.level,
      }),
    });

    return HttpResponse.json(target);
  }),

  http.delete(`${API}/jurisdictions/:id`, async ({ params, request }) => {
    await latency();
    const index = db.jurisdictions.findIndex((j) => j.id === params.id);
    if (index === -1) return notFound("Jurisdiction not found");

    const gate = deletionGate(String(params.id), db.jurisdictions, db.users, db.parcels);
    if (!gate.canDelete) {
      return conflict(
        `Still in use: ${gate.blockers.map((b) => b.code).join(", ")}.`,
        gate.blockers,
      );
    }

    const [removed] = db.jurisdictions.splice(index, 1);

    const me = currentUser(request);
    await appendAudit({
      entityType: "jurisdiction",
      entityId: removed.id,
      action: "delete",
      actorId: me.id,
      actorName: me.name,
      payload: { name: removed.name, code: removed.code, level: removed.level },
    });

    return new HttpResponse(null, { status: 204 });
  }),

  // Parcels ----------------------------------------------------------------
  // Before `/parcels/:id`: MSW matches in registration order, and this path
  // would otherwise be read as a parcel id of "public".
  http.get(`${API}/parcels/public/:ulpin`, async ({ params }) => {
    await latency();
    const ulpin = normaliseUlpin(String(params.ulpin));
    const parcel = db.parcels.find((p) => p.ulpin === ulpin);
    if (!parcel) return notFound("Parcel not found");

    // Narrowed by the rule, not by picking fields here — the same single
    // decision about what is public that the real API uses.
    return HttpResponse.json(
      toPublicParcel(
        parcel,
        db.parcelRestrictions.filter((r) => r.parcelId === parcel.id),
      ),
    );
  }),

  http.get(`${API}/parcels/:id/neighbours`, async ({ params }) => {
    await latency();
    const parcel = db.parcels.find((p) => p.id === params.id);
    if (!parcel) return notFound("Parcel not found");
    const neighbours = db.parcels
      .filter((p) => p.id !== parcel.id)
      .sort((a, b) => distance(a.centroid, parcel.centroid) - distance(b.centroid, parcel.centroid))
      .slice(0, 4);
    return HttpResponse.json(neighbours);
  }),

  http.get(`${API}/parcels/:id/history`, async ({ params }) => {
    await latency();
    const history = db.ownershipRecords
      .filter((o) => o.parcelId === params.id)
      .sort((a, b) => b.fromDate.localeCompare(a.fromDate));
    return HttpResponse.json(history);
  }),

  http.get(`${API}/parcels/:id`, async ({ params }) => {
    await latency();
    const parcel = db.parcels.find((p) => p.id === params.id);
    if (!parcel) return notFound("Parcel not found");
    const restrictions = db.parcelRestrictions
      .filter((r) => r.parcelId === parcel.id)
      .sort((a, b) => b.fromDate.localeCompare(a.fromDate));

    return HttpResponse.json({
      parcel,
      ownership: db.ownershipRecords.filter((o) => o.parcelId === parcel.id),
      documents: db.documents.filter((d) => d.parcelId === parcel.id),
      disputes: db.disputes.filter((d) => d.parcelId === parcel.id),
      restrictions,
      // Server-side, same as the real API: whether land may change hands is
      // not a question the browser answers for itself.
      transfer: transferReview(restrictions),
    });
  }),

  http.get(`${API}/parcels`, async ({ request }) => {
    await latency();
    const url = new URL(request.url);
    const owner = url.searchParams.get("owner");
    const status = url.searchParams.get("status");
    const dag = url.searchParams.get("dag")?.toLowerCase();
    const khatian = url.searchParams.get("khatian")?.toLowerCase();
    const bbox = url.searchParams.get("bbox");
    const q = url.searchParams.get("q")?.toLowerCase();
    const ulpin = url.searchParams.get("ulpin");

    let items = db.parcels.slice();
    if (owner === "me") items = items.filter((p) => p.ownerId === currentUser(request).id);
    else if (owner) items = items.filter((p) => p.ownerId === owner);
    if (status) items = items.filter((p) => p.registryStatus === status);
    // Exact, not a substring: a ULPIN is an identifier being cited, so a
    // near-miss returns nothing rather than a plausible wrong plot.
    if (ulpin) items = items.filter((p) => p.ulpin === normaliseUlpin(ulpin));
    if (dag) items = items.filter((p) => p.dagNo.toLowerCase().includes(dag));
    if (khatian) items = items.filter((p) => p.khatianNo.toLowerCase().includes(khatian));
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(",").map(Number);
      items = items.filter(
        (p) =>
          p.centroid.lng >= minLng &&
          p.centroid.lng <= maxLng &&
          p.centroid.lat >= minLat &&
          p.centroid.lat <= maxLat,
      );
    }
    if (q)
      items = items.filter(
        (p) =>
          p.dagNo.toLowerCase().includes(q) ||
          p.khatianNo.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.ownerName.toLowerCase().includes(q) ||
          // A citizen pasting an identifier into the one search box should land
          // on it, without knowing which field it belongs to.
          Boolean(p.ulpin?.toLowerCase().includes(q)),
      );
    return HttpResponse.json(paginate(items, url));
  }),

  // Documents --------------------------------------------------------------
  http.post(`${API}/documents/:id/reprocess`, async ({ params }) => {
    await latency();
    const doc = db.documents.find((d) => d.id === params.id);
    if (!doc) return notFound("Document not found");
    doc.ocrStatus = "processing";
    doc.verificationStatus = "unverified";
    // Re-queue for real, so a retry drains the same way a fresh upload does.
    scheduleOcrWorker(doc.id, doc.parcelId);
    return HttpResponse.json(doc);
  }),

  // Officer decision on a document. Additive to the frozen spec, mirroring the
  // /mutations/:id/decision verb style. `flag` is the OCR queue's escalation
  // path — it hands the document to the fraud-review queue.
  http.patch(`${API}/documents/:id/decision`, async ({ params, request }) => {
    await latency();
    const doc = db.documents.find((d) => d.id === params.id);
    if (!doc) return notFound("Document not found");
    const { decision } = (await request.json()) as {
      decision: "verify" | "reject" | "flag";
    };
    doc.verificationStatus =
      decision === "verify" ? "verified" : decision === "flag" ? "flagged" : "rejected";

    const me = currentUser(request);
    await appendAudit({
      entityType: "document",
      entityId: doc.id,
      action: decision === "verify" ? "approve" : "reject",
      actorId: me.id,
      actorName: me.name,
      payload: { decision, fileName: doc.fileName, status: doc.verificationStatus },
    });

    return HttpResponse.json(doc);
  }),

  // Officer corrections to what the reader pulled off the scan. Additive to
  // the frozen spec — the digitisation station needs somewhere to put the
  // fields a human keyed in.
  http.patch(`${API}/documents/:id/fields`, async ({ params, request }) => {
    await latency();
    const doc = db.documents.find((d) => d.id === params.id);
    if (!doc) return notFound("Document not found");
    const { fields } = (await request.json()) as { fields: Record<string, string> };
    doc.extractedFields = { ...doc.extractedFields, ...fields };
    return HttpResponse.json(doc);
  }),

  http.get(`${API}/documents/:id`, async ({ params }) => {
    await latency();
    const doc = db.documents.find((d) => d.id === params.id);
    if (!doc) return notFound("Document not found");
    return HttpResponse.json(doc);
  }),

  http.post(`${API}/documents`, async ({ request }) => {
    await latency();
    const me = currentUser(request);
    const body = (await request.json()) as Partial<{
      parcelId: string;
      type: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }>;
    const doc = {
      id: `d-${Date.now()}`,
      parcelId: body.parcelId || undefined,
      ownerId: me.id,
      type: (body.type as never) ?? "title-deed",
      fileName: body.fileName ?? "upload.pdf",
      mimeType: body.mimeType ?? "application/pdf",
      sizeBytes: body.sizeBytes ?? 250_000,
      uploadedAt: new Date().toISOString(),
      uploadedById: me.id,
      // Upload returns immediately; the OCR/fraud worker fills these in later.
      ocrStatus: "processing" as const,
      verificationStatus: "unverified" as const,
    };
    db.documents.unshift(doc);
    scheduleOcrWorker(doc.id, body.parcelId);
    return HttpResponse.json(doc, { status: 201 });
  }),

  http.get(`${API}/documents`, async ({ request }) => {
    await latency();
    const url = new URL(request.url);
    const owner = url.searchParams.get("owner");
    const fraud = url.searchParams.get("fraud");
    const ocr = url.searchParams.get("ocr");
    let items = db.documents.slice();
    if (owner === "me") items = items.filter((d) => d.ownerId === currentUser(request).id);
    else if (owner) items = items.filter((d) => d.ownerId === owner);
    // fraud=true means "awaiting fraud review": still flagged, not yet decided.
    if (fraud === "true") items = items.filter((d) => d.verificationStatus === "flagged");
    if (ocr) items = items.filter((d) => d.ocrStatus === ocr);
    items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    return HttpResponse.json(paginate(items, url));
  }),

  // Mutations (namjari) ----------------------------------------------------
  // Citizen filing. Gated by transferReview(), not approvalGate(): at filing
  // time there is no objection window yet (that starts once an officer moves
  // this past verification) — the question is whether the land can change
  // hands at all. A plot under an active injunction, attachment, or
  // acquisition notice does not enter the pipeline; a mortgaged one may.
  http.post(`${API}/mutations`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as Partial<{
      parcelId: string;
      type: string;
      toOwnerName: string;
      deedNumber: string;
      deedDate: string;
      documentIds: string[];
      paymentMethod: string;
    }>;
    const parcel = db.parcels.find((p) => p.id === body.parcelId);
    if (!parcel) return notFound("Parcel not found");

    const restrictions = db.parcelRestrictions.filter((r) => r.parcelId === parcel.id);
    const review = transferReview(restrictions);
    if (!review.canTransfer) {
      // Assigned rather than passed as an inline literal: unprocessable()'s
      // parameter type checks each value against { code: string } with excess
      // fields ignored — but only when the value is not a fresh object
      // literal at the call site, which TypeScript still excess-checks.
      const reason = { code: "restricted", blockers: review.blockers.map((r) => r.type) };
      return unprocessable({ parcelId: reason });
    }

    const me = currentUser(request);
    const seq = 1300 + db.mutations.length;
    const now = new Date().toISOString();
    const mutation = {
      id: `m-${Date.now()}`,
      mutationNumber: `MUT-2026-${String(seq).padStart(5, "0")}`,
      parcelId: parcel.id,
      parcelDagNo: parcel.dagNo,
      type: (body.type ?? "sale") as never,
      status: "submitted" as const,
      // The registry's own fact, not the applicant's claim.
      fromOwnerName: parcel.ownerName,
      toOwnerName: body.toOwnerName ?? "",
      requestedById: me.id,
      requestedAt: now,
      documentIds: body.documentIds ?? [],
      objections: [],
      deedNumber: body.deedNumber,
      deedDate: body.deedDate,
      fee: { amount: db.policies.mutationFeeBdt, currency: "BDT" as const },
      paymentMethod: body.paymentMethod as never,
      // Simulated — no gateway is called.
      transactionId: `TXN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    };
    db.mutations.unshift(mutation);

    await appendAudit({
      entityType: "mutation",
      entityId: mutation.id,
      action: "create",
      actorId: me.id,
      actorName: me.name,
      payload: {
        mutationNumber: mutation.mutationNumber,
        parcelDagNo: mutation.parcelDagNo,
        toOwnerName: mutation.toOwnerName,
      },
    });

    return HttpResponse.json(mutation, { status: 201 });
  }),

  // approvalGate() used to run client-side only (the button disables, but
  // nothing here checked it) — exactly the gap this file's own header says
  // this project avoids: a UI that explains a hold is not a server that
  // enforces one. A request that bypassed the disabled button would have
  // gone straight through.
  http.patch(`${API}/mutations/:id/decision`, async ({ params, request }) => {
    await latency();
    const mutation = db.mutations.find((m) => m.id === params.id);
    if (!mutation) return notFound("Mutation not found");
    const { decision } = (await request.json()) as { decision: "approve" | "reject" };

    if (mutation.status === "approved" || mutation.status === "rejected") {
      return conflict("This mutation has already been decided.");
    }
    const gate = approvalGate(mutation);
    const allowed = decision === "approve" ? gate.canApprove : gate.canReject;
    if (!allowed) return unprocessable({ decision: gate.hold ?? undefined });

    mutation.status = decision === "approve" ? "approved" : "rejected";
    mutation.decidedAt = new Date().toISOString();

    const me = currentUser(request);
    await appendAudit({
      entityType: "mutation",
      entityId: mutation.id,
      action: decision,
      actorId: me.id,
      actorName: me.name,
      payload: {
        mutationNumber: mutation.mutationNumber,
        parcelDagNo: mutation.parcelDagNo,
        toOwnerName: mutation.toOwnerName,
      },
    });

    return HttpResponse.json(mutation);
  }),

  http.get(`${API}/mutations/:id`, async ({ params }) => {
    await latency();
    const mutation = db.mutations.find((m) => m.id === params.id);
    if (!mutation) return notFound("Mutation not found");
    return HttpResponse.json({
      mutation,
      parcel: db.parcels.find((p) => p.id === mutation.parcelId) ?? null,
      documents: db.documents.filter((d) => mutation.documentIds.includes(d.id)),
    });
  }),

  http.get(`${API}/mutations`, async ({ request }) => {
    await latency();
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const status = url.searchParams.get("status");
    const me = currentUser(request);
    let items = db.mutations.slice();
    if (scope === "mine") items = items.filter((m) => m.requestedById === me.id);
    else if (scope === "assigned") items = items.filter((m) => m.assignedOfficerId === me.id);
    if (status) items = items.filter((m) => m.status === status);
    items.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return HttpResponse.json(paginate(items, url));
  }),

  // Land development tax (khajna) --------------------------------------------
  // Assessments are computed here, never taken from the request: what a
  // citizen owes is the registry's determination. Mirrors
  // land-tax.controller.ts, including recording the payment as a
  // ServiceApplication rather than in a table of its own.
  http.get(`${API}/land-tax/holdings`, async ({ request }) => {
    await latency();
    const me = currentUser(request);
    const year = new Date().getUTCFullYear();
    const rates = landTaxRates();
    const paid = db.serviceApplications.filter(
      (a) => a.applicantId === me.id && a.serviceType === "land-tax" && a.paidAt,
    );

    const holdings = db.parcels
      .filter((p) => p.ownerId === me.id)
      .sort((a, b) => a.dagNo.localeCompare(b.dagNo))
      .map((parcel) => {
        const settled = paidThroughYear(paid, parcel.id);
        return {
          parcelId: parcel.id,
          ulpin: parcel.ulpin,
          dagNo: parcel.dagNo,
          khatianNo: parcel.khatianNo,
          title: parcel.title,
          landUse: parcel.landUse,
          area: parcel.area,
          assessmentYear: year,
          paidThroughYear: settled,
          assessment: assessLandTax(
            {
              area: parcel.area,
              landUse: parcel.landUse,
              assessmentYear: year,
              paidThroughYear: settled,
              liableFromYear: new Date(parcel.registeredAt).getUTCFullYear(),
            },
            rates,
          ),
        };
      });

    return HttpResponse.json(holdings);
  }),

  http.post(`${API}/land-tax/pay`, async ({ request }) => {
    await latency();
    const me = currentUser(request);
    const body = (await request.json()) as { parcelId: string; paymentMethod: string };
    const parcel = db.parcels.find((p) => p.id === body.parcelId);
    // Same answer for "no such parcel" and "not yours": tax is the holder's
    // liability, and distinguishing the two would confirm a stranger's holding.
    if (!parcel || parcel.ownerId !== me.id) return notFound("Parcel not found");

    const year = new Date().getUTCFullYear();
    const paid = db.serviceApplications.filter(
      (a) => a.applicantId === me.id && a.serviceType === "land-tax" && a.paidAt,
    );
    const settled = paidThroughYear(paid, parcel.id);
    if (settled !== null && settled >= year) {
      return conflict("This holding is already paid for the current year.");
    }

    const assessment = assessLandTax(
      {
        area: parcel.area,
        landUse: parcel.landUse,
        assessmentYear: year,
        paidThroughYear: settled,
        liableFromYear: new Date(parcel.registeredAt).getUTCFullYear(),
      },
      landTaxRates(),
    );
    if (assessment.total <= 0) return conflict("Nothing is due on this holding.");

    const now = new Date().toISOString();
    const count = db.serviceApplications.filter((a) => a.serviceType === "land-tax").length;
    const application = {
      id: `sa-${Date.now()}`,
      applicationNo: `LDT-2026-${String(1000 + count).padStart(6, "0")}`,
      serviceType: "land-tax" as const,
      // Paying khajna is a counter transaction, not an application anyone
      // adjudicates — settled the moment it is paid.
      status: "approved" as const,
      parcelId: parcel.id,
      applicantId: me.id,
      details: {
        assessmentYear: year,
        decimals: assessment.decimals,
        arrears: assessment.arrears,
        currentYearDue: assessment.currentYearDue,
        years: assessment.years,
      },
      documentIds: [],
      feeAmount: assessment.total,
      paymentMethod: body.paymentMethod as never,
      transactionId: `TXN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      paidAt: now,
      submittedAt: now,
      decidedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    db.serviceApplications.unshift(application);

    await appendAudit({
      entityType: "service-application",
      entityId: application.id,
      action: "payment",
      actorId: me.id,
      actorName: me.name,
      payload: {
        applicationNo: application.applicationNo,
        serviceType: "land-tax",
        parcelDagNo: parcel.dagNo,
        assessmentYear: year,
        amount: application.feeAmount,
      },
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`,
      applicationId: application.id,
      at: now,
      type: "payment-recorded",
      title: "Land development tax paid",
      actorId: me.id,
    });

    return HttpResponse.json(application, { status: 201 });
  }),

  // Service applications -----------------------------------------------------
  // Shared foundation for the six not-yet-built services (Land Development
  // Tax, Acquisition & Requisition, Lease & Settlement, Land Administration,
  // Revenue Cases, Land Information Bank) — see ServiceApplication in
  // @plotguard/rules. No screen calls these yet; mirrors
  // service-applications.controller.ts so the swap to the real API is a
  // config change once the first service screen lands.
  http.get(`${API}/service-applications`, async ({ request }) => {
    await latency();
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const serviceType = url.searchParams.get("serviceType");
    const status = url.searchParams.get("status");
    const me = currentUser(request);
    let items = db.serviceApplications.slice();
    if (scope === "mine") items = items.filter((a) => a.applicantId === me.id);
    else if (scope === "assigned") items = items.filter((a) => a.assignedOfficerId === me.id);
    if (serviceType) items = items.filter((a) => a.serviceType === serviceType);
    if (status) items = items.filter((a) => a.status === status);
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(paginate(items, url));
  }),

  http.get(`${API}/service-applications/:id`, async ({ params }) => {
    await latency();
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application) return notFound("Service application not found");
    return HttpResponse.json({
      application,
      timeline: db.serviceApplicationEvents
        .filter((e) => e.applicationId === application.id)
        .sort((a, b) => a.at.localeCompare(b.at)),
      parcel: application.parcelId
        ? (db.parcels.find((p) => p.id === application.parcelId) ?? null)
        : null,
    });
  }),

  http.post(`${API}/service-applications`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as Partial<{
      serviceType: string;
      parcelId: string;
      details: Record<string, unknown>;
    }>;
    const me = currentUser(request);
    const prefix = APPLICATION_PREFIX[body.serviceType as keyof typeof APPLICATION_PREFIX] ?? "SVC";
    const count = db.serviceApplications.filter((a) => a.serviceType === body.serviceType).length;
    const now = new Date().toISOString();
    const application = {
      id: `sa-${Date.now()}`,
      applicationNo: `${prefix}-2026-${String(1000 + count).padStart(6, "0")}`,
      serviceType: (body.serviceType ?? "land-tax") as never,
      status: "draft" as const,
      parcelId: body.parcelId,
      applicantId: me.id,
      details: body.details ?? {},
      documentIds: [],
      createdAt: now,
      updatedAt: now,
    };
    db.serviceApplications.unshift(application);

    await appendAudit({
      entityType: "service-application",
      entityId: application.id,
      action: "create",
      actorId: me.id,
      actorName: me.name,
      payload: { applicationNo: application.applicationNo, serviceType: application.serviceType },
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`,
      applicationId: application.id,
      at: now,
      type: "created",
      title: "Application started",
      actorId: me.id,
    });

    return HttpResponse.json(application, { status: 201 });
  }),

  http.patch(`${API}/service-applications/:id/submit`, async ({ params, request }) => {
    await latency();
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application) return notFound("Service application not found");
    if (application.status !== "draft") {
      return conflict("This application has already been submitted.");
    }

    const now = new Date().toISOString();
    application.status = "submitted";
    application.submittedAt = now;
    application.updatedAt = now;

    const me = currentUser(request);
    await appendAudit({
      entityType: "service-application",
      entityId: application.id,
      action: "status-change",
      actorId: me.id,
      actorName: me.name,
      payload: { applicationNo: application.applicationNo, status: application.status },
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`,
      applicationId: application.id,
      at: now,
      type: "submitted",
      title: "Application submitted",
      actorId: me.id,
    });

    return HttpResponse.json(application);
  }),

  http.patch(`${API}/service-applications/:id/pay`, async ({ params, request }) => {
    await latency();
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application) return notFound("Service application not found");
    if (!application.submittedAt) {
      return unprocessable({ status: { code: "not-submitted" } });
    }
    if (application.paidAt) {
      return conflict("This application has already been paid.");
    }

    const { paymentMethod } = (await request.json()) as { paymentMethod: string };
    const now = new Date().toISOString();
    application.status = "under-review";
    application.paymentMethod = paymentMethod as never;
    application.transactionId = `TXN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    application.paidAt = now;
    application.updatedAt = now;

    const me = currentUser(request);
    await appendAudit({
      entityType: "service-application",
      entityId: application.id,
      action: "payment",
      actorId: me.id,
      actorName: me.name,
      payload: { applicationNo: application.applicationNo, paymentMethod: application.paymentMethod },
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`,
      applicationId: application.id,
      at: now,
      type: "payment-recorded",
      title: "Payment recorded",
      actorId: me.id,
    });

    return HttpResponse.json(application);
  }),

  http.patch(`${API}/service-applications/:id/decision`, async ({ params, request }) => {
    await latency();
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application) return notFound("Service application not found");
    if (application.status === "draft") {
      return unprocessable({ status: { code: "not-submitted" } });
    }
    if (application.status === "approved" || application.status === "rejected") {
      return conflict("This application has already been decided.");
    }

    const { decision } = (await request.json()) as { decision: "approve" | "reject" };
    const now = new Date().toISOString();
    application.status = decision === "approve" ? "approved" : "rejected";
    application.decidedAt = now;
    application.updatedAt = now;

    const me = currentUser(request);
    await appendAudit({
      entityType: "service-application",
      entityId: application.id,
      action: decision,
      actorId: me.id,
      actorName: me.name,
      payload: { applicationNo: application.applicationNo, status: application.status },
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`,
      applicationId: application.id,
      at: now,
      type: "decided",
      title: decision === "approve" ? "Application approved" : "Application rejected",
      actorId: me.id,
    });

    return HttpResponse.json(application);
  }),

  // Disputes ---------------------------------------------------------------
  http.patch(`${API}/disputes/:id/status`, async ({ params, request }) => {
    await latency();
    const dispute = db.disputes.find((d) => d.id === params.id);
    if (!dispute) return notFound("Dispute not found");
    const { status } = (await request.json()) as { status: string };
    const from = dispute.status;
    dispute.status = status as never;
    dispute.updatedAt = new Date().toISOString();

    const me = currentUser(request);
    await appendAudit({
      entityType: "dispute",
      entityId: dispute.id,
      action: "status-change",
      actorId: me.id,
      actorName: me.name,
      payload: { from, to: dispute.status },
    });

    return HttpResponse.json(dispute);
  }),

  http.post(`${API}/disputes/:id/assign-agent`, async ({ params, request }) => {
    await latency();
    const dispute = db.disputes.find((d) => d.id === params.id);
    if (!dispute) return notFound("Dispute not found");
    const { agentId } = (await request.json()) as { agentId: string };
    dispute.assignedAgentId = agentId;
    dispute.status = "field-visit-scheduled";
    dispute.updatedAt = new Date().toISOString();
    return HttpResponse.json(dispute);
  }),

  http.get(`${API}/disputes/:id`, async ({ params }) => {
    await latency();
    const dispute = db.disputes.find((d) => d.id === params.id);
    if (!dispute) return notFound("Dispute not found");
    return HttpResponse.json({
      dispute,
      timeline: db.disputeEvents
        .filter((e) => e.disputeId === dispute.id)
        .sort((a, b) => a.at.localeCompare(b.at)),
      parcel: db.parcels.find((p) => p.id === dispute.parcelId) ?? null,
      evidence: db.documents.filter((d) => dispute.evidenceDocumentIds.includes(d.id)),
    });
  }),

  http.get(`${API}/disputes`, async ({ request }) => {
    await latency();
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q")?.toLowerCase();
    const me = currentUser(request);

    let items = db.disputes.slice();
    if (scope === "mine") items = items.filter((d) => d.filedById === me.id);
    else if (scope === "assigned")
      items = items.filter(
        (d) => d.assignedOfficerId === me.id || d.assignedMediatorId === me.id || d.assignedAgentId === me.id,
      );
    if (status) items = items.filter((d) => d.status === status);
    if (q)
      items = items.filter(
        (d) => d.caseNumber.toLowerCase().includes(q) || d.parcelDagNo.toLowerCase().includes(q),
      );
    items.sort((a, b) => b.filedAt.localeCompare(a.filedAt));
    return HttpResponse.json(paginate(items, url));
  }),

  http.post(`${API}/disputes`, async ({ request }) => {
    await latency();
    const me = currentUser(request);
    const body = (await request.json()) as Partial<{
      parcelId: string;
      parcelDagNo: string;
      type: string;
      priority: string;
      description: string;
      respondentName: string;
    }>;
    const seq = 418 + db.disputes.length;
    const now = new Date().toISOString();
    const parties = [{ name: me.name, role: "claimant" as const, userId: me.id }];
    if (body.respondentName?.trim())
      parties.push({ name: body.respondentName.trim(), role: "respondent" as never, userId: undefined as never });
    const dispute = {
      id: `ds-${seq}`,
      caseNumber: `DSP-2026-${String(seq).padStart(5, "0")}`,
      parcelId: body.parcelId ?? "",
      parcelDagNo: body.parcelDagNo ?? "",
      type: (body.type as never) ?? "boundary",
      status: "submitted" as const,
      priority: (body.priority as never) ?? "medium",
      filedById: me.id,
      filedByName: me.name,
      filedAt: now,
      updatedAt: now,
      description: body.description ?? "",
      parties,
      evidenceDocumentIds: [] as string[],
    };
    db.disputes.unshift(dispute);
    db.disputeEvents.push({
      id: `de-${Date.now()}`,
      disputeId: dispute.id,
      at: now,
      type: "filed",
      title: "Dispute filed",
      content: { code: "filed" },
      actorId: me.id,
      actorName: me.name,
    });

    await appendAudit({
      entityType: "dispute",
      entityId: dispute.id,
      action: "create",
      actorId: me.id,
      actorName: me.name,
      payload: { type: dispute.type, parcelDagNo: dispute.parcelDagNo },
      createdAt: now,
    });

    return HttpResponse.json(dispute, { status: 201 });
  }),

  // Field reports ----------------------------------------------------------
  http.get(`${API}/field-reports/assigned`, async ({ request }) => {
    await latency();
    const me = currentUser(request);
    const items = db.fieldReports
      .filter((v) => v.assignedAgentId === me.id)
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    return HttpResponse.json(items);
  }),

  http.post(`${API}/field-reports/:id/media`, async ({ params, request }) => {
    await latency();
    const report = db.fieldReports.find((v) => v.id === params.id);
    if (!report) return notFound("Field report not found");
    const body = (await request.json()) as {
      photo?: { url: string; caption?: string };
      gps?: { lat: number; lng: number; accuracyMeters: number; label?: string };
    };
    const now = new Date().toISOString();
    if (body.photo)
      report.photos.push({ id: `ph-${Date.now()}`, url: body.photo.url, caption: body.photo.caption, capturedAt: now });
    if (body.gps)
      report.gpsCaptures.push({
        id: `g-${Date.now()}`,
        point: { lat: body.gps.lat, lng: body.gps.lng },
        accuracyMeters: body.gps.accuracyMeters,
        label: body.gps.label,
        capturedAt: now,
      });
    return HttpResponse.json(report);
  }),

  // Additive to the frozen spec: the agent's own edits to a report they are
  // carrying out — moving it along the status ladder, saving notes, and filing
  // it. `status: "completed"` is the filing, and it runs the same gate the
  // client shows (lib/field-capture.ts) so a hand-rolled request can't skip it.
  http.patch(`${API}/field-reports/:id`, async ({ params, request }) => {
    await latency();
    const report = db.fieldReports.find((v) => v.id === params.id);
    if (!report) return notFound("Field report not found");

    const body = (await request.json()) as Partial<{
      status: FieldReportStatus;
      notes: string;
    }>;

    const notes = body.notes ?? report.notes ?? "";

    if (body.status === "completed") {
      const review = filingReview(report, notes);
      if (!review.canFile) {
        return unprocessable({ status: review.blockers[0] });
      }
      const now = new Date().toISOString();
      report.submittedAt = now;

      const actor = currentUser(request);
      await appendAudit({
        entityType: "field-report",
        entityId: report.id,
        action: "create",
        actorId: actor.id,
        actorName: actor.name,
        payload: {
          parcelDagNo: report.parcelDagNo,
          purpose: report.purpose,
          gpsCount: report.gpsCaptures.length,
          photoCount: report.photos.length,
        },
        createdAt: now,
      });

      // The booking moved the case to `field-visit-scheduled`; filing is what
      // it was waiting on, so it goes back to an officer. Only when the visit
      // is what held it up — a case that moved on since is left alone.
      const dispute = report.disputeId
        ? db.disputes.find((d) => d.id === report.disputeId)
        : undefined;
      if (dispute && dispute.status === "field-visit-scheduled") {
        const me = currentUser(request);
        dispute.status = "under-review";
        dispute.updatedAt = now;
        db.disputeEvents.push({
          id: `de-${Date.now()}`,
          disputeId: dispute.id,
          at: now,
          type: "field-visit",
          title: "Field survey filed",
          content: { code: "field-visit-completed" },
          // The agent's findings are record content — carried across as typed.
          description: notes,
          actorId: me.id,
          actorName: me.name,
        });
      }
    }

    if (body.notes !== undefined) report.notes = body.notes;
    if (body.status) report.status = body.status;

    return HttpResponse.json(report);
  }),

  http.get(`${API}/field-reports/:id`, async ({ params }) => {
    await latency();
    const report = db.fieldReports.find((v) => v.id === params.id);
    if (!report) return notFound("Field report not found");
    return HttpResponse.json({
      report,
      parcel: db.parcels.find((p) => p.id === report.parcelId) ?? null,
    });
  }),

  http.get(`${API}/field-reports`, async ({ request }) => {
    await latency();
    const url = new URL(request.url);
    const agent = url.searchParams.get("agent");
    const status = url.searchParams.get("status");
    let items = db.fieldReports.slice();
    if (agent === "me") items = items.filter((v) => v.assignedAgentId === currentUser(request).id);
    else if (agent) items = items.filter((v) => v.assignedAgentId === agent);
    if (status) items = items.filter((v) => v.status === status);
    items.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    return HttpResponse.json(paginate(items, url));
  }),

  // Two callers share this: the land office booking a survey (an agent and a
  // date are named), and an agent filing a report they carried out themselves.
  http.post(`${API}/field-reports`, async ({ request }) => {
    await latency();
    const me = currentUser(request);
    const body = (await request.json()) as Partial<{
      parcelId: string;
      parcelDagNo: string;
      disputeId: string;
      mutationId: string;
      purpose: string;
      assignedAgentId: string;
      scheduledFor: string;
      addressHint: string;
      notes: string;
    }>;
    const now = new Date().toISOString();
    const booked = Boolean(body.assignedAgentId);
    const purpose = body.purpose ?? "measurement";
    const report = {
      id: `fr-${Date.now()}`,
      parcelId: body.parcelId ?? "",
      parcelDagNo: body.parcelDagNo ?? "",
      disputeId: body.disputeId || undefined,
      mutationId: body.mutationId || undefined,
      purpose: purpose as never,
      status: (booked ? "assigned" : "completed") as never,
      assignedAgentId: body.assignedAgentId || me.id,
      scheduledFor: body.scheduledFor || now,
      submittedAt: booked ? undefined : now,
      addressHint: body.addressHint || undefined,
      gpsCaptures: [],
      photos: [],
      notes: body.notes,
    };
    db.fieldReports.unshift(report);

    // Booking a survey against an open dispute moves the case along and shows
    // up on its tracking timeline, same as the real workflow.
    const dispute = body.disputeId
      ? db.disputes.find((d) => d.id === body.disputeId)
      : undefined;
    if (booked && dispute) {
      const agent = db.users.find((u) => u.id === body.assignedAgentId);
      dispute.assignedAgentId = report.assignedAgentId;
      dispute.status = "field-visit-scheduled";
      dispute.updatedAt = now;
      db.disputeEvents.push({
        id: `de-${Date.now()}`,
        disputeId: dispute.id,
        at: now,
        type: "field-visit",
        title: "Field visit scheduled",
        content: { code: "field-visit-scheduled" },
        description: `${agent?.name ?? "A field agent"} is booked for a ${purpose.replace(/-/g, " ")} on ${report.parcelDagNo}.`,
        actorId: me.id,
        actorName: me.name,
      });
    }

    return HttpResponse.json(report, { status: 201 });
  }),

  // Hearings ---------------------------------------------------------------
  http.patch(`${API}/hearings/:id/ruling`, async ({ params, request }) => {
    await latency();
    const hearing = db.hearings.find((h) => h.id === params.id);
    if (!hearing) return notFound("Hearing not found");
    const { ruling } = (await request.json()) as { ruling: string };

    // The same gate the client shows (lib/hearings.ts), so a hand-rolled
    // request can't enter a ruling against a party who was never heard.
    const review = rulingGate(hearing, ruling ?? "");
    if (!review.canRule) return unprocessable({ ruling: review.blockers[0] });

    const now = new Date().toISOString();
    hearing.ruling = ruling;
    hearing.status = "ruled";
    hearing.ruledAt = now;

    const actor = currentUser(request);
    await appendAudit({
      entityType: "hearing",
      entityId: hearing.id,
      action: "ruling",
      actorId: actor.id,
      actorName: actor.name,
      payload: { caseNumber: hearing.caseNumber, ruling },
      createdAt: now,
    });

    // A ruling is what closes the dispute the hearing was convened over —
    // without this the case would sit in mediation forever with a decided
    // hearing hanging off it.
    const dispute = db.disputes.find((d) => d.id === hearing.disputeId);
    if (dispute && !isClosed(dispute.status)) {
      dispute.status = "resolved";
      // The ruling text is the resolution — record content, stored as typed.
      dispute.resolution = ruling;
      dispute.updatedAt = now;
      db.disputeEvents.push({
        id: `de-${Date.now()}`,
        disputeId: dispute.id,
        at: now,
        type: "resolved",
        title: "Ruling issued",
        content: { code: "ruled" },
        description: ruling,
        actorId: actor.id,
        actorName: actor.name,
      });

      // The people whose land it is find out from the app, not from the
      // mediator's own screen. The ruling text is deliberately not in the
      // notification: it is record content, and the case is where it is read.
      for (const userId of disputeAudience(dispute, actor.id)) {
        db.notifications.unshift({
          id: `n-${Date.now()}-${userId}`,
          userId,
          at: now,
          severity: "info",
          title: "Ruling issued",
          body: `A ruling has been issued on case ${dispute.caseNumber}.`,
          content: { code: "dispute-ruled", caseNumber: dispute.caseNumber },
          read: false,
          href: `/disputes/${dispute.id}`,
        });
      }
    }

    return HttpResponse.json(hearing);
  }),

  // Additive to the frozen spec: recording what happened in a sitting. The
  // ruling gate reads these, so this is the write that unblocks a decision.
  http.post(`${API}/hearings/:id/sessions`, async ({ params, request }) => {
    await latency();
    const hearing = db.hearings.find((h) => h.id === params.id);
    if (!hearing) return notFound("Hearing not found");

    // A decided case takes no further sittings. The screen already hides the
    // form; this is what makes it true of the record and not just the UI.
    if (hearing.status === "ruled" || hearing.status === "appealed") {
      return unprocessable({ status: { code: "already-decided" } });
    }

    const body = (await request.json()) as Partial<{
      summary: string;
      attendees: string[];
    }>;
    const summary = body.summary?.trim();
    if (!summary) return unprocessable({ summary: { code: "need-summary" } });

    const now = new Date().toISOString();
    hearing.sessions.push({
      id: `s-${Date.now()}`,
      at: now,
      summary,
      attendees: body.attendees ?? [],
    });
    // A case with a sitting on record is being heard, not merely scheduled.
    if (hearing.status === "scheduled") hearing.status = "in-hearing";

    // A sitting is a public step in the case, so it belongs on the tracking
    // timeline the citizen watches — not only in the mediator's own view.
    const dispute = db.disputes.find((d) => d.id === hearing.disputeId);
    if (dispute && !isClosed(dispute.status)) {
      const me = currentUser(request);
      dispute.status = "in-mediation";
      dispute.updatedAt = now;
      db.disputeEvents.push({
        id: `de-${Date.now()}`,
        disputeId: dispute.id,
        at: now,
        type: "hearing",
        title: "Hearing held",
        content: { code: "hearing-held", ordinal: hearing.sessions.length },
        // The mediator's summary is record content — carried across as typed.
        description: summary,
        actorId: me.id,
        actorName: me.name,
      });
    }

    return HttpResponse.json(hearing, { status: 201 });
  }),

  http.get(`${API}/hearings/:id`, async ({ params }) => {
    await latency();
    const hearing = db.hearings.find((h) => h.id === params.id);
    if (!hearing) return notFound("Hearing not found");
    return HttpResponse.json({
      hearing,
      dispute: db.disputes.find((d) => d.id === hearing.disputeId) ?? null,
    });
  }),

  http.get(`${API}/hearings`, async ({ request }) => {
    await latency();
    const url = new URL(request.url);
    const mediator = url.searchParams.get("mediator");
    const status = url.searchParams.get("status");
    let items = db.hearings.slice();
    if (mediator === "me") items = items.filter((h) => h.mediatorId === currentUser(request).id);
    else if (mediator) items = items.filter((h) => h.mediatorId === mediator);
    if (status) items = items.filter((h) => h.status === status);
    return HttpResponse.json(paginate(items, url));
  }),

  http.post(`${API}/hearings`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as Partial<{
      disputeId: string;
      parcelDagNo: string;
      parties: string[];
      hearingDate: string;
    }>;
    const me = currentUser(request);
    const seq = 45 + db.hearings.length;
    const hearing = {
      id: `h-${Date.now()}`,
      caseNumber: `HRG-2026-${String(seq).padStart(4, "0")}`,
      disputeId: body.disputeId ?? "",
      parcelDagNo: body.parcelDagNo ?? "",
      mediatorId: me.id,
      status: "scheduled" as const,
      parties: body.parties ?? [],
      hearingDate: body.hearingDate,
      sessions: [],
    };
    db.hearings.unshift(hearing);

    const now = new Date().toISOString();
    await appendAudit({
      entityType: "hearing",
      entityId: hearing.id,
      action: "create",
      actorId: me.id,
      actorName: me.name,
      payload: { caseNumber: hearing.caseNumber, parcelDagNo: hearing.parcelDagNo },
      createdAt: now,
    });

    // Convening a hearing moves the case, the same way booking a survey does.
    const dispute = db.disputes.find((d) => d.id === hearing.disputeId);
    if (dispute && !isClosed(dispute.status)) {
      dispute.assignedMediatorId = me.id;
      dispute.status = "hearing-scheduled";
      dispute.hearingDate = hearing.hearingDate;
      dispute.updatedAt = now;
      db.disputeEvents.push({
        id: `de-${Date.now()}`,
        disputeId: dispute.id,
        at: now,
        type: "hearing",
        title: "Hearing scheduled",
        content: { code: "status-change", status: "hearing-scheduled" },
        actorId: me.id,
        actorName: me.name,
      });

      for (const userId of disputeAudience(dispute, me.id)) {
        db.notifications.unshift({
          id: `n-${Date.now()}-${userId}`,
          userId,
          at: now,
          severity: "info",
          title: "Hearing scheduled",
          body: `Case ${dispute.caseNumber} has been listed for hearing by the mediator.`,
          content: { code: "hearing-scheduled", caseNumber: dispute.caseNumber },
          read: false,
          href: `/disputes/${dispute.id}`,
        });
      }
    }

    return HttpResponse.json(hearing, { status: 201 });
  }),

  // Inheritance ------------------------------------------------------------
  http.post(`${API}/inheritance/calculate`, async ({ request }) => {
    await latency();
    const input = (await request.json()) as Parameters<typeof calcInheritance>[0];
    return HttpResponse.json(calcInheritance(input));
  }),

  // Audit ------------------------------------------------------------------
  http.get(`${API}/audit/verify`, async () => {
    await latency();
    return HttpResponse.json(await verifyAuditChain());
  }),

  // Full ledger (admin). Additive to the frozen spec's per-entity + verify routes.
  http.get(`${API}/audit`, async () => {
    await latency();
    const chain = await getAuditChain();
    return HttpResponse.json([...chain].reverse());
  }),

  http.get(`${API}/audit/:entityType/:id`, async ({ params }) => {
    await latency();
    const chain = await getAuditChain();
    const events = chain
      .filter((e) => e.entityType === params.entityType && e.entityId === params.id)
      .reverse();
    return HttpResponse.json(events);
  }),

  // Notifications ----------------------------------------------------------
  http.get(`${API}/notifications`, async ({ request }) => {
    await latency();
    const me = currentUser(request);
    const items = db.notifications
      .filter((n) => n.userId === me.id)
      .sort((a, b) => b.at.localeCompare(a.at));
    return HttpResponse.json(items);
  }),

  http.post(`${API}/notifications/read-all`, async ({ request }) => {
    const me = currentUser(request);
    db.notifications.filter((n) => n.userId === me.id).forEach((n) => (n.read = true));
    return HttpResponse.json({ ok: true });
  }),

  http.post(`${API}/notifications/:id/read`, async ({ params }) => {
    const n = db.notifications.find((x) => x.id === params.id);
    if (!n) return notFound("Notification not found");
    n.read = true;
    return HttpResponse.json(n);
  }),

  // Admin ------------------------------------------------------------------
  http.get(`${API}/users`, async ({ request }) => {
    await latency();
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const q = url.searchParams.get("q")?.toLowerCase();
    let items = db.users.slice();
    if (role) items = items.filter((u) => u.role === role);
    if (q)
      items = items.filter(
        (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    return HttpResponse.json(paginate(items, url));
  }),

  http.get(`${API}/policies`, async () => {
    await latency();
    return HttpResponse.json(db.policies);
  }),

  http.patch(`${API}/policies`, async ({ request }) => {
    await latency();
    const updates = (await request.json()) as Partial<Policy>;
    // Recorded as before/after: a fee or a threshold changing is exactly the
    // kind of thing someone later needs to date precisely.
    const before = { ...db.policies };
    Object.assign(db.policies, updates);

    const me = currentUser(request);
    await appendAudit({
      entityType: "policy",
      entityId: "policies",
      action: "update",
      actorId: me.id,
      actorName: me.name,
      payload: changedFields(before, { ...db.policies }),
    });

    return HttpResponse.json(db.policies);
  }),
];
