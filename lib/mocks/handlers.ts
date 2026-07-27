/**
 * MSW request handlers — a mock of the frozen PlotGuard Core API. Response shapes
 * match the planned NestJS backend exactly, so swapping MSW for the live API is a
 * config change (see lib/api-client.ts), not a rewrite. Paths after the /api base
 * mirror the frozen spec. Writes mutate the in-memory arrays for the session.
 */
import { http, HttpResponse, delay } from "msw";
import type { Jurisdiction, JurisdictionLevel, Paginated, Role, User } from "@/lib/types";
import { ROLES } from "@/lib/types";
import { calcInheritance } from "@/lib/inheritance";
import { deletionGate, reviewDraft } from "@/lib/jurisdictions";
import * as db from "./data";
import { getAuditChain, verifyAuditChain } from "./audit-chain";

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

    Object.assign(target, draft);
    return HttpResponse.json(target);
  }),

  http.delete(`${API}/jurisdictions/:id`, async ({ params }) => {
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

    db.jurisdictions.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // Parcels ----------------------------------------------------------------
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
    return HttpResponse.json({
      parcel,
      ownership: db.ownershipRecords.filter((o) => o.parcelId === parcel.id),
      documents: db.documents.filter((d) => d.parcelId === parcel.id),
      disputes: db.disputes.filter((d) => d.parcelId === parcel.id),
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

    let items = db.parcels.slice();
    if (owner === "me") items = items.filter((p) => p.ownerId === currentUser(request).id);
    else if (owner) items = items.filter((p) => p.ownerId === owner);
    if (status) items = items.filter((p) => p.registryStatus === status);
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
          p.ownerName.toLowerCase().includes(q),
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
  http.patch(`${API}/mutations/:id/decision`, async ({ params, request }) => {
    await latency();
    const mutation = db.mutations.find((m) => m.id === params.id);
    if (!mutation) return notFound("Mutation not found");
    const { decision } = (await request.json()) as { decision: "approve" | "reject" };
    mutation.status = decision === "approve" ? "approved" : "rejected";
    mutation.decidedAt = new Date().toISOString();
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

  http.post(`${API}/mutations`, async ({ request }) => {
    await latency();
    const me = currentUser(request);
    const body = (await request.json()) as Partial<{
      parcelId: string;
      parcelDagNo: string;
      type: string;
      toOwnerName: string;
      fromOwnerName: string;
    }>;
    const seq = 1211 + db.mutations.length;
    const mutation = {
      id: `m-${seq}`,
      mutationNumber: `MUT-2026-${String(seq).padStart(5, "0")}`,
      parcelId: body.parcelId ?? "",
      parcelDagNo: body.parcelDagNo ?? "",
      type: (body.type as never) ?? "sale",
      status: "submitted" as const,
      fromOwnerName: body.fromOwnerName ?? me.name,
      toOwnerName: body.toOwnerName ?? "",
      requestedById: me.id,
      requestedAt: new Date().toISOString(),
      documentIds: [] as string[],
      objections: [],
    };
    db.mutations.unshift(mutation);
    return HttpResponse.json(mutation, { status: 201 });
  }),

  // Disputes ---------------------------------------------------------------
  http.patch(`${API}/disputes/:id/status`, async ({ params, request }) => {
    await latency();
    const dispute = db.disputes.find((d) => d.id === params.id);
    if (!dispute) return notFound("Dispute not found");
    const { status } = (await request.json()) as { status: string };
    dispute.status = status as never;
    dispute.updatedAt = new Date().toISOString();
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
    hearing.ruling = ruling;
    hearing.status = "ruled";
    hearing.ruledAt = new Date().toISOString();
    return HttpResponse.json(hearing);
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
    return HttpResponse.json({
      mutationFeeBdt: 5400,
      objectionWindowDays: 15,
      fraudScoreThreshold: 0.5,
    });
  }),
];
