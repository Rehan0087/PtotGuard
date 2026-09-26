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
  Mutation,
  MutationStatus,
  MutationVerificationChecklist,
  OwnershipRecord,
  Paginated,
  Policy,
  RestrictionType,
  Role,
  ServiceApplication,
  User,
} from "@/lib/types";
import { ROLES } from "@/lib/types";
import {
  ACQUISITION_TYPE_BY_MUTATION_TYPE,
  activeRestrictions,
  ancestryOf,
  assessLandTax,
  calcInheritance,
  deletionGate,
  descendantIds,
  disputeTransition,
  executionGate,
  hearingTransition,
  isHearingOpen,
  passwordResetGate,
  roleChangeGate,
  extractionReview,
  filingReview,
  analyzeGpsTrack,
  normaliseUlpin,
  maskNationalId,
  mutationActionGate,
  mutationDocumentGate,
  mutationObjectionSummary,
  mutationVerificationReferences,
  rankCandidates,
  recordRegistryStatus,
  registryStatusAfter,
  reviewFieldReportTransition,
  reviewFieldSurveyTransition,
  reviewDraft,
  routeDisputeToOfficer,
  rulingGate,
  toPublicParcel,
  transferReview,
  verificationGate,
  type LandTaxRates,
  type RulingOutcome,
  type GpsPointInput,
  type AcquisitionDetails,
  acquisitionTransition,
  validIncreasedAward,

  routeGrievance,
  shouldEscalateGrievance,
  type GrievanceCategory,
} from "@plotguard/rules";
import * as db from "./data";
import { appendAudit, getAuditChain, verifyAuditChain } from "./audit-chain";
import { DEMO_PASSWORD } from "../demo-accounts";
import { hydrateMutationState } from "./mutation-store";
import { hydrateProfileState, persistProfileState } from "./profile-store";
import { applyMockProfileUpdate, MockProfileUpdateError } from "../field-profile";
import { filterMutationReads } from "./mutation-contract.mjs";
import { filterLandOfficeRecords, recordAuditEvents } from "./records-contract.mjs";
import {
  appendMockGpsPoints,
  MockSurveyValidationError,
  MockSyncConflict,
  runMockIdempotent,
} from "./field-survey-sync-contract";

// Restore mutation-owned preview state before any handler (including parcel
// reads) can observe the in-memory seed after a hard refresh.
hydrateMutationState();
hydrateProfileState(db.users);

// --- helpers ---------------------------------------------------------------

async function latency() {
  await delay(180 + Math.random() * 300);
}

function getRole(request: Request): Role {
  // Normal signed-in requests identify the actor through the bearer token.
  // The role header exists only for legacy/demo calls and is not sent by the
  // frontend after login.
  const authenticated = authenticatedUser(request);
  if (authenticated) return authenticated.role;
  const header = request.headers.get("x-plotguard-role");
  return (ROLES as string[]).includes(header ?? "") ? (header as Role) : "citizen";
}

function currentUser(request: Request): User {
  const authenticated = authenticatedUser(request);
  if (authenticated) return authenticated;
  const id = db.CURRENT_USER_BY_ROLE[getRole(request)];
  return db.users.find((u) => u.id === id)!;
}

function completeMockAcquisition(
  application: ServiceApplication,
  details: AcquisitionDetails,
  actorId: string,
  title: string,
) {
  const parcel = db.parcels.find((candidate) => candidate.id === application.parcelId);
  if (!parcel) throw new Error("Acquisition parcel is missing from the mock store");
  const now = new Date().toISOString();
  if (!db.users.some((user) => user.id === "usr-state")) {
    db.users.push({
      id: "usr-state",
      name: "Government of Bangladesh",
      email: "state.owner@plotguard.gov.bd",
      role: "land-office",
      jurisdictionId: parcel.jurisdictionId,
      status: "suspended",
      title: "State-owned property account",
      createdAt: now,
    });
  }
  for (const record of db.ownershipRecords) {
    if (record.parcelId === parcel.id && !record.toDate) record.toDate = now;
  }
  db.ownershipRecords.unshift({
    id: `own-${Date.now()}`,
    parcelId: parcel.id,
    ownerId: "usr-state",
    ownerName: "Government of Bangladesh",
    acquisitionType: "state-acquisition",
    fromDate: now,
    toDate: null,
  });
  parcel.ownerId = "usr-state";
  parcel.ownerName = "Government of Bangladesh";
  parcel.ownershipType = "government";
  parcel.lastMutationAt = now;
  for (const restriction of db.parcelRestrictions) {
    if (restriction.parcelId === parcel.id && restriction.type === "acquisition" && restriction.referenceNo === application.applicationNo && !restriction.toDate) restriction.toDate = now;
  }
  application.status = "approved";
  application.details = { ...details, stage: "completed", completedAt: now } satisfies AcquisitionDetails;
  application.decidedAt = now;
  application.updatedAt = now;
  db.serviceApplicationEvents.push({
    id: `sae-${Date.now()}`, applicationId: application.id, at: now,
    type: "accepted", title, actorId,
  });
  db.notifications.unshift({
    id: `ntf-${Date.now()}`, userId: application.applicantId, at: now, severity: "success",
    title: "Land acquisition completed",
    body: `${application.applicationNo} is complete. Ownership is now recorded as state-owned property.`,
    read: false, href: "/acquisition",
  });
}

function authenticatedUser(
  request: Request,
  expectedType: "access" | "refresh" = "access",
): User | null {
  const match = request.headers.get("authorization")?.match(/^Bearer mock\.([^.]+)\.(access|refresh)$/);
  if (!match || match[2] !== expectedType) return null;
  return db.users.find((user) => user.id === match[1]) ?? null;
}

function mutationReadActor(request: Request): User | null {
  const header = request.headers.get("x-plotguard-role");
  if (header && !(ROLES as string[]).includes(header)) return null;
  const actor = currentUser(request);
  return actor.status === "active" && (actor.role === "citizen" || actor.role === "land-office")
    ? actor
    : null;
}

const HEARING_STATUS_VALUES: string[] = [
  "scheduled",
  "in-hearing",
  "deliberation",
  "ruled",
  "appealed",
  "closed",
];

const DISPUTE_STATUS_VALUES: string[] = [
  "submitted",
  "under-land-office-review",
  "field-verified",
  "forwarded-to-settlement",
  "hearing-scheduled",
  "decided",
  "rejected",
  "withdrawn",
];

function badRequest(message = "Bad Request") {
  return HttpResponse.json({ error: "bad_request", message }, { status: 400 });
}

function isActiveLandOffice(user: User): boolean {
  return user.role === "land-office" && user.status === "active";
}

function coveredJurisdictionIds(user: User): Set<string> {
  return new Set([
    user.jurisdictionId,
    ...descendantIds(user.jurisdictionId, db.jurisdictions),
  ]);
}

function mutationParcel(mutation: Mutation) {
  return db.parcels.find((parcel) => parcel.id === mutation.parcelId);
}

function mutationActionAccess(mutation: Mutation, actor: User) {
  if (!isActiveLandOffice(actor)) {
    return forbidden("Land Office Staff access required.");
  }
  if (mutation.assignedOfficerId && mutation.assignedOfficerId !== actor.id) {
    return forbidden("This mutation is assigned to another officer.");
  }
  const parcel = mutationParcel(mutation);
  if (!parcel) return notFound("Parcel not found");
  if (!coveredJurisdictionIds(actor).has(parcel.jurisdictionId)) {
    return forbidden("This mutation is outside your jurisdiction.");
  }
  return null;
}

function transitionError(
  mutation: Mutation,
  actor: User,
  now: Date,
  action: "canStartVerification" | "canCompleteVerification" | "canApprove" | "canReject",
  expected: MutationStatus[],
  mediationStatus?: DisputeStatus | null,
) {
  const gate = mutationActionGate(mutation, actor.id, now, mediationStatus);
  if (gate.hold?.code === "already-decided") {
    return conflict("This mutation has already been decided.");
  }
  if (gate[action]) return null;

  const transitionAlreadyApplied =
    (action === "canStartVerification" && ["under-primary-verification", "field-investigation"].includes(mutation.status))
    || (action === "canCompleteVerification" && mutation.status === "field-investigation");
  if (transitionAlreadyApplied) {
    return conflict("This mutation has already moved past that workflow transition.");
  }

  const reason = gate.hold?.code === "wrong-status" || !gate.hold
    ? { code: "wrong-status", expected }
    : gate.hold;
  return unprocessable({ status: reason });
}

const MUTATION_TYPES = ["sale", "inheritance", "gift", "partition", "correction"] as const;
const PAYMENT_METHODS = ["bkash", "nagad", "card"] as const;
const VERIFICATION_FIELDS = [
  "applicantVerified",
  "previousOwnerVerified",
  "proposedOwnerVerified",
  "dagKhatianVerified",
  "deedVerified",
  "landRecordMatched",
  "documentsPresent",
  "khajnaReceiptVerified",
] as const;

type CreateMutationBody = {
  parcelId: string;
  type: Mutation["type"];
  toOwnerId: string;
  deedNumber?: string;
  deedDate?: string;
  documentIds?: string[];
  paymentMethod: "bkash" | "nagad" | "card";
};

function recordBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function unexpectedProperty(body: Record<string, unknown>, allowed: readonly string[]): string | null {
  return Object.keys(body).find((key) => !allowed.includes(key)) ?? null;
}

function validateCreateMutationBody(value: unknown) {
  const body = recordBody(value);
  if (!body) return { ok: false as const, response: badRequest("Request body must be an object.") };
  const extra = unexpectedProperty(body, ["parcelId", "type", "toOwnerId", "deedNumber", "deedDate", "documentIds", "paymentMethod"]);
  if (extra) return { ok: false as const, response: badRequest(`property ${extra} should not exist`) };
  if (typeof body.parcelId !== "string") return { ok: false as const, response: badRequest("parcelId must be a string") };
  if (!MUTATION_TYPES.includes(body.type as typeof MUTATION_TYPES[number])) {
    return { ok: false as const, response: badRequest(`type must be one of the following values: ${MUTATION_TYPES.join(", ")}`) };
  }
  if (typeof body.toOwnerId !== "string") return { ok: false as const, response: badRequest("toOwnerId must be a string") };
  if (!PAYMENT_METHODS.includes(body.paymentMethod as typeof PAYMENT_METHODS[number])) {
    return { ok: false as const, response: badRequest(`paymentMethod must be one of the following values: ${PAYMENT_METHODS.join(", ")}`) };
  }
  if (body.deedNumber !== undefined && body.deedNumber !== null && typeof body.deedNumber !== "string") {
    return { ok: false as const, response: badRequest("deedNumber must be a string") };
  }
  if (body.deedDate !== undefined && body.deedDate !== null && typeof body.deedDate !== "string") {
    return { ok: false as const, response: badRequest("deedDate must be a string") };
  }
  if (body.documentIds !== undefined && body.documentIds !== null && (!Array.isArray(body.documentIds) || body.documentIds.some((id) => typeof id !== "string"))) {
    return { ok: false as const, response: badRequest("each value in documentIds must be a string") };
  }
  return { ok: true as const, value: {
    parcelId: body.parcelId,
    type: body.type,
    toOwnerId: body.toOwnerId,
    deedNumber: typeof body.deedNumber === "string" ? body.deedNumber : undefined,
    deedDate: typeof body.deedDate === "string" ? body.deedDate : undefined,
    documentIds: Array.isArray(body.documentIds) ? body.documentIds as string[] : undefined,
    paymentMethod: body.paymentMethod,
  } as CreateMutationBody };
}

function validateVerificationBody(value: unknown) {
  const body = recordBody(value);
  if (!body) return { ok: false as const, response: badRequest("Request body must be an object.") };
  const extra = unexpectedProperty(body, [...VERIFICATION_FIELDS, "notes"]);
  if (extra) return { ok: false as const, response: badRequest(`property ${extra} should not exist`) };
  for (const field of VERIFICATION_FIELDS) {
    if (typeof body[field] !== "boolean") {
      return { ok: false as const, response: badRequest(`${field} must be a boolean value`) };
    }
  }
  if (typeof body.notes !== "string") return { ok: false as const, response: badRequest("notes must be a string") };
  if (!/\S/.test(body.notes)) return { ok: false as const, response: badRequest("notes must contain non-whitespace characters") };
  const checklist = Object.fromEntries(VERIFICATION_FIELDS.map((field) => [field, body[field]])) as unknown as MutationVerificationChecklist;
  return { ok: true as const, value: { checklist, notes: body.notes.trim() } };
}

function validateDecisionBody(value: unknown) {
  const body = recordBody(value);
  if (!body) return { ok: false as const, response: badRequest("Request body must be an object.") };
  const extra = unexpectedProperty(body, ["decision", "rejectionReason", "approvalNote", "orderSheet", "digitalSignature"]);
  if (extra) return { ok: false as const, response: badRequest(`property ${extra} should not exist`) };
  if (body.decision !== "approve" && body.decision !== "reject") {
    return { ok: false as const, response: badRequest("decision must be one of the following values: approve, reject") };
  }
  if (body.decision === "reject") {
    if (typeof body.rejectionReason !== "string") {
      return { ok: false as const, response: badRequest("rejectionReason must be a string") };
    }
    if (!/\S/.test(body.rejectionReason)) {
      return { ok: false as const, response: badRequest("rejectionReason must contain non-whitespace characters") };
    }
  }
  if (body.decision === "approve" && body.approvalNote !== undefined && body.approvalNote !== null && typeof body.approvalNote !== "string") {
    return { ok: false as const, response: badRequest("approvalNote must be a string") };
  }
  if (body.decision === "approve" && (typeof body.orderSheet !== "string" || !/\S/.test(body.orderSheet))) {
    return { ok: false as const, response: badRequest("orderSheet is required") };
  }
  if (body.decision === "approve" && (typeof body.digitalSignature !== "string" || !/\S/.test(body.digitalSignature))) {
    return { ok: false as const, response: badRequest("digitalSignature is required") };
  }
  return { ok: true as const, value: {
    decision: body.decision,
    rejectionReason: typeof body.rejectionReason === "string" ? body.rejectionReason : undefined,
    approvalNote: typeof body.approvalNote === "string" ? body.approvalNote : undefined,
    orderSheet: typeof body.orderSheet === "string" ? body.orderSheet : undefined,
    digitalSignature: typeof body.digitalSignature === "string" ? body.digitalSignature : undefined,
  } };
}

function paginate<T>(items: T[], url: URL): Paginated<T> {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.max(1, Number(url.searchParams.get("pageSize") ?? "20"));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

/** Mirrors bound() in audit.controller.ts: a date-only `to` covers that whole day. */
function auditBound(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function notFound(message = "Not found") {
  return HttpResponse.json({ error: "not_found", message }, { status: 404 });
}

function unauthorized(message = "Authentication required") {
  return HttpResponse.json({ error: "unauthorized", message }, { status: 401 });
}

/**
 * Mirrors @Roles() on the real controller: the same refusal, in the same
 * shape, so a screen that works against the fixture API works against the
 * real one and a screen that is refused is refused by both.
 */
function requireRole(request: Request, ...roles: User["role"][]) {
  return roles.includes(currentUser(request).role)
    ? null
    : forbidden("This portal is restricted to the assigned role");
}

function forbidden(message = "This portal is restricted to the assigned role") {
  return HttpResponse.json({ error: "forbidden", message }, { status: 403 });
}

/**
 * A write refused because the body itself is wrong. `reason` carries the rule's
 * structured code so the client can word the refusal in the reader's language;
 * `message` stays as an English fallback for logs and unknown codes.
 */
function unprocessable(errors: Record<string, ({ code: string } & Record<string, unknown>) | undefined>) {
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

/** Mirrors GrievancesController.escalateOverdue() — runs before any grievance read. */
async function escalateOverdueGrievances(now: Date = new Date()) {
  const admin = db.users
    .filter((u) => u.role === "admin" && u.status === "active")
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!admin) return;
  for (const grievance of db.grievances) {
    if (!shouldEscalateGrievance(grievance, now)) continue;
    const at = now.toISOString();
    const from = grievance.status;
    Object.assign(grievance, { status: "escalated", escalatedToId: admin.id, escalatedAt: at, updatedAt: at });
    db.grievanceEvents.push({
      id: `ge-${crypto.randomUUID()}`, grievanceId: grievance.id, at, type: "escalated",
      title: "Escalated — response deadline missed",
      description: `No resolution by the deadline, so the complaint was passed to ${admin.name}.`,
      actorName: "System",
    });
    await appendAudit({ entityType: "grievance", entityId: grievance.id, action: "status-change", actorId: admin.id, actorName: "System", payload: { from, to: "escalated", reason: "sla-missed", automatic: true } });
    db.notifications.unshift(
      { id: `n-${crypto.randomUUID()}`, userId: admin.id, at, severity: "warning", title: "Grievance escalated to you", body: `${grievance.caseNumber} missed its response deadline and needs your attention.`, read: false, href: `/grievances/${grievance.id}` },
      { id: `n-${crypto.randomUUID()}`, userId: grievance.filedById, at, severity: "info", title: "Your complaint was escalated", body: `${grievance.caseNumber} was not resolved in time, so it has been passed to an administrator.`, read: false, href: `/grievances/${grievance.id}` },
    );
  }
}

/** Mirrors assertAdministrator() in GrievancesController, plus its not-decided guard. */
function grievanceForHandler(id: string, request: Request) {
  const denied = requireRole(request, "admin");
  if (denied) return denied;
  const me = currentUser(request);
  const grievance = db.grievances.find((g) => g.id === id);
  if (!grievance) return notFound("Grievance not found");
  if (grievance.status === "resolved" || grievance.status === "dismissed") {
    return conflict("This grievance has already been decided.");
  }
  return { grievance, me };
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
  return status === "decided" || status === "rejected" || status === "withdrawn";
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
  appointment: "APT",
};

// --- handlers --------------------------------------------------------------

export const handlers = [
  // Auth -------------------------------------------------------------------
  http.post(`${API}/auth/login`, async ({ request }) => {
    await latency();
    const body = (await request.json()) as { email?: string; password?: string };
    const normalizedEmail = body.email?.trim().toLowerCase();
    const user = db.users.find((candidate) => candidate.email.toLowerCase() === normalizedEmail);
    // Mirrors auth.controller.ts: suspended refuses, an invitation is taken
    // up by using it. The password itself stays the fixture one here — the
    // mock has never checked a real hash.
    if (!user || user.status === "suspended" || body.password !== DEMO_PASSWORD) {
      return unauthorized("Invalid email or password");
    }
    if (user.status === "invited") user.status = "active";
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
    const body = (await request.json()) as { refreshToken?: string };
    const tokenRequest = new Request(request.url, {
      headers: { authorization: `Bearer ${body.refreshToken ?? ""}` },
    });
    const user = authenticatedUser(tokenRequest, "refresh");
    if (!user || !body.refreshToken?.endsWith(".refresh")) return unauthorized("Session expired or invalid");
    return HttpResponse.json({
      accessToken: `mock.${user.id}.access`,
      refreshToken: `mock.${user.id}.refresh`,
      expiresIn: 3600,
    });
  }),

  http.get(`${API}/auth/me`, async ({ request }) => {
    await latency();
    const user = authenticatedUser(request);
    if (!user) return unauthorized();
    const jurisdiction = db.jurisdictions.find((j) => j.id === user.jurisdictionId) ?? null;
    return HttpResponse.json({ user, jurisdiction });
  }),

  http.patch(`${API}/auth/me`, async ({ request }) => {
    await latency();
    const user = authenticatedUser(request);
    if (!user) return unauthorized();
    const body = (await request.json()) as Record<string, unknown>;

    if (user.role === "field-agent") {
      try {
        const updated = applyMockProfileUpdate(db.users, user.id, body);
        persistProfileState(db.users);
        return HttpResponse.json(updated);
      } catch (error) {
        if (error instanceof MockProfileUpdateError) {
          if (error.status === 404) return notFound("User not found");
          if (error.status === 409) {
            return conflict("This email address is already used by another account", {
              code: error.code,
            });
          }
          return badRequest("Field profile update is invalid");
        }
        throw error;
      }
    }

    const allowed = new Set([
      "name", "email", "phone", "avatarUrl", "currentAddress", "emergencyContact", "profileDetails",
    ]);
    if (Object.keys(body).some((key) => !allowed.has(key))) return badRequest("Profile update contains a managed field");

    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;
    const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
    if (body.name !== undefined && (!name || name.length < 2 || name.length > 100)) return badRequest("Name must be between 2 and 100 characters");
    if (body.email !== undefined && (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return badRequest("Enter a valid email address");
    if (body.phone !== undefined && (phone === undefined || phone.length > 32)) return badRequest("Enter a valid phone number");
    if (email && db.users.some((candidate) => candidate.id !== user.id && candidate.email.toLowerCase() === email)) {
      return conflict("This email address is already used by another account", { code: "email-in-use" });
    }

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone || undefined;
    if (typeof body.avatarUrl === "string") user.avatarUrl = body.avatarUrl.trim() || undefined;
    if (body.profileDetails && typeof body.profileDetails === "object") {
      user.profileDetails = {
        ...(user.profileDetails ?? {}),
        ...(body.profileDetails as Record<string, string>),
      };
    }

    persistProfileState(db.users);

    return HttpResponse.json(user);
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
    const denied = requireRole(request, "admin");
    if (denied) return denied;
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
    const denied = requireRole(request, "admin");
    if (denied) return denied;
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
    const denied = requireRole(request, "admin");
    if (denied) return denied;
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
        {
          ...parcel,
          registryStatus: recordRegistryStatus(
            db.mutations.filter((mutation) => mutation.parcelId === parcel.id),
            db.disputes.filter((dispute) => dispute.parcelId === parcel.id && !isClosed(dispute.status)).length,
            db.documents.some((document) => document.parcelId === parcel.id && document.verificationStatus === "flagged"),
          ),
        },
        db.parcelRestrictions.filter((r) => r.parcelId === parcel.id),
      ),
    );
  }),

  http.get(`${API}/parcels/:id/record`, async ({ params, request }) => {
    await latency();
    hydrateMutationState();
    const me = currentUser(request);
    if (!isActiveLandOffice(me)) return forbidden("Land Office Staff access required.");

    const parcel = db.parcels.find((item) => item.id === params.id);
    if (!parcel) return notFound("Parcel not found");
    if (!coveredJurisdictionIds(me).has(parcel.jurisdictionId)) {
      return forbidden("This land record is outside your jurisdiction.");
    }

    const owner = db.users.find((user) => user.id === parcel.ownerId);
    if (!owner) return notFound("Recorded owner not found");
    const documents = db.documents
      .filter((document) => document.parcelId === parcel.id)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    const documentById = new Map(documents.map((document) => [document.id, document]));
    const ownership = db.ownershipRecords
      .filter((entry) => entry.parcelId === parcel.id)
      .sort((a, b) => b.fromDate.localeCompare(a.fromDate))
      .map((entry) => {
        const mutation = entry.mutationId
          ? db.mutations.find((item) => item.id === entry.mutationId)
          : undefined;
        const document = entry.documentId ? documentById.get(entry.documentId) : undefined;
        return {
          ...entry,
          ...(mutation
            ? {
                mutation: {
                  id: mutation.id,
                  mutationNumber: mutation.mutationNumber,
                  status: mutation.status,
                  type: mutation.type,
                },
              }
            : {}),
          ...(document
            ? {
                document: {
                  id: document.id,
                  fileName: document.fileName,
                  type: document.type,
                  verificationStatus: document.verificationStatus,
                },
              }
            : {}),
        };
      });
    const mutations = db.mutations
      .filter((mutation) => mutation.parcelId === parcel.id)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
      .map((mutation) => {
        const applicant = db.users.find((user) => user.id === mutation.requestedById);
        const officerId = mutation.approvedById ?? mutation.rejectedById ?? mutation.assignedOfficerId;
        const officer = officerId ? db.users.find((user) => user.id === officerId) : undefined;
        return {
          mutation,
          ...(applicant ? { applicantName: applicant.name } : {}),
          ...(officer ? { responsibleOfficerName: officer.name } : {}),
        };
      });
    const mutationIds = mutations.map(({ mutation }) => mutation.id);
    const disputes = db.disputes
      .filter((dispute) => dispute.parcelId === parcel.id)
      .sort((a, b) => b.filedAt.localeCompare(a.filedAt));
    const chain = await getAuditChain();
    const referenceId = maskNationalId(owner.nationalId);

    return HttpResponse.json({
      parcel: {
        ...parcel,
        registryStatus: recordRegistryStatus(
          mutations.map(({ mutation }) => mutation),
          disputes.filter((dispute) => !isClosed(dispute.status)).length,
          documents.some((document) => document.verificationStatus === "flagged"),
        ),
      },
      owner: {
        id: owner.id,
        name: owner.name,
        ...(referenceId ? { referenceId } : {}),
        ...(owner.profileDetails?.address ? { address: owner.profileDetails.address } : {}),
      },
      jurisdiction: ancestryOf(parcel.jurisdictionId, db.jurisdictions),
      ownership,
      mutations,
      disputes,
      documents,
      restrictions: db.parcelRestrictions
        .filter((restriction) => restriction.parcelId === parcel.id)
        .sort((a, b) => b.fromDate.localeCompare(a.fromDate)),
      audit: recordAuditEvents({
        events: chain,
        parcelId: parcel.id,
        mutationIds,
        disputeIds: disputes.map((dispute) => dispute.id),
        documentIds: documents.map((document) => document.id),
      }),
    });
  }),

  http.get(`${API}/parcels/:id/neighbours`, async ({ params }) => {
    await latency();
    const parcel = db.parcels.find((p) => p.id === params.id);
    if (!parcel) return notFound("Parcel not found");
    const neighbours = db.parcels
      .filter((p) => p.id !== parcel.id)
      .sort((a, b) => distance(a.centroid, parcel.centroid) - distance(b.centroid, parcel.centroid))
      .slice(0, 4);
    return HttpResponse.json(neighbours.map((item) => ({
      ...item,
      registryStatus: recordRegistryStatus(
        db.mutations.filter((mutation) => mutation.parcelId === item.id),
        db.disputes.filter((dispute) => dispute.parcelId === item.id && !isClosed(dispute.status)).length,
        db.documents.some((document) => document.parcelId === item.id && document.verificationStatus === "flagged"),
      ),
    })));
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
      parcel: {
        ...parcel,
        registryStatus: recordRegistryStatus(
          db.mutations.filter((mutation) => mutation.parcelId === parcel.id),
          db.disputes.filter((dispute) => dispute.parcelId === parcel.id && !isClosed(dispute.status)).length,
          db.documents.some((document) => document.parcelId === parcel.id && document.verificationStatus === "flagged"),
        ),
      },
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
    hydrateMutationState();
    const url = new URL(request.url);
    const owner = url.searchParams.get("owner");
    const status = url.searchParams.get("status");
    const dag = url.searchParams.get("dag")?.toLowerCase();
    const khatian = url.searchParams.get("khatian")?.toLowerCase();
    const bbox = url.searchParams.get("bbox");
    const q = url.searchParams.get("q")?.trim().toLowerCase();
    const ulpin = url.searchParams.get("ulpin");

    let items = db.parcels.slice();
    const isLandOffice = getRole(request) === "land-office";
    if (isLandOffice) {
      try {
        items = filterLandOfficeRecords({
          actor: currentUser(request),
          jurisdictions: db.jurisdictions,
          parcels: items,
          mutations: db.mutations,
          disputes: db.disputes,
          documents: db.documents,
          q,
          status,
        });
      } catch {
        return forbidden("Land Office Staff access required.");
      }
    }
    if (owner === "me") items = items.filter((p) => p.ownerId === currentUser(request).id);
    else if (owner) items = items.filter((p) => p.ownerId === owner);
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
    if (q && !isLandOffice)
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
    // Keep this projection relational, like the Prisma implementation: the
    // count must reflect current dispute rows rather than a stale parcel seed.
    items = items.map((parcel) => {
      const openDisputeCount = db.disputes.filter(
        (dispute) => dispute.parcelId === parcel.id && !isClosed(dispute.status),
      ).length;
      return {
        ...parcel,
        openDisputeCount,
        registryStatus: recordRegistryStatus(
          db.mutations.filter((mutation) => mutation.parcelId === parcel.id),
          openDisputeCount,
          db.documents.some(
            (document) => document.parcelId === parcel.id && document.verificationStatus === "flagged",
          ),
        ),
      };
    });
    // Apply the status filter only after deriving the status from the same
    // mutation/dispute/document rows used by record detail.
    if (status) items = items.filter((parcel) => parcel.registryStatus === status);
    return HttpResponse.json(paginate(items, url));
  }),

  // Documents --------------------------------------------------------------
  http.post(`${API}/documents/:id/reprocess`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "land-office");
    if (denied) return denied;
    const doc = db.documents.find((d) => d.id === params.id);
    if (!doc) return notFound("Document not found");
    doc.ocrStatus = "processing";
    doc.verificationStatus = "unverified";
    // Re-queue for real, so a retry drains the same way a fresh upload does.
    scheduleOcrWorker(doc.id, doc.parcelId);
    return HttpResponse.json(doc);
  }),

  /**
   * Officer decision on a document. Mirrors DocumentsController.decide() —
   * `verify` now actually runs extractionReview() (it never did before this
   * fix — see that controller's own note), so a hand-crafted request can't
   * mark a document with missing or contradicting fields as verified.
   */
  http.patch(`${API}/documents/:id/decision`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "land-office");
    if (denied) return denied;
    const doc = db.documents.find((d) => d.id === params.id);
    if (!doc) return notFound("Document not found");
    const { decision } = (await request.json()) as {
      decision: "verify" | "reject" | "flag";
    };

    if (decision === "verify") {
      const parcel = doc.parcelId ? db.parcels.find((p) => p.id === doc.parcelId) : undefined;
      const review = extractionReview(doc, parcel);
      if (!review.canAccept) return unprocessable({ decision: review.hold! });
    }

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

    // document-verified has existed on NotificationContent with no writer
    // anywhere — the citizen finds out their document passed from the app.
    if (decision === "verify" && doc.ownerId && doc.ownerId !== me.id) {
      const dagNo = doc.parcelId ? db.parcels.find((p) => p.id === doc.parcelId)?.dagNo : undefined;
      if (dagNo) {
        db.notifications.unshift({
          id: `n-${Date.now()}`,
          userId: doc.ownerId,
          at: new Date().toISOString(),
          severity: "success",
          title: "Document verified",
          body: `Your ${doc.type.replace(/-/g, " ")} for dag ${dagNo} passed verification.`,
          content: { code: "document-verified", dagNo },
          read: false,
          href: "/documents",
        });
      }
    }

    return HttpResponse.json(doc);
  }),

  // Officer corrections to what the reader pulled off the scan. Additive to
  // the frozen spec — the digitisation station needs somewhere to put the
  // fields a human keyed in.
  http.patch(`${API}/documents/:id/fields`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "land-office");
    if (denied) return denied;
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

  /** Mirrors DocumentsController.create() — no real object storage in this phase. */
  http.post(`${API}/documents`, async ({ request }) => {
    await latency();
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
    const me = currentUser(request);
    const body = (await request.json()) as Partial<{
      parcelId: string;
      type: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }>;
    if (body.parcelId) {
      const parcel = db.parcels.find((p) => p.id === body.parcelId);
      if (!parcel || parcel.ownerId !== me.id) return notFound("Parcel not found");
    }
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
  /** Mirrors MutationsController.create() — toOwnerId names a registered account. */
  http.post(`${API}/mutations`, async ({ request }) => {
    await latency();
    hydrateMutationState();
    const parsed = validateCreateMutationBody(await request.json());
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
    const parcel = db.parcels.find((p) => p.id === body.parcelId);
    // Mirrors MutationsController.create(): only the recorded owner files.
    if (!parcel || parcel.ownerId !== currentUser(request).id) return notFound("Parcel not found");
    const toOwner = db.users.find((u) => u.id === body.toOwnerId);
    if (!toOwner || toOwner.role !== "citizen") return notFound("Recipient not found");

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
    const mutation: Mutation = {
      id: `m-${Date.now()}`,
      mutationNumber: `MUT-2026-${String(seq).padStart(5, "0")}`,
      parcelId: parcel.id,
      parcelDagNo: parcel.dagNo,
      type: body.type,
      status: "submitted" as const,
      // The registry's own fact, not the applicant's claim.
      fromOwnerName: parcel.ownerName,
      fromOwnerId: parcel.ownerId,
      toOwnerId: toOwner.id,
      toOwnerName: toOwner.name,
      requestedById: me.id,
      requestedAt: now,
      documentIds: body.documentIds ?? [],
      objections: [],
      deedNumber: body.deedNumber,
      deedDate: body.deedDate,
      fee: { amount: db.policies.mutationFeeBdt, currency: "BDT" as const },
      paymentMethod: body.paymentMethod,
      // Simulated — no gateway is called.
      transactionId: `TXN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      createdAt: now,
      updatedAt: now,
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
        newStatus: "submitted",
      },
    });
    return HttpResponse.json(mutation, { status: 201 });
  }),

  http.patch(`${API}/mutations/:id/start-verification`, async ({ params, request }) => {
    await latency();
    hydrateMutationState();
    const actor = currentUser(request);
    if (!isActiveLandOffice(actor)) return forbidden("Land Office Staff access required.");
    const mutation = db.mutations.find((item) => item.id === params.id);
    if (!mutation) return notFound("Mutation not found");
    const accessError = mutationActionAccess(mutation, actor);
    if (accessError) return accessError;

    const now = new Date();
    const gateError = transitionError(mutation, actor, now, "canStartVerification", ["submitted"]);
    if (gateError) return gateError;
    if (mutation.documentIds.length === 0) {
      return unprocessable({ documentIds: { code: "supporting-documents-required" } });
    }
    const documents = db.documents.filter((document) => mutation.documentIds.includes(document.id));
    const missing = mutation.documentIds.filter((id) => !documents.some((document) => document.id === id));
    if (missing.length) {
      return unprocessable({ documentIds: { code: "mutation-documents-missing", documentIds: missing } });
    }
    const documentReview = mutationDocumentGate(documents, "officer", db.policies.fraudScoreThreshold);
    if (!documentReview.ok) return unprocessable({ documentIds: documentReview.reason });
    const previousStatus = mutation.status;
    const at = now.toISOString();
    Object.assign(mutation, {
      status: "under-primary-verification" as const,
      assignedOfficerId: actor.id,
      verificationStartedAt: at,
      verificationStartedById: actor.id,
      updatedAt: at,
    });
    await appendAudit({
      entityType: "mutation",
      entityId: mutation.id,
      action: "status-change",
      actorId: actor.id,
      actorName: actor.name,
      payload: { previousStatus, newStatus: mutation.status, actorRole: actor.role },
    });
    return HttpResponse.json(mutation);
  }),

  http.patch(`${API}/mutations/:id/complete-verification`, async ({ params, request }) => {
    await latency();
    hydrateMutationState();
    const parsed = validateVerificationBody(await request.json());
    if (!parsed.ok) return parsed.response;
    const { checklist, notes } = parsed.value;
    const actor = currentUser(request);
    if (!isActiveLandOffice(actor)) return forbidden("Land Office Staff access required.");
    const mutation = db.mutations.find((item) => item.id === params.id);
    if (!mutation) return notFound("Mutation not found");
    const accessError = mutationActionAccess(mutation, actor);
    if (accessError) return accessError;

    const now = new Date();
    const gateError = transitionError(mutation, actor, now, "canCompleteVerification", ["under-primary-verification"]);
    if (gateError) return gateError;
    const verification = verificationGate(checklist, notes);
    if (!verification.ok) return unprocessable({ verification: verification.reason });
    const recipient = mutation.toOwnerId
      ? db.users.find((user) => user.id === mutation.toOwnerId)
      : undefined;
    const documents = db.documents.filter((document) => mutation.documentIds.includes(document.id));
    const references = mutationVerificationReferences(mutation, recipient ?? null, documents);
    if (!references.ok) {
      return unprocessable({
        [references.reason.code === "invalid-recipient" ? "toOwnerId" : "documentIds"]: references.reason,
      });
    }
    if (!Number.isInteger(db.policies.objectionWindowDays) || db.policies.objectionWindowDays < 0) {
      return unprocessable({ verification: { code: "objection-policy-unavailable" } });
    }
    const documentReview = mutationDocumentGate(documents, "officer", db.policies.fraudScoreThreshold);
    if (!documentReview.ok) return unprocessable({ documentIds: documentReview.reason });

    const previousStatus = mutation.status;
    const at = now.toISOString();
    Object.assign(mutation, {
      status: "under-primary-verification" as const,
      assignedOfficerId: actor.id,
      verifiedAt: at,
      verifiedById: actor.id,
      verificationNotes: notes,
      verificationChecklist: checklist,
      objectionStartDate: at,
      objectionWindowEndsAt: new Date(now.getTime() + db.policies.objectionWindowDays * 86_400_000).toISOString(),
      updatedAt: at,
    });
    await appendAudit({
      entityType: "mutation",
      entityId: mutation.id,
      action: "status-change",
      actorId: actor.id,
      actorName: actor.name,
      payload: { previousStatus, newStatus: mutation.status, actorRole: actor.role, note: notes },
    });
    return HttpResponse.json(mutation);
  }),

  http.patch(`${API}/mutations/:id/decision`, async ({ params, request }) => {
    await latency();
    hydrateMutationState();
    const parsed = validateDecisionBody(await request.json());
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const actor = currentUser(request);
    if (!isActiveLandOffice(actor)) return forbidden("Land Office Staff access required.");
    const mutation = db.mutations.find((item) => item.id === params.id);
    if (!mutation) return notFound("Mutation not found");
    const accessError = mutationActionAccess(mutation, actor);
    if (accessError) return accessError;
    const approving = body.decision === "approve";
    const now = new Date();
    const dispute = mutation.disputeId
      ? db.disputes.find((candidate) => candidate.id === mutation.disputeId)
      : undefined;
    const gateError = transitionError(
      mutation,
      actor,
      now,
      approving ? "canApprove" : "canReject",
      ["field-verification-complete"],
      dispute?.status,
    );
    if (gateError) return gateError;
    const filedFieldReport = db.fieldReports
      .filter((report) => report.mutationId === mutation.id && report.status === "completed")
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))[0];
    if (!filedFieldReport) {
      return unprocessable({ fieldReport: { code: "field-investigation-not-filed" } });
    }
    if (filedFieldReport.disputeFound === true && !mutation.disputeId) {
      return unprocessable({ dispute: { code: "dispute-details-required" } });
    }
    const reason = body.rejectionReason?.trim() ?? "";
    const note = body.approvalNote?.trim();

    const parcel = mutationParcel(mutation)!;
    if (approving) {
      if (!mutation.fromOwnerId || parcel.ownerId !== mutation.fromOwnerId) {
        return conflict("The parcel owner has changed since this mutation was filed.");
      }
      const recipient = db.users.find((user) => user.id === mutation.toOwnerId);
      if (!recipient || recipient.role !== "citizen" || recipient.status !== "active") {
        return unprocessable({ toOwnerId: { code: "invalid-recipient" } });
      }
    }

    const previousStatus = mutation.status;
    const at = now.toISOString();
    mutation.assignedOfficerId = actor.id;
    mutation.decidedAt = at;
    mutation.updatedAt = at;
    if (approving) {
      mutation.status = "awaiting-dcr-payment";
      mutation.approvedAt = at;
      mutation.approvedById = actor.id;
      mutation.approvalNote = note;
      mutation.orderSheet = body.orderSheet;
      mutation.digitalSignature = body.digitalSignature;
      mutation.mutationKhatianNumber = `MK-${now.getUTCFullYear()}-${mutation.mutationNumber.replace(/\D/g, "").slice(-8).padStart(8, "0")}`;
      const toOwnerId = mutation.toOwnerId!;
      parcel.ownerId = toOwnerId;
      parcel.ownerName = mutation.toOwnerName;
      parcel.lastMutationAt = at;
      for (const record of db.ownershipRecords) {
        if (record.parcelId === mutation.parcelId && record.toDate === null) record.toDate = at;
      }
      const ownershipRecord = {
        id: `own-${Date.now()}`,
        parcelId: mutation.parcelId,
        ownerId: toOwnerId,
        ownerName: mutation.toOwnerName,
        acquisitionType: ACQUISITION_TYPE_BY_MUTATION_TYPE[mutation.type],
        fromDate: at,
        toDate: null,
        documentId: mutation.documentIds[0],
        mutationId: mutation.id,
      } satisfies OwnershipRecord & { mutationId: string };
      db.ownershipRecords.unshift(ownershipRecord);
    } else {
      mutation.status = "rejected";
      mutation.rejectedAt = at;
      mutation.rejectedById = actor.id;
      mutation.rejectionReason = reason;
    }

    await appendAudit({
      entityType: "mutation",
      entityId: mutation.id,
      action: body.decision,
      actorId: actor.id,
      actorName: actor.name,
      payload: {
        mutationNumber: mutation.mutationNumber,
        parcelDagNo: mutation.parcelDagNo,
        toOwnerName: mutation.toOwnerName,
        previousStatus,
        newStatus: mutation.status,
        actorRole: actor.role,
        ...(approving ? (note ? { note } : {}) : { reason }),
      },
    });

    return HttpResponse.json(mutation);
  }),

  http.patch(`${API}/mutations/:id/dcr-payment`, async ({ params, request }) => {
    await latency();
    const actor = authenticatedUser(request);
    if (!actor) return unauthorized();
    const mutation = db.mutations.find((item) => item.id === params.id);
    if (!mutation) return notFound("Mutation not found");
    if (actor.role === "citizen" && mutation.requestedById !== actor.id) return forbidden();
    if (mutation.status !== "awaiting-dcr-payment") {
      return unprocessable({ status: { code: "wrong-status", expected: ["awaiting-dcr-payment"] } });
    }
    const now = new Date().toISOString();
    mutation.status = "complete";
    mutation.dcrPaidAt = now;
    mutation.decidedAt = now;
    mutation.updatedAt = now;
    await appendAudit({ entityType: "mutation", entityId: mutation.id, action: "dcr-paid", actorId: actor.id, actorName: actor.name, payload: { previousStatus: "awaiting-dcr-payment", newStatus: "complete" }, createdAt: now });
    return HttpResponse.json(mutation);
  }),

  http.patch(`${API}/mutations/:id/flag-dispute`, async ({ params, request }) => {
    await latency();
    const actor = authenticatedUser(request);
    if (!actor) return unauthorized();
    if (!isActiveLandOffice(actor)) return forbidden();
    const mutation = db.mutations.find((item) => item.id === params.id);
    if (!mutation) return notFound("Mutation not found");
    const accessError = mutationActionAccess(mutation, actor);
    if (accessError) return accessError;
    const body = (await request.json()) as { description?: string };
    if (!body.description?.trim()) return unprocessable({ description: { code: "dispute-description-required" } });
    if (mutation.disputeId) return conflict("A dispute is already linked to this mutation.");
    if (mutation.status !== "field-verification-complete") {
      return unprocessable({ status: { code: "wrong-status", expected: ["field-verification-complete"] } });
    }
    const filedFieldReport = db.fieldReports
      .filter((report) => report.mutationId === mutation.id && report.status === "completed")
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))[0];
    if (!filedFieldReport) {
      return unprocessable({ fieldReport: { code: "field-investigation-not-filed" } });
    }
    if (filedFieldReport.disputeFound !== true) {
      return unprocessable({ fieldReport: { code: "no-dispute-reported" } });
    }
    const now = new Date().toISOString();
    const mediator = db.users.find((user) => user.role === "mediator" && user.status === "active");
    const dispute = {
      id: `ds-${Date.now()}`,
      caseNumber: `DSP-${new Date().getUTCFullYear()}-${String(500 + db.disputes.length).padStart(5, "0")}`,
      parcelId: mutation.parcelId,
      parcelDagNo: mutation.parcelDagNo,
      type: "ownership" as const,
      status: "forwarded-to-settlement" as const,
      priority: "high" as const,
      filedById: actor.id,
      filedByName: actor.name,
      filedAt: now,
      updatedAt: now,
      description: body.description.trim(),
      parties: [{ name: mutation.fromOwnerName, role: "claimant" as const }, { name: mutation.toOwnerName, role: "respondent" as const }],
      assignedOfficerId: actor.id,
      assignedMediatorId: mediator?.id,
      evidenceDocumentIds: mutation.documentIds,
    };
    db.disputes.unshift(dispute);
    mutation.disputeId = dispute.id;
    mutation.updatedAt = now;
    db.disputeEvents.push({
      id: `de-${Date.now()}`,
      disputeId: dispute.id,
      at: now,
      type: "assigned",
      title: "Forwarded to Settlement Office",
      content: mediator
        ? { code: "assigned", to: mediator.name }
        : { code: "status-change", status: "forwarded-to-settlement" },
      description: body.description.trim(),
      actorId: actor.id,
      actorName: actor.name,
    });
    if (mediator) {
      db.notifications.unshift({
        id: `n-${Date.now()}-${mediator.id}`,
        userId: mediator.id,
        at: now,
        severity: "warning",
        title: "Mutation dispute assigned",
        body: `Mutation ${mutation.mutationNumber} requires mediation before a final decision.`,
        content: { code: "dispute-assigned", caseNumber: dispute.caseNumber },
        read: false,
        href: "/cases",
      });
    }
    await appendAudit({ entityType: "mutation", entityId: mutation.id, action: "dispute-filed", actorId: actor.id, actorName: actor.name, payload: { caseNumber: dispute.caseNumber, previousStatus: mutation.status, newStatus: mutation.status, note: body.description.trim() }, createdAt: now });
    return HttpResponse.json(mutation);
  }),

  http.get(`${API}/mutations/:id`, async ({ params, request }) => {
    await latency();
    hydrateMutationState();
    const actor = mutationReadActor(request);
    if (!actor) return forbidden("Citizen or Land Office Staff access required.");
    const mutation = db.mutations.find((item) => item.id === params.id);
    if (!mutation) return notFound("Mutation not found");
    if (actor.role === "citizen") {
      if (mutation.requestedById !== actor.id) return forbidden("You can only view your own mutations.");
    } else {
      const parcel = mutationParcel(mutation);
      if (parcel && !coveredJurisdictionIds(actor).has(parcel.jurisdictionId)) {
        return forbidden("This mutation is outside your jurisdiction.");
      }
    }

    const chain = await getAuditChain();
    const summary = (id: string | undefined) => {
      const user = id ? db.users.find((item) => item.id === id) : undefined;
      return user ? { id: user.id, name: user.name, ...(user.title ? { title: user.title } : {}) } : null;
    };
    const statuses: MutationStatus[] = ["submitted", "under-primary-verification", "field-investigation", "field-verification-complete", "approved", "rejected", "awaiting-dcr-payment", "complete"];
    const asStatus = (value: unknown): MutationStatus | undefined =>
      typeof value === "string" && statuses.includes(value as MutationStatus) ? value as MutationStatus : undefined;
    const asString = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
    return HttpResponse.json({
      mutation: { ...mutation, fieldReportId: db.fieldReports.find((report) => report.mutationId === mutation.id)?.id },
      dispute: mutation.disputeId
        ? db.disputes.find((candidate) => candidate.id === mutation.disputeId) ?? null
        : null,
      fieldReport: db.fieldReports.find((report) => report.mutationId === mutation.id) ?? null,
      parcel: mutationParcel(mutation) ?? null,
      documents: db.documents.filter((document) => mutation.documentIds.includes(document.id)),
      applicant: summary(mutation.requestedById),
      assignedOfficer: summary(mutation.assignedOfficerId),
      verificationStartedBy: summary(mutation.verificationStartedById),
      verifiedBy: summary(mutation.verifiedById),
      jurisdiction: (() => {
        const parcel = mutationParcel(mutation);
        const item = parcel ? db.jurisdictions.find((candidate) => candidate.id === parcel.jurisdictionId) : undefined;
        return item ? { id: item.id, code: item.code, name: item.name, ...(item.nameBn ? { nameBn: item.nameBn } : {}) } : null;
      })(),
      objectionSummary: mutationObjectionSummary(mutation),
      timeline: chain
        .filter((event) => event.entityType === "mutation" && event.entityId === mutation.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((event) => ({
          id: event.id,
          action: event.action,
          at: event.createdAt,
          actorName: event.actorName ?? "System",
          actorRole: asString(event.payload.actorRole),
          previousStatus: asStatus(event.payload.previousStatus),
          newStatus: asStatus(event.payload.newStatus),
          note: asString(event.payload.note ?? event.payload.reason),
        })),
    });
  }),

  http.get(`${API}/mutations`, async ({ request }) => {
    await latency();
    hydrateMutationState();
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const status = url.searchParams.get("status");
    const me = mutationReadActor(request);
    if (!me) return forbidden("Citizen or Land Office Staff access required.");
    let items: Mutation[] = filterMutationReads({
      actor: me,
      mutations: db.mutations,
      parcels: db.parcels,
      coveredJurisdictionIds: coveredJurisdictionIds(me),
      scope,
    }) as Mutation[];
    if (status) items = items.filter((mutation) => mutation.status === status);
    items.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return HttpResponse.json(paginate(items, url));
  }),

  // Land-office operational dashboard --------------------------------------
  http.get(`${API}/land-office/dashboard`, async ({ request }) => {
    await latency();
    const officer = currentUser(request);
    if (!isActiveLandOffice(officer)) return forbidden("Land Office Staff access required.");
    const covered = coveredJurisdictionIds(officer);
    const jurisdiction = db.jurisdictions.find((item) => item.id === officer.jurisdictionId);
    const parcels = db.parcels.filter((parcel) => covered.has(parcel.jurisdictionId));
    const parcelIds = new Set(parcels.map((parcel) => parcel.id));
    const mutations = db.mutations
      .filter((item) => parcelIds.has(item.parcelId))
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    const disputes = db.disputes
      .filter((item) => parcelIds.has(item.parcelId))
      .sort((a, b) => b.filedAt.localeCompare(a.filedAt));
    const documents = db.documents
      .filter((item) => {
        if (item.parcelId && parcelIds.has(item.parcelId)) return true;
        const owner = item.ownerId ? db.users.find((user) => user.id === item.ownerId) : undefined;
        return !item.parcelId && Boolean(owner && covered.has(owner.jurisdictionId));
      })
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    const fieldReports = db.fieldReports
      .filter((item) => parcelIds.has(item.parcelId))
      .sort((a, b) => (b.assignedAt ?? "").localeCompare(a.assignedAt ?? ""));
    const services = db.serviceApplications
      .filter((item) => {
        if (item.assignedOfficerId === officer.id || Boolean(item.parcelId && parcelIds.has(item.parcelId))) return true;
        const applicant = db.users.find((user) => user.id === item.applicantId);
        return Boolean(applicant && covered.has(applicant.jurisdictionId));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const activeMutations = mutations.filter((item) => !["complete", "rejected"].includes(item.status));
    const openDisputes = disputes.filter((item) => !isClosed(item.status));
    const reviewDocuments = documents.filter(
      (item) => item.ocrStatus === "extracted" && item.verificationStatus === "unverified",
    );
    const flaggedDocuments = documents.filter((item) => item.verificationStatus === "flagged");
    const activeFieldReports = fieldReports.filter((item) => !["completed", "cancelled"].includes(item.status));
    const liveMutationVisits = new Set(
      fieldReports
        .filter((item) => item.status !== "cancelled")
        .flatMap((item) => item.mutationId ? [item.mutationId] : []),
    );
    const needsAgent = activeMutations.filter(
      (item) =>
        ((item.status === "under-primary-verification" && Boolean(item.verifiedAt)) ||
          item.status === "field-investigation") &&
        !liveMutationVisits.has(item.id),
    );
    const openServices = services.filter((item) => !["approved", "rejected", "withdrawn"].includes(item.status));
    const serviceCounts = openServices.reduce<Record<string, number>>((counts, item) => {
      counts[item.serviceType] = (counts[item.serviceType] ?? 0) + 1;
      return counts;
    }, {});
    const activity = (await getAuditChain())
      .filter((item) => item.actorId === officer.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8);

    return HttpResponse.json({
      officer: {
        id: officer.id,
        name: officer.name,
        ...(officer.title ? { title: officer.title } : {}),
        jurisdictionId: officer.jurisdictionId,
        jurisdictionName: jurisdiction?.name ?? officer.jurisdictionId,
      },
      summary: {
        recordCount: parcels.length,
        activeMutationCount: activeMutations.length,
        primaryVerificationCount: activeMutations.filter(
          (item) => item.status === "under-primary-verification" && !item.verifiedAt,
        ).length,
        openDisputeCount: openDisputes.length,
        documentsToReviewCount: reviewDocuments.length,
        fraudFlagCount: flaggedDocuments.length,
        needsAgentCount: needsAgent.length,
        activeFieldVisitCount: activeFieldReports.length,
        openServiceCount: openServices.length,
      },
      queues: {
        mutations: activeMutations.slice(0, 5),
        disputes: openDisputes.slice(0, 5),
        documents: [...flaggedDocuments, ...reviewDocuments]
          .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
          .slice(0, 5),
        fieldReports: activeFieldReports.slice(0, 5),
      },
      serviceCounts,
      recentActivity: activity,
    });
  }),

  // Land development tax (khajna) --------------------------------------------
  // Assessments are computed here, never taken from the request: what a
  // citizen owes is the registry's determination. Mirrors
  // land-tax.controller.ts, including recording the payment as a
  // ServiceApplication rather than in a table of its own.
  http.get(`${API}/land-tax/collection`, async ({ request }) => {
    await latency();
    const me = currentUser(request);
    if (!isActiveLandOffice(me)) return forbidden("Land Office Staff access required.");
    const covered = coveredJurisdictionIds(me);
    const year = new Date().getUTCFullYear();
    const rates = landTaxRates();
    const parcels = db.parcels
      .filter((parcel) => covered.has(parcel.jurisdictionId))
      .sort((a, b) => a.dagNo.localeCompare(b.dagNo));
    const parcelIds = new Set(parcels.map((parcel) => parcel.id));
    const paid = db.serviceApplications
      .filter((application) => application.serviceType === "land-tax" && application.paidAt && application.parcelId && parcelIds.has(application.parcelId))
      .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
    const activeRevenueCaseParcels = new Set(db.serviceApplications
      .filter((application) => application.serviceType === "revenue-case" && application.parcelId && !["approved", "rejected", "withdrawn"].includes(application.status))
      .map((application) => application.parcelId));
    const payments = paid.flatMap((application) => {
      const parcel = db.parcels.find((candidate) => candidate.id === application.parcelId);
      const owner = parcel ? db.users.find((candidate) => candidate.id === parcel.ownerId) : undefined;
      if (!parcel || !owner || !application.paidAt || !application.feeAmount || !application.paymentMethod || !application.transactionId) return [];
      return [{
        id: application.id,
        applicationNo: application.applicationNo,
        parcelId: parcel.id,
        dagNo: parcel.dagNo,
        khatianNo: parcel.khatianNo,
        ownerId: owner.id,
        ownerName: owner.name,
        assessmentYear: Number(application.details.assessmentYear),
        amount: application.feeAmount,
        paymentMethod: application.paymentMethod,
        transactionId: application.transactionId,
        paidAt: application.paidAt,
      }];
    });
    const holdings = parcels.map((parcel) => {
      const settled = paidThroughYear(paid, parcel.id);
      const assessment = assessLandTax({
        area: parcel.area,
        landUse: parcel.landUse,
        assessmentYear: year,
        paidThroughYear: settled,
        liableFromYear: new Date(parcel.registeredAt).getUTCFullYear(),
      }, rates);
      return {
        parcelId: parcel.id,
        ulpin: parcel.ulpin ?? null,
        dagNo: parcel.dagNo,
        khatianNo: parcel.khatianNo,
        title: parcel.title,
        landUse: parcel.landUse,
        area: parcel.area,
        ownerId: parcel.ownerId,
        ownerName: parcel.ownerName,
        assessmentYear: year,
        paidThroughYear: settled,
        assessment,
        status: assessment.exemption ? "exempt" as const : settled !== null && settled >= year ? "paid" as const : "due" as const,
        latestPayment: payments.find((payment) => payment.parcelId === parcel.id) ?? null,
        hasActiveRevenueCase: activeRevenueCaseParcels.has(parcel.id),
      };
    });
    const currentPayments = payments.filter((payment) => payment.assessmentYear === year);
    const collected = currentPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const outstanding = holdings.reduce((sum, holding) => sum + holding.assessment.total, 0);
    return HttpResponse.json({
      assessmentYear: year,
      summary: {
        holdingCount: holdings.length,
        paidCount: holdings.filter((holding) => holding.status === "paid").length,
        dueCount: holdings.filter((holding) => holding.status === "due").length,
        exemptCount: holdings.filter((holding) => holding.status === "exempt").length,
        assessed: collected + outstanding,
        collected,
        outstanding,
      },
      holdings,
      payments,
    });
  }),

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
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
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
      applicationNo: `LDT-${year}-${String(1000 + count).padStart(6, "0")}`,
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
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`,
      applicationId: application.id,
      at: now,
      type: "payment-recorded",
      title: "Land development tax paid",
      actorId: me.id,
    });

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
    return HttpResponse.json(application, { status: 201 });
  }),

  http.post(`${API}/land-tax/notify`, async ({ request }) => {
    await latency();
    const officer = currentUser(request);
    if (!isActiveLandOffice(officer)) return forbidden("Land Office Staff access required.");
    const body = (await request.json()) as { parcelId: string };
    const parcel = db.parcels.find((candidate) => candidate.id === body.parcelId);
    if (!parcel || !coveredJurisdictionIds(officer).has(parcel.jurisdictionId)) return notFound("Parcel not found");

    const year = new Date().getUTCFullYear();
    const paid = db.serviceApplications.filter(
      (application) => application.applicantId === parcel.ownerId && application.serviceType === "land-tax" && application.paidAt,
    );
    const settled = paidThroughYear(paid, parcel.id);
    if (settled !== null && settled >= year) return conflict("This holding is already paid for the current year.");
    const assessment = assessLandTax({
      area: parcel.area,
      landUse: parcel.landUse,
      assessmentYear: year,
      paidThroughYear: settled,
      liableFromYear: new Date(parcel.registeredAt).getUTCFullYear(),
    }, landTaxRates());
    if (assessment.total <= 0) return conflict("Nothing is due on this holding.");

    const now = new Date().toISOString();
    const notification = {
      id: `n-${Date.now()}`,
      userId: parcel.ownerId,
      at: now,
      severity: "warning" as const,
      title: "Land tax payment due",
      body: `Land development tax of BDT ${assessment.total} is due for dag ${parcel.dagNo} for ${year}.`,
      content: { code: "land-tax-reminder" as const, dagNo: parcel.dagNo, assessmentYear: year, amount: assessment.total },
      read: false,
      href: "/land-tax",
    };
    db.notifications.unshift(notification);
    await appendAudit({
      entityType: "parcel",
      entityId: parcel.id,
      action: "tax-reminder-sent",
      actorId: officer.id,
      actorName: officer.name,
      payload: { ownerId: parcel.ownerId, assessmentYear: year, amount: assessment.total },
    });
    return HttpResponse.json(notification, { status: 201 });
  }),

  http.patch(`${API}/lease-settlement/:id/pay-lease`, async ({ request, params }) => {
    await latency();
    const { id } = params;
    const body = (await request.json()) as { transactionId: string };
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
    const application = db.serviceApplications.find((a) => a.id === id);
    if (!application || application.applicantId !== currentUser(request).id) {
      return notFound("Application not found");
    }

    const now = new Date();
    application.details.leaseFeePaidAt = now.toISOString();
    
    // Set expiry to 1 year from now
    now.setFullYear(now.getFullYear() + 1);
    application.details.leaseExpiresAt = now.toISOString();
    application.updatedAt = new Date().toISOString();

    return HttpResponse.json(application);
  }),

  http.patch(`${API}/lease-settlement/:id/renew`, async ({ params, request }) => {
    await latency();
    const { id } = params;
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
    const application = db.serviceApplications.find((a) => a.id === id);
    if (!application || application.applicantId !== currentUser(request).id) {
      return notFound("Application not found");
    }

    // Set expiry to 1 year from current expiry
    const expiry = new Date((application.details.leaseExpiresAt as string) || Date.now());
    expiry.setFullYear(expiry.getFullYear() + 1);
    application.details.leaseExpiresAt = expiry.toISOString();
    application.updatedAt = new Date().toISOString();

    return HttpResponse.json(application);
  }),

  // Land admin (certified copies / correction requests) -----------------------/ Land administration (certified copies + record corrections) --------------
  // What's owed is a flat fee by request type, not a computed assessment —
  // no rule to mirror here, just Policy lookup. Mirrors land-admin.controller.ts.
  http.post(`${API}/land-admin/apply`, async ({ request }) => {
    await latency();
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
    const me = currentUser(request);
    const body = (await request.json()) as {
      parcelId: string;
      requestType: "certified-copy" | "correction";
      correctionType?: "name" | "area" | "other";
      currentValue?: string;
      correctedValue?: string;
      reason?: string;
      documentIds?: string[];
    };
    const parcel = db.parcels.find((p) => p.id === body.parcelId);
    // Same answer for "no such parcel" and "not yours" as land-tax's own
    // pay handler: a record request is the owner's to make.
    if (!parcel || parcel.ownerId !== me.id) return notFound("Parcel not found");

    const OPEN_STATUSES = new Set([
      "submitted",
      "payment-pending",
      "under-review",
      "field-investigation",
    ]);
    const hasOpenRequest = db.serviceApplications.some(
      (a) =>
        a.applicantId === me.id &&
        a.serviceType === "land-admin" &&
        a.parcelId === parcel.id &&
        OPEN_STATUSES.has(a.status) &&
        (a.details as { requestType?: string })?.requestType === body.requestType,
    );
    if (hasOpenRequest) {
      return conflict(
        body.requestType === "certified-copy"
          ? "A certified-copy request for this parcel is already in progress."
          : "A correction request for this parcel is already in progress.",
      );
    }

    const now = new Date().toISOString();
    const count = db.serviceApplications.filter((a) => a.serviceType === "land-admin").length;
    const application = {
      id: `sa-${Date.now()}`,
      applicationNo: `ADM-2026-${String(1000 + count).padStart(6, "0")}`,
      serviceType: "land-admin" as const,
      status: "submitted" as const,
      parcelId: parcel.id,
      applicantId: me.id,
      details: {
        requestType: body.requestType,
        correctionType: body.correctionType,
        currentValue: body.currentValue,
        correctedValue: body.correctedValue,
        reason: body.reason,
      },
      documentIds: body.documentIds ?? [],
      feeAmount:
        body.requestType === "certified-copy"
          ? db.policies.landAdminCertifiedCopyFeeBdt
          : db.policies.landAdminCorrectionFeeBdt,
      submittedAt: now,
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
      payload: {
        applicationNo: application.applicationNo,
        serviceType: "land-admin",
        parcelDagNo: parcel.dagNo,
        requestType: body.requestType,
      },
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`,
      applicationId: application.id,
      at: now,
      type: "submitted",
      title:
        body.requestType === "certified-copy"
          ? "Certified copy requested"
          : "Correction request submitted",
      actorId: me.id,
    });

    return HttpResponse.json(application, { status: 201 });
  }),

  // Revenue cases filed by the land office for unpaid land tax ----------------
  // "Hearing" here is a status plus a date in `details`, not the Dispute-only
  // Hearing model (mandatory disputeId FK, built for mediator-run mediation).
  // Mirrors revenue-cases.controller.ts.
  http.post(`${API}/revenue-cases/file`, async ({ request }) => {
    await latency();
    const officer = currentUser(request);
    if (!isActiveLandOffice(officer)) return forbidden("Land Office Staff access required.");
    const body = (await request.json()) as {
      parcelId: string;
      grounds: string;
    };
    const parcel = db.parcels.find((p) => p.id === body.parcelId);
    if (!parcel || !coveredJurisdictionIds(officer).has(parcel.jurisdictionId)) return notFound("Parcel not found");
    const active = db.serviceApplications.some((a) => a.serviceType === "revenue-case" && a.parcelId === parcel.id && !["approved", "rejected", "withdrawn"].includes(a.status));
    if (active) return conflict("An active revenue case already exists for this holding.");
    const year = new Date().getUTCFullYear();
    const paid = db.serviceApplications.filter((a) => a.serviceType === "land-tax" && a.parcelId === parcel.id && a.paidAt);
    const settled = paidThroughYear(paid, parcel.id);
    const assessment = assessLandTax({ area: parcel.area, landUse: parcel.landUse, assessmentYear: year, paidThroughYear: settled, liableFromYear: new Date(parcel.registeredAt).getUTCFullYear() }, landTaxRates());
    if (assessment.total <= 0 || (settled !== null && settled >= year)) return conflict("A revenue case can only be filed for outstanding land tax.");

    const now = new Date().toISOString();
    const count = db.serviceApplications.filter((a) => a.serviceType === "revenue-case").length;
    const application = {
      id: `sa-${Date.now()}`,
      applicationNo: `RVC-2026-${String(1000 + count).padStart(6, "0")}`,
      serviceType: "revenue-case" as const,
      status: "submitted" as const,
      parcelId: parcel.id,
      applicantId: parcel.ownerId,
      assignedOfficerId: officer.id,
      details: {
        caseType: "tax-default",
        grounds: body.grounds,
        assessmentYear: year,
        amountDue: assessment.total,
        paidThroughYear: settled,
        dagNo: parcel.dagNo,
      },
      documentIds: [],
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    db.serviceApplications.unshift(application);

    await appendAudit({
      entityType: "service-application",
      entityId: application.id,
      action: "create",
      actorId: officer.id,
      actorName: officer.name,
      payload: {
        applicationNo: application.applicationNo,
        serviceType: "revenue-case",
        parcelDagNo: parcel.dagNo,
        caseType: "tax-default",
        ownerId: parcel.ownerId,
        amountDue: assessment.total,
      },
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`,
      applicationId: application.id,
      at: now,
      type: "submitted",
      title: "Revenue case filed for unpaid land tax",
      actorId: officer.id,
    });

    db.notifications.unshift({ id: `n-${Date.now()}`, userId: parcel.ownerId, at: now, severity: "critical", title: "Revenue case filed for unpaid land tax", body: `The land office filed case ${application.applicationNo} for BDT ${assessment.total} due on dag ${parcel.dagNo}.`, content: { code: "revenue-case-filed", caseNumber: application.applicationNo, dagNo: parcel.dagNo, amount: assessment.total }, read: false, href: "/revenue-cases" });

    return HttpResponse.json(application, { status: 201 });
  }),

  http.patch(`${API}/revenue-cases/:id/assign`, async ({ params, request }) => {
    await latency();
    const officer = currentUser(request);
    if (!isActiveLandOffice(officer)) return forbidden("Land Office Staff access required.");
    const application = db.serviceApplications.find((item) => item.id === params.id);
    const { mediatorId } = (await request.json()) as { mediatorId: string };
    const mediator = db.users.find((user) => user.id === mediatorId && user.role === "mediator" && user.status === "active");
    if (!application || application.serviceType !== "revenue-case" || application.assignedOfficerId !== officer.id) return notFound("Revenue case not found");
    if (!mediator) return notFound("Settlement officer not found");
    if (application.assignedMediatorId) return conflict("This case has already been assigned.");
    const now = new Date().toISOString();
    application.assignedMediatorId = mediator.id;
    application.status = "under-review";
    application.updatedAt = now;
    await appendAudit({ entityType: "service-application", entityId: application.id, action: "assigned", actorId: officer.id, actorName: officer.name, payload: { applicationNo: application.applicationNo, mediatorId: mediator.id } });
    db.serviceApplicationEvents.push({ id: `sae-${Date.now()}`, applicationId: application.id, at: now, type: "status-change", title: `Assigned to ${mediator.name}`, actorId: officer.id });
    db.notifications.unshift({ id: `n-${Date.now()}`, userId: mediator.id, at: now, severity: "warning", title: "Revenue case assigned", body: `${application.applicationNo} requires your review.`, read: false, href: "/cases" });
    return HttpResponse.json(application);
  }),

  http.patch(`${API}/revenue-cases/:id/schedule-hearing`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "mediator");
    if (denied) return denied;
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application) return notFound("Service application not found");
    if (application.serviceType !== "revenue-case") return notFound("Revenue case not found");
    if (application.assignedMediatorId !== currentUser(request).id) return notFound("Revenue case not found");
    if (application.status === "approved" || application.status === "rejected") {
      return conflict("This case has already been decided.");
    }

    const { hearingAt } = (await request.json()) as { hearingAt: string };
    const now = new Date().toISOString();
    application.status = "hearing-scheduled";
    application.details = { ...application.details, hearingAt };
    application.updatedAt = now;

    const me = currentUser(request);
    await appendAudit({
      entityType: "service-application",
      entityId: application.id,
      action: "status-change",
      actorId: me.id,
      actorName: me.name,
      payload: { applicationNo: application.applicationNo, status: application.status, hearingAt },
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`,
      applicationId: application.id,
      at: now,
      type: "status-change",
      title: "Hearing scheduled",
      actorId: me.id,
    });
    db.notifications.unshift({
      id: `n-${Date.now()}`,
      userId: application.applicantId,
      at: now,
      severity: "info",
      title: "Revenue case hearing scheduled",
      body: `A hearing was scheduled for ${application.applicationNo}.`,
      read: false,
      href: "/revenue-cases",
    });

    return HttpResponse.json(application);
  }),

  http.post(`${API}/revenue-cases/:id/notify-citizen`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "mediator");
    if (denied) return denied;
    const me = currentUser(request);
    const application = db.serviceApplications.find((item) => item.id === params.id);
    if (!application || application.serviceType !== "revenue-case" || application.assignedMediatorId !== me.id) return notFound("Revenue case not found");
    if (["approved", "rejected", "withdrawn"].includes(application.status)) return conflict("This case has already been decided.");
    const now = new Date().toISOString();
    const notification = { id: `n-${Date.now()}`, userId: application.applicantId, at: now, severity: "warning" as const, title: "Settlement officer requested contact", body: `Please contact the settlement office regarding revenue case ${application.applicationNo}.`, read: false, href: "/revenue-cases" };
    db.notifications.unshift(notification);
    await appendAudit({ entityType: "service-application", entityId: application.id, action: "citizen-notified", actorId: me.id, actorName: me.name, payload: { applicationNo: application.applicationNo } });
    return HttpResponse.json(notification, { status: 201 });
  }),

  // Lease & settlement (khas land settlement applications) --------------------
  // No parcel to anchor to — khas land isn't in db.parcels, so the citizen
  // describes what they're applying for instead of picking from what they
  // own. No ownership check, no duplicate guard. Mirrors
  // lease-settlement.controller.ts.
  http.post(`${API}/lease-settlement/apply`, async ({ request }) => {
    await latency();
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
    const me = currentUser(request);
    const body = (await request.json()) as {
      landUse: "agricultural" | "non-agricultural";
      locationDescription: string;
      areaDecimals: number;
      termYears: number;
      purpose: string;
      documentIds?: string[];
      khasPlotId?: string;
    };

    if (body.khasPlotId) {
      const plot = db.khasLandPlots.find((p) => p.id === body.khasPlotId);
      if (plot) {
        plot.status = "reserved";
      }
    }

    const now = new Date().toISOString();
    const count = db.serviceApplications.filter((a) => a.serviceType === "lease-settlement").length;
    const application = {
      id: `sa-${Date.now()}`,
      applicationNo: `LSE-2026-${String(1000 + count).padStart(6, "0")}`,
      serviceType: "lease-settlement" as const,
      status: "submitted" as const,
      applicantId: me.id,
      feeAmount: db.policies.leaseSettlementApplicationFeeBdt ?? 20,
      details: {
        landUse: body.landUse,
        locationDescription: body.locationDescription,
        areaDecimals: body.areaDecimals,
        termYears: body.termYears,
        purpose: body.purpose,
        leaseFeeAmount:
          body.landUse === "agricultural"
            ? db.policies.leaseSettlementAgriculturalFeeBdt
            : db.policies.leaseSettlementNonAgriculturalFeeBdt,
      },
      khasPlotId: body.khasPlotId,
      documentIds: body.documentIds ?? [],
      submittedAt: now,
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
      payload: {
        applicationNo: application.applicationNo,
        serviceType: "lease-settlement",
        landUse: body.landUse,
      },
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`,
      applicationId: application.id,
      at: now,
      type: "submitted",
      title:
        body.landUse === "agricultural"
          ? "Agricultural settlement requested"
          : "Non-agricultural settlement requested",
      actorId: me.id,
    });

    return HttpResponse.json(application, { status: 201 });
  }),

  // Acquisition & requisition ---------------------------------------------------
  // Land office assignment -> field valuation -> citizen decision/appeal ->
  // land-office appeal decision. Mirrors acquisition.controller.ts.
  http.post(`${API}/acquisition/notice`, async ({ request }) => {
    await latency();
    const denied = requireRole(request, "land-office");
    if (denied) return denied;
    const me = currentUser(request);
    const body = (await request.json()) as {
      parcelId: string;
      purpose: string;
      assignedFieldAgentId: string;
    };
    const parcel = db.parcels.find((p) => p.id === body.parcelId);
    if (!parcel) return notFound("Parcel not found");
    const agent = db.users.find(
      (user) => user.id === body.assignedFieldAgentId && user.role === "field-agent" && user.status === "active",
    );
    if (!agent) return unprocessable({ assignedFieldAgentId: { code: "invalid-field-agent" } });

    const CLOSED = new Set(["approved", "rejected", "withdrawn"]);
    const hasOpenNotice = db.serviceApplications.some(
      (a) => a.parcelId === parcel.id && a.serviceType === "acquisition" && !CLOSED.has(a.status),
    );
    if (hasOpenNotice) {
      return conflict("An acquisition notice is already open on this parcel.");
    }

    const now = new Date().toISOString();
    const count = db.serviceApplications.filter((a) => a.serviceType === "acquisition").length;
    const application = {
      id: `sa-${Date.now()}`,
      applicationNo: `ACQ-2026-${String(1000 + count).padStart(6, "0")}`,
      serviceType: "acquisition" as const,
      status: "field-investigation" as const,
      parcelId: parcel.id,
      applicantId: parcel.ownerId,
      assignedOfficerId: agent.id,
      details: {
        stage: "field-review",
        purpose: body.purpose,
        createdByOfficerId: me.id,
        assignedFieldAgentId: agent.id,
      } satisfies AcquisitionDetails,
      documentIds: [],
      submittedAt: now,
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
      payload: {
        applicationNo: application.applicationNo,
        serviceType: "acquisition",
        parcelDagNo: parcel.dagNo,
        assignedFieldAgentId: agent.id,
      },
    });
    db.parcelRestrictions.push({
      id: `res-${Date.now()}`,
      parcelId: parcel.id,
      type: "acquisition",
      authority: "Land Office",
      referenceNo: application.applicationNo,
      note: body.purpose,
      fromDate: now,
      toDate: null,
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`,
      applicationId: application.id,
      at: now,
      type: "assigned",
      title: "Acquisition review assigned",
      description: `Assigned to ${agent.name}.`,
      actorId: me.id,
    });
    db.notifications.unshift({
      id: `ntf-${Date.now()}`,
      userId: agent.id,
      at: now,
      severity: "info",
      title: "Acquisition review assigned",
      body: `${application.applicationNo} requires your field review and compensation valuation.`,
      read: false,
      href: "/acquisition",
    });

    return HttpResponse.json(application, { status: 201 });
  }),

  http.patch(`${API}/acquisition/:id/field-review`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "field-agent");
    if (denied) return denied;
    const me = currentUser(request);
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application || application.serviceType !== "acquisition" || application.assignedOfficerId !== me.id) {
      return notFound("Acquisition request not found");
    }
    const details = application.details as AcquisitionDetails;
    const review = acquisitionTransition(details, application.status, "field-review");
    if (!review.allowed) return unprocessable({ status: review.blockers[0] });
    const body = (await request.json()) as { awardAmount: number; reviewNotes: string };
    if (!(body.awardAmount > 0) || !body.reviewNotes?.trim()) return badRequest("Review amount and notes are required");
    const now = new Date().toISOString();
    application.status = "under-review";
    application.details = {
      ...details,
      stage: "citizen-decision",
      awardAmount: body.awardAmount,
      fieldReview: { reviewedAt: now, reviewedById: me.id, notes: body.reviewNotes.trim() },
    } satisfies AcquisitionDetails;
    application.updatedAt = now;
    await appendAudit({
      entityType: "service-application", entityId: application.id, action: "field-review",
      actorId: me.id, actorName: me.name,
      payload: { applicationNo: application.applicationNo, awardAmount: body.awardAmount },
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`, applicationId: application.id, at: now,
      type: "field-reviewed", title: "Field review and valuation completed", actorId: me.id,
    });
    db.notifications.unshift({
      id: `ntf-${Date.now()}`, userId: application.applicantId, at: now, severity: "warning",
      title: "Acquisition compensation offered",
      body: `${application.applicationNo} offers BDT ${body.awardAmount}. Accept it or file an appeal.`,
      read: false, href: "/acquisition",
    });
    return HttpResponse.json(application);
  }),

  http.patch(`${API}/acquisition/:id/accept`, async ({ params, request }) => {
    await latency();
    const me = currentUser(request);
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application || application.serviceType !== "acquisition" || application.applicantId !== me.id) {
      return notFound("Acquisition request not found");
    }
    const details = application.details as AcquisitionDetails;
    const review = acquisitionTransition(details, application.status, "citizen-accept");
    if (!review.allowed) return unprocessable({ status: review.blockers[0] });
    completeMockAcquisition(application, details, me.id, "Citizen accepted the compensation offer");
    await appendAudit({
      entityType: "service-application", entityId: application.id, action: "accept",
      actorId: me.id, actorName: me.name,
      payload: { applicationNo: application.applicationNo, awardAmount: details.awardAmount },
    });
    return HttpResponse.json(application);
  }),

  http.patch(`${API}/acquisition/:id/appeal`, async ({ params, request }) => {
    await latency();
    const me = currentUser(request);
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application || application.serviceType !== "acquisition" || application.applicantId !== me.id) {
      return notFound("Acquisition request not found");
    }
    const details = application.details as AcquisitionDetails;
    const review = acquisitionTransition(details, application.status, "citizen-appeal");
    if (!review.allowed) return unprocessable({ status: review.blockers[0] });
    const body = (await request.json()) as {
      outcome: "withdraw" | "increase-compensation";
      reason: string;
      requestedAmount?: number;
    };
    if (!body.reason?.trim()) return badRequest("Appeal reason is required");
    if (body.outcome === "increase-compensation" && !validIncreasedAward(details.awardAmount, body.requestedAmount)) {
      return unprocessable({ requestedAmount: { code: "appeal-amount-not-higher" } });
    }
    const now = new Date().toISOString();
    application.status = "hearing-scheduled";
    application.details = {
      ...details,
      stage: "appeal-review",
      appeal: { outcome: body.outcome, reason: body.reason.trim(), requestedAmount: body.requestedAmount, filedAt: now },
    } satisfies AcquisitionDetails;
    application.updatedAt = now;
    await appendAudit({
      entityType: "service-application", entityId: application.id, action: "appeal",
      actorId: me.id, actorName: me.name,
      payload: { applicationNo: application.applicationNo, outcome: body.outcome, requestedAmount: body.requestedAmount },
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`, applicationId: application.id, at: now, type: "appealed",
      title: "Citizen appealed the acquisition", description: body.reason.trim(), actorId: me.id,
    });
    db.notifications.unshift({
      id: `ntf-${Date.now()}`, userId: details.createdByOfficerId, at: now, severity: "warning",
      title: "Acquisition appeal filed", body: `${application.applicationNo} requires a land-office decision.`,
      read: false, href: "/acquisition",
    });
    return HttpResponse.json(application);
  }),

  http.patch(`${API}/acquisition/:id/appeal-decision`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "land-office");
    if (denied) return denied;
    const me = currentUser(request);
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application || application.serviceType !== "acquisition") return notFound("Acquisition request not found");
    const details = application.details as AcquisitionDetails;
    const body = (await request.json()) as {
      decision: "withdraw" | "increase-compensation" | "proceed";
      awardAmount?: number;
      note?: string;
    };
    const review = acquisitionTransition(details, application.status, `appeal-${body.decision}`);
    if (!review.allowed) return unprocessable({ status: review.blockers[0] });
    if (body.decision === "increase-compensation" && !validIncreasedAward(details.awardAmount, body.awardAmount)) {
      return unprocessable({ awardAmount: { code: "decision-amount-not-higher" } });
    }
    const now = new Date().toISOString();
    const appealDecision = { decision: body.decision, note: body.note, decidedAt: now, decidedById: me.id };
    if (body.decision === "proceed") {
      completeMockAcquisition(application, { ...details, appealDecision }, me.id, "Land office confirmed acquisition after appeal");
    } else if (body.decision === "withdraw") {
      application.status = "rejected";
      application.details = { ...details, stage: "withdrawn", appealDecision } satisfies AcquisitionDetails;
      application.decidedAt = now;
      application.updatedAt = now;
      for (const restriction of db.parcelRestrictions) {
        if (restriction.parcelId === application.parcelId && restriction.type === "acquisition" && restriction.referenceNo === application.applicationNo && !restriction.toDate) restriction.toDate = now;
      }
      db.notifications.unshift({
        id: `ntf-${Date.now()}`, userId: application.applicantId, at: now, severity: "success",
        title: "Acquisition withdrawn", body: `${application.applicationNo} will not acquire your land.`, read: false, href: "/acquisition",
      });
    } else {
      application.status = "under-review";
      application.details = {
        ...details, stage: "citizen-decision", awardAmount: body.awardAmount,
        appeal: undefined, appealDecision,
      } satisfies AcquisitionDetails;
      application.updatedAt = now;
      db.notifications.unshift({
        id: `ntf-${Date.now()}`, userId: application.applicantId, at: now, severity: "success",
        title: "Acquisition compensation increased", body: `${application.applicationNo} now offers BDT ${body.awardAmount}.`, read: false, href: "/acquisition",
      });
    }
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`, applicationId: application.id, at: now, type: "decided",
      title: body.decision === "withdraw" ? "Land office withdrew the acquisition" : body.decision === "proceed" ? "Land office confirmed acquisition after appeal" : "Compensation offer increased",
      description: body.note, actorId: me.id,
    });
    await appendAudit({
      entityType: "service-application", entityId: application.id, action: `appeal-${body.decision}`,
      actorId: me.id, actorName: me.name,
      payload: { applicationNo: application.applicationNo, awardAmount: body.awardAmount },
    });
    return HttpResponse.json(application);
  }),


  // Appointment booking -----------------------------------------------------
  // "Office" is a real upazila-level jurisdiction, the same one every other
  // routed record here already uses — no invented office directory, and no
  // fake slot/capacity system either, since none exists. No fee, so the
  // notice lands straight in under-review. Mirrors appointments.controller.ts.
  http.post(`${API}/appointments/book`, async ({ request }) => {
    await latency();
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
    const me = currentUser(request);
    const body = (await request.json()) as {
      officeJurisdictionId: string;
      purpose: string;
      preferredAt: string;
      parcelId?: string;
    };
    const office = db.jurisdictions.find((j) => j.id === body.officeJurisdictionId);
    if (!office || office.level !== "upazila") return notFound("Office not found");

    if (body.parcelId) {
      const parcel = db.parcels.find((p) => p.id === body.parcelId);
      if (!parcel || parcel.ownerId !== me.id) return notFound("Parcel not found");
    }

    const now = new Date().toISOString();
    const count = db.serviceApplications.filter((a) => a.serviceType === "appointment").length;
    const application = {
      id: `sa-${Date.now()}`,
      applicationNo: `APT-2026-${String(1000 + count).padStart(6, "0")}`,
      serviceType: "appointment" as const,
      status: "under-review" as const,
      parcelId: body.parcelId ?? undefined,
      applicantId: me.id,
      details: {
        officeJurisdictionId: body.officeJurisdictionId,
        purpose: body.purpose,
        preferredAt: body.preferredAt,
      },
      documentIds: [],
      submittedAt: now,
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
      payload: {
        applicationNo: application.applicationNo,
        serviceType: "appointment",
        officeJurisdictionId: body.officeJurisdictionId,
      },
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`,
      applicationId: application.id,
      at: now,
      type: "submitted",
      title: "Appointment requested",
      actorId: me.id,
    });

    return HttpResponse.json(application, { status: 201 });
  }),

  http.patch(`${API}/appointments/:id/reschedule`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "land-office");
    if (denied) return denied;
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application) return notFound("Service application not found");
    if (application.status === "approved" || application.status === "rejected") {
      return conflict("This appointment has already been decided.");
    }

    const { confirmedAt } = (await request.json()) as { confirmedAt: string };
    const now = new Date().toISOString();
    application.details = { ...application.details, confirmedAt };
    application.updatedAt = now;

    const me = currentUser(request);
    await appendAudit({
      entityType: "service-application",
      entityId: application.id,
      action: "status-change",
      actorId: me.id,
      actorName: me.name,
      payload: { applicationNo: application.applicationNo, confirmedAt },
    });
    db.serviceApplicationEvents.push({
      id: `sae-${Date.now()}`,
      applicationId: application.id,
      at: now,
      type: "status-change",
      title: "Appointment time proposed",
      actorId: me.id,
    });

    return HttpResponse.json(application);
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
    if (serviceType === "revenue-case" && me.role === "citizen") items = items.filter((a) => a.applicantId === me.id);
    else if (serviceType === "revenue-case" && me.role === "land-office") items = items.filter((a) => a.assignedOfficerId === me.id && !a.assignedMediatorId);
    else if (serviceType === "revenue-case" && me.role === "mediator") items = items.filter((a) => a.assignedMediatorId === me.id);
    else if (scope === "mine") items = items.filter((a) => a.applicantId === me.id);
    else if (scope === "assigned") items = items.filter((a) => a.assignedOfficerId === me.id);
    if (serviceType) items = items.filter((a) => a.serviceType === serviceType);
    if (status) items = items.filter((a) => a.status === status);
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(paginate(items, url));
  }),

  http.get(`${API}/service-applications/:id`, async ({ params, request }) => {
    await latency();
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application) return notFound("Service application not found");
    if (application.serviceType === "revenue-case") {
      const me = currentUser(request);
      const allowed = me.role === "admin" || (me.role === "citizen" && application.applicantId === me.id) || (me.role === "land-office" && application.assignedOfficerId === me.id && !application.assignedMediatorId) || (me.role === "mediator" && application.assignedMediatorId === me.id);
      if (!allowed) return notFound("Service application not found");
    }
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
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
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
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application || application.applicantId !== currentUser(request).id) {
      return notFound("Service application not found");
    }
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
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application || application.applicantId !== currentUser(request).id) {
      return notFound("Service application not found");
    }
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
    const me = currentUser(request);
    if (me.role !== "land-office" && me.role !== "mediator") return forbidden("Land Office Staff or Settlement Officer access required.");
    const application = db.serviceApplications.find((a) => a.id === params.id);
    if (!application) return notFound("Service application not found");
    if (application.serviceType === "revenue-case" && application.assignedMediatorId !== me.id) return notFound("Service application not found");
    if (application.serviceType !== "revenue-case" && me.role !== "land-office") return notFound("Service application not found");
    if (application.serviceType === "acquisition") {
      return conflict("Use the acquisition workflow to decide this request.");
    }
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
    db.notifications.unshift({
      id: `n-${Date.now()}`,
      userId: application.applicantId,
      at: now,
      severity: application.serviceType === "revenue-case"
        ? (decision === "approve" ? "critical" : "success")
        : (decision === "approve" ? "success" : "critical"),
      title: application.serviceType === "revenue-case"
        ? (decision === "approve" ? "Revenue case upheld" : "Revenue case dismissed")
        : (decision === "approve" ? "Application approved" : "Application rejected"),
      body: application.serviceType === "revenue-case"
        ? `Revenue case ${application.applicationNo} has been ${decision === "approve" ? "upheld" : "dismissed"}.`
        : `Your application ${application.applicationNo} has been ${decision}d.`,
      read: false,
      href: application.serviceType === "revenue-case" ? "/revenue-cases" : "/portal",
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
    // Mirrors UpdateDisputeStatusDto's @IsIn, then the same gate the real
    // endpoint runs: an unknown value is a 400, a disallowed move a 422.
    if (!DISPUTE_STATUS_VALUES.includes(status)) return badRequest("Invalid status");
    const review = disputeTransition(from as never, status as never);
    if (!review.canChange) return unprocessable({ status: review.blockers[0] });
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
    const denied = requireRole(request, "land-office");
    if (denied) return denied;
    const dispute = db.disputes.find((d) => d.id === params.id);
    if (!dispute) return notFound("Dispute not found");
    if (dispute.status !== "under-land-office-review") {
      return unprocessable({ status: { code: "wrong-status", status: dispute.status } });
    }
    const { agentId } = (await request.json()) as { agentId: string };
    const agent = db.users.find(
      (u) => u.id === agentId && u.role === "field-agent" && u.status === "active",
    );
    if (!agent) return notFound("Field agent not found");

    const me = currentUser(request);
    const now = new Date().toISOString();
    dispute.assignedAgentId = agent.id;
    dispute.updatedAt = now;

    db.disputeEvents.push({
      id: `de-${Date.now()}`,
      disputeId: dispute.id,
      at: now,
      type: "assigned",
      title: `Field agent assigned: ${agent.name}`,
      content: { code: "assigned", to: agent.name },
      actorId: me.id,
      actorName: me.name,
    });

    db.notifications.unshift({
      id: `n-${Date.now()}-${agent.id}`,
      userId: agent.id,
      at: now,
      severity: "info",
      title: "Field visit assigned",
      body: `You have been assigned to verify dispute ${dispute.caseNumber}.`,
      read: false,
      href: `/disputes/${dispute.id}`,
    });

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
      activeRestrictions: activeRestrictions(
        db.parcelRestrictions.filter((r) => r.parcelId === dispute.parcelId),
      ),
    });
  }),

  /**
   * Mirrors DisputesController.execute() — see execution.ts in @plotguard/rules
   * for why this stops at registryStatus/ParcelRestriction and never touches
   * Parcel.ownerId.
   */
  http.patch(`${API}/disputes/:id/execute`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "land-office");
    if (denied) return denied;
    const dispute = db.disputes.find((d) => d.id === params.id);
    if (!dispute) return notFound("Dispute not found");

    const body = (await request.json()) as {
      action: RulingOutcome["action"];
      restrictionType?: RestrictionType;
      authority?: string;
      note?: string;
      restrictionId?: string;
    };
    const outcome: RulingOutcome =
      body.action === "restriction-added"
        ? {
            action: "restriction-added",
            restrictionType: body.restrictionType!,
            authority: body.authority ?? "",
            note: body.note,
          }
        : body.action === "restriction-removed"
          ? { action: "restriction-removed", restrictionId: body.restrictionId ?? "" }
          : body.action === "referred-to-mutation"
            ? { action: "referred-to-mutation" }
            : { action: "no-change" };

    const active = activeRestrictions(
      db.parcelRestrictions.filter((r) => r.parcelId === dispute.parcelId),
    );
    const review = executionGate(dispute as never, outcome, active.map((r) => r.id));
    if (!review.canExecute) {
      return unprocessable({ action: review.blockers[0] });
    }

    const me = currentUser(request);
    const now = new Date().toISOString();

    if (outcome.action === "restriction-added") {
      db.parcelRestrictions.push({
        id: `pr-${Date.now()}`,
        parcelId: dispute.parcelId,
        type: outcome.restrictionType,
        authority: outcome.authority,
        referenceNo: dispute.caseNumber,
        note: outcome.note,
        fromDate: now,
        toDate: null,
      });
    } else if (outcome.action === "restriction-removed") {
      const r = db.parcelRestrictions.find((r) => r.id === outcome.restrictionId);
      if (r) r.toDate = now;
    }

    const remaining =
      outcome.action === "restriction-removed"
        ? active.filter((r) => r.id !== outcome.restrictionId).length
        : active.length;
    const parcel = db.parcels.find((p) => p.id === dispute.parcelId);
    if (parcel) parcel.registryStatus = registryStatusAfter(outcome, remaining);

    dispute.recordsExecutedAt = now;
    dispute.recordsExecutedById = me.id;

    await appendAudit({
      entityType: "dispute",
      entityId: dispute.id,
      action: "execute-ruling",
      actorId: me.id,
      actorName: me.name,
      payload: { caseNumber: dispute.caseNumber, outcome: outcome.action },
    });

    db.disputeEvents.push({
      id: `de-${Date.now()}`,
      disputeId: dispute.id,
      at: now,
      type: "records-executed",
      title: "Records updated",
      content: { code: "records-executed", action: outcome.action },
      actorId: me.id,
      actorName: me.name,
    });

    const audience = disputeAudience(dispute, me.id);
    for (const userId of audience) {
      db.notifications.unshift({
        id: `n-${Date.now()}-${userId}`,
        userId,
        at: now,
        severity: "info",
        title: "Land record updated",
        body: `The land record for case ${dispute.caseNumber} has been updated to reflect the ruling.`,
        content: { code: "dispute-executed", caseNumber: dispute.caseNumber },
        read: false,
        href: `/disputes/${dispute.id}`,
      });
    }

    return HttpResponse.json(dispute);
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

  /** Mirrors DisputesController.create() — see its own note on ownership and routing. */
  http.post(`${API}/disputes`, async ({ request }) => {
    await latency();
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
    const me = currentUser(request);
    const body = (await request.json()) as Partial<{
      parcelId: string;
      type: string;
      priority: string;
      description: string;
      respondentName: string;
    }>;
    const parcel = db.parcels.find((p) => p.id === body.parcelId);
    if (!parcel || parcel.ownerId !== me.id) return notFound("Parcel not found");

    const seq = 1000 + db.disputes.length;
    const now = new Date().toISOString();
    const parties = [{ name: me.name, role: "claimant" as const, userId: me.id }];
    if (body.respondentName?.trim())
      parties.push({ name: body.respondentName.trim(), role: "respondent" as never, userId: undefined as never });

    const officer = routeDisputeToOfficer(
      parcel.jurisdictionId,
      db.users.filter((u) => u.role === "land-office"),
      db.jurisdictions,
    );

    const dispute = {
      id: `ds-${seq}`,
      caseNumber: `DSP-2026-${String(seq).padStart(5, "0")}`,
      parcelId: parcel.id,
      parcelDagNo: parcel.dagNo,
      type: (body.type as never) ?? "boundary",
      status: "submitted" as const,
      priority: (body.priority as never) ?? "medium",
      filedById: me.id,
      filedByName: me.name,
      filedAt: now,
      updatedAt: now,
      description: body.description ?? "",
      parties,
      assignedOfficerId: officer?.id,
      evidenceDocumentIds: [] as string[],
    };
    db.disputes.unshift(dispute);
    parcel.registryStatus = "disputed";

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

    if (officer) {
      db.notifications.unshift({
        id: `n-${Date.now()}-${officer.id}`,
        userId: officer.id,
        at: now,
        severity: "info",
        title: "New dispute assigned",
        body: `${dispute.caseNumber} requires review.`,
        content: { code: "dispute-assigned", caseNumber: dispute.caseNumber },
        read: false,
        href: `/disputes/${dispute.id}`,
      });
    }

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

  http.get(`${API}/khas-land-plots`, async ({ request }) => {
    await latency();
    const url = new URL(request.url);
    const landUse = url.searchParams.get("landUse");
    const status = url.searchParams.get("status") || "available";

    let plots = db.khasLandPlots.filter(p => p.status === status);
    if (landUse) {
      plots = plots.filter(p => p.landUse === landUse);
    }

    return HttpResponse.json<Paginated<any>>({
      items: plots,
      total: plots.length,
      page: 1,
      pageSize: Math.max(1, plots.length),
    });
  }),

  // Field reports ----------------------------------------------------------
  http.get(`${API}/field-reports/assigned`, async ({ request }) => {
    await latency();
    const me = authenticatedUser(request);
    if (!me) return unauthorized();
    if (me.role !== "field-agent") return forbidden();
    const items = db.fieldReports
      .filter((v) => v.assignedAgentId === me.id)
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    return HttpResponse.json(items);
  }),

  http.post(`${API}/field-reports/:id/accept`, async ({ params, request }) => {
    await latency();
    const me = authenticatedUser(request);
    if (!me) return unauthorized();
    if (me.role !== "field-agent") return forbidden();
    const report = db.fieldReports.find(
      (candidate) => candidate.id === params.id && candidate.assignedAgentId === me.id,
    );
    if (!report) return notFound("Field report not found");
    if (report.status !== "assigned") {
      return conflict("This case has already been accepted or changed");
    }
    const now = new Date().toISOString();
    report.status = "accepted";
    report.acceptedAt = now;
    await appendAudit({
      entityType: "field-report",
      entityId: report.id,
      action: "status-change",
      actorId: me.id,
      actorName: me.name,
      payload: {
        caseId: report.id,
        agentId: me.id,
        acceptedAt: now,
        previousStatus: "assigned",
        newStatus: "accepted",
      },
      createdAt: now,
    });
    return HttpResponse.json(report);
  }),

  http.post(`${API}/field-reports/:id/survey/start`, async ({ params, request }) => {
    await latency();
    const me = authenticatedUser(request);
    if (!me) return unauthorized();
    if (me.role !== "field-agent") return forbidden();
    const report = db.fieldReports.find(
      (candidate) => candidate.id === params.id && candidate.assignedAgentId === me.id,
    );
    if (!report) return notFound("Field report not found");
    const body = (await request.json().catch(() => ({}))) as { localSessionId?: string };
    try {
      const execute = async () => {
        if (db.fieldSurveySessions.some((candidate) => candidate.fieldReportId === report.id)) {
          throw new MockSyncConflict("gps-point-conflict", {
            message: "A field survey already exists for this case",
          });
        }
        if (report.status !== "accepted" && report.status !== "en-route") {
          throw new MockSyncConflict("gps-point-conflict", {
            message: "This case cannot start field verification in its current state",
          });
        }
        const transition = reviewFieldSurveyTransition("not-started", "in-progress");
        if (!transition.allowed) throw new MockSyncConflict("gps-point-conflict", transition);

        const now = new Date().toISOString();
        const survey = {
          id: body.localSessionId ?? crypto.randomUUID(),
          ...(body.localSessionId ? { localSessionId: body.localSessionId } : {}),
          fieldReportId: report.id,
          bhumiId: db.parcels.find((parcel) => parcel.id === report.parcelId)?.ulpin,
          assignedAgentId: me.id,
          status: "in-progress" as const,
          version: 1,
          startedAt: now,
          points: [],
        };
        report.status = "in-progress";
        db.fieldSurveySessions.push(survey);
        await appendAudit({
          entityType: "field-survey",
          entityId: survey.id,
          action: "start",
          actorId: me.id,
          actorName: me.name,
          payload: { fieldReportId: report.id, bhumiId: survey.bhumiId, startedAt: now },
          createdAt: now,
        });
        return { report, survey };
      };
      const key = request.headers.get("idempotency-key");
      const result = key
        ? await runMockIdempotent(
            db.fieldSurveySyncReceipts,
            { key, actorId: me.id, fieldReportId: report.id, operationType: "START_SURVEY", payload: body },
            execute,
          )
        : await execute();
      return HttpResponse.json(result, { status: 201 });
    } catch (error) {
      if (error instanceof MockSyncConflict) {
        const message = (error.detail as { message?: string } | undefined)?.message ?? error.message;
        return conflict(message, { code: error.code, ...(error.detail ? { detail: error.detail } : {}) });
      }
      throw error;
    }
  }),

  http.post(`${API}/field-reports/:id/survey/points`, async ({ params, request }) => {
    await latency();
    const me = authenticatedUser(request);
    if (!me) return unauthorized();
    if (me.role !== "field-agent") return forbidden();
    const report = db.fieldReports.find(
      (candidate) => candidate.id === params.id && candidate.assignedAgentId === me.id,
    );
    if (!report) return notFound("Field report not found");
    const body = (await request.json()) as { points: GpsPointInput[] };
    if (!Array.isArray(body.points) || body.points.length < 1 || body.points.length > 50) {
      return unprocessable({ points: { code: "invalid-gps-batch" } });
    }
    try {
      const execute = () => {
        const survey = db.fieldSurveySessions.find(
          (candidate) =>
            candidate.fieldReportId === report.id &&
            candidate.assignedAgentId === me.id &&
            candidate.status === "in-progress",
        );
        if (!survey) throw new MockSyncConflict("gps-point-conflict", { message: "This case has no active field survey" });
        const before = db.fieldSurveyGpsPoints.length;
        const appended = appendMockGpsPoints(db.fieldSurveyGpsPoints, survey.id, body.points);
        if (db.fieldSurveyGpsPoints.length > before) survey.version += 1;
        return { ...appended, sessionId: survey.id, version: survey.version };
      };
      const key = request.headers.get("idempotency-key");
      const result = key
        ? await runMockIdempotent(
            db.fieldSurveySyncReceipts,
            { key, actorId: me.id, fieldReportId: report.id, operationType: "APPEND_POINTS", payload: body },
            execute,
          )
        : execute();
      return HttpResponse.json(result, { status: 201 });
    } catch (error) {
      if (error instanceof TypeError) {
        return unprocessable({ points: { code: "invalid-gps-point" } });
      }
      if (error instanceof MockSyncConflict) {
        return conflict(error.message, { code: error.code, detail: error.detail });
      }
      throw error;
    }
  }),

  http.post(`${API}/field-reports/:id/media`, async ({ params, request }) => {
    await latency();
    const me = authenticatedUser(request);
    if (!me) return unauthorized();
    if (me.role !== "field-agent") return forbidden();
    const report = db.fieldReports.find(
      (v) => v.id === params.id && v.assignedAgentId === me.id,
    );
    if (!report) return notFound("Field report not found");
    const activeSurvey = db.fieldSurveySessions.find(
      (candidate) =>
        candidate.fieldReportId === report.id &&
        candidate.assignedAgentId === me.id &&
        candidate.status === "in-progress",
    );
    if (!activeSurvey) return conflict("Start field verification before adding evidence");
    const body = (await request.json()) as {
      photo?: { url: string; caption?: string };
      gps?: { lat: number; lng: number; accuracyMeters: number; label?: string };
      sketchMap?: { url: string; fileName: string };
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
    if (body.sketchMap) {
      report.sketchMapUrl = body.sketchMap.url;
      report.sketchMapFileName = body.sketchMap.fileName;
    }
    return HttpResponse.json(report);
  }),

  http.post(`${API}/field-reports/:id/survey/complete`, async ({ params, request }) => {
    await latency();
    const me = authenticatedUser(request);
    if (!me) return unauthorized();
    if (me.role !== "field-agent") return forbidden();
    const report = db.fieldReports.find(
      (candidate) => candidate.id === params.id && candidate.assignedAgentId === me.id,
    );
    if (!report) return notFound("Field report not found");
    const survey = db.fieldSurveySessions.find(
      (candidate) => candidate.fieldReportId === report.id && candidate.assignedAgentId === me.id,
    );
    const body = (await request.json()) as { notes?: string; expectedVersion?: number; disputeFound?: boolean; disputeDescription?: string };
    const notes = body.notes ?? "";
    const key = request.headers.get("idempotency-key");
    try {
      const execute = async () => {
        if (!survey || report.status !== "in-progress" || survey.status !== "in-progress") {
          throw new MockSyncConflict("gps-point-conflict", {
            message: "This case has no active field survey to complete",
          });
        }
        const transition = reviewFieldSurveyTransition("in-progress", "completed");
        if (!transition.allowed) throw new MockSyncConflict("gps-point-conflict", transition);
        if (body.expectedVersion !== undefined && body.expectedVersion !== survey.version) {
          throw new MockSyncConflict("gps-point-conflict", {
            code: "survey-version-conflict",
            localData: body,
            serverData: survey,
          });
        }
        const points = db.fieldSurveyGpsPoints
          .filter((point) => point.fieldSurveySessionId === survey.id)
          .sort((a, b) => a.sequence - b.sequence);
        const review = filingReview(report, notes, {
          gpsCount: points.length || report.gpsCaptures.length,
        });
        if (!review.canFile) throw new MockSurveyValidationError(review.blockers[0]);

        const now = new Date().toISOString();
        report.status = "completed";
        report.submittedAt = now;
        report.notes = notes;
        report.disputeFound = body.disputeFound ?? false;
        report.disputeDescription = body.disputeFound
          ? body.disputeDescription?.trim()
          : undefined;
        survey.status = "completed";
        survey.completedAt = now;
        survey.version += 1;
        survey.summary = analyzeGpsTrack(points, survey.startedAt, now);

        const mutation = report.mutationId
          ? db.mutations.find((candidate) => candidate.id === report.mutationId)
          : undefined;
        if (mutation && report.disputeFound !== true) {
          if (mutation.status !== "field-investigation") {
            throw new MockSyncConflict("gps-point-conflict", {
              message: "The linked mutation is not awaiting field investigation",
            });
          }
          mutation.status = "field-verification-complete";
          mutation.updatedAt = now;
          await appendAudit({
            entityType: "mutation",
            entityId: mutation.id,
            action: "field-verification-complete",
            actorId: me.id,
            actorName: me.name,
            payload: {
              previousStatus: "field-investigation",
              newStatus: "field-verification-complete",
              fieldReportId: report.id,
              note: report.notes ?? "",
            },
            createdAt: now,
          });
        }

        const dispute = report.disputeId
      ? db.disputes.find((candidate) => candidate.id === report.disputeId)
      : undefined;
        if (dispute && dispute.status === "under-land-office-review") {
      dispute.status = "field-verified";
      dispute.updatedAt = now;
      db.disputeEvents.push({
        id: `de-${Date.now()}`,
        disputeId: dispute.id,
        at: now,
        type: "field-visit",
        title: "Field survey filed",
        content: { code: "field-verified" },
        description: notes,
        actorId: me.id,
        actorName: me.name,
      });
        }

        if (report.mutationId) {
          if (mutation?.assignedOfficerId && mutation.assignedOfficerId !== me.id) {
            db.notifications.unshift({
              id: `n-${Date.now()}-${mutation.assignedOfficerId}`,
              userId: mutation.assignedOfficerId,
              at: now,
              severity: report.disputeFound ? "warning" : "info",
              title: "Field investigation submitted",
              body: report.disputeFound
                ? `The field agent reported a dispute for mutation ${mutation.mutationNumber}.`
                : `Mutation ${mutation.mutationNumber} is field verification complete and ready for a final decision.`,
              read: false,
              href: `/mutations?mutation=${mutation.id}`,
            });
          }
        }

        await appendAudit({
      entityType: "field-survey",
      entityId: survey.id,
      action: "complete",
      actorId: me.id,
      actorName: me.name,
      payload: {
        fieldReportId: report.id,
        completedAt: now,
        gpsCount: points.length || report.gpsCaptures.length,
        photoCount: report.photos.length,
      },
      createdAt: now,
        });
        return { report, survey: { ...survey, points } };
      };
      const result = key
        ? await runMockIdempotent(
            db.fieldSurveySyncReceipts,
            { key, actorId: me.id, fieldReportId: report.id, operationType: "COMPLETE_SURVEY", payload: body },
            execute,
          )
        : await execute();
      return HttpResponse.json(result);
    } catch (error) {
      if (error instanceof MockSurveyValidationError) {
        return unprocessable({ status: error.blocker });
      }
      if (error instanceof MockSyncConflict) {
        return conflict(error.message, { code: error.code, detail: error.detail });
      }
      throw error;
    }
  }),

  http.post(`${API}/field-reports/:id/review`, async ({ params, request }) => {
    await latency();
    const officer = authenticatedUser(request);
    if (!officer) return unauthorized();
    if (!isActiveLandOffice(officer)) return forbidden();
    const report = db.fieldReports.find((item) => item.id === params.id);
    if (!report?.mutationId) return notFound("Mutation field report not found");
    if (report.status !== "completed") {
      return unprocessable({ status: { code: "field-report-not-completed" } });
    }
    if (report.reviewedAt) return conflict("This field investigation was already accepted");
    const mutation = db.mutations.find((item) => item.id === report.mutationId);
    if (!mutation) return notFound("Mutation not found");
    if (mutation.assignedOfficerId && mutation.assignedOfficerId !== officer.id) {
      return conflict("This mutation is assigned to another land officer");
    }
    if (mutation.status !== "field-investigation") {
      return unprocessable({ mutationId: { code: "wrong-status", expected: ["field-investigation"] } });
    }
    const now = new Date().toISOString();
    report.reviewedAt = now;
    report.reviewedById = officer.id;
    mutation.status = "field-verification-complete";
    mutation.assignedOfficerId = officer.id;
    mutation.updatedAt = now;
    await appendAudit({
      entityType: "field-report", entityId: report.id, action: "review-accepted",
      actorId: officer.id, actorName: officer.name,
      payload: { mutationId: mutation.id, reviewedAt: now }, createdAt: now,
    });
    await appendAudit({
      entityType: "mutation", entityId: mutation.id, action: "field-verification-complete",
      actorId: officer.id, actorName: officer.name,
      payload: { previousStatus: "field-investigation", newStatus: "field-verification-complete", fieldReportId: report.id, note: report.notes ?? "" },
      createdAt: now,
    });
    return HttpResponse.json(report);
  }),

  // Notes and the optional travel marker. Survey start/completion use the
  // dedicated actions above so this generic patch cannot bypass their gates.
  http.patch(`${API}/field-reports/:id`, async ({ params, request }) => {
    await latency();
    const me = authenticatedUser(request);
    if (!me) return unauthorized();
    if (me.role !== "field-agent") return forbidden();
    const report = db.fieldReports.find(
      (v) => v.id === params.id && v.assignedAgentId === me.id,
    );
    if (!report) return notFound("Field report not found");

    const body = (await request.json()) as Partial<{
      status: FieldReportStatus;
      notes: string;
    }>;

    if (body.status) {
      if (body.status !== "en-route") {
        return HttpResponse.json(
          { error: "bad_request", message: "That status is not accepted by this endpoint." },
          { status: 400 },
        );
      }
      const transition = reviewFieldReportTransition(report.status, body.status);
      if (!transition.allowed) return unprocessable({ status: transition });
    }

    if (body.notes !== undefined) report.notes = body.notes;
    if (body.status) report.status = body.status;

    return HttpResponse.json(report);
  }),

  http.get(`${API}/field-reports/:id`, async ({ params, request }) => {
    await latency();
    const me = authenticatedUser(request);
    if (!me) return unauthorized();
    if (me.role !== "field-agent") return forbidden();
    const report = db.fieldReports.find(
      (v) => v.id === params.id && v.assignedAgentId === me.id,
    );
    if (!report) return notFound("Field report not found");
    return HttpResponse.json({
      report,
      parcel: db.parcels.find((p) => p.id === report.parcelId) ?? null,
      survey: (() => {
        const survey = db.fieldSurveySessions.find(
          (candidate) => candidate.fieldReportId === report.id,
        );
        return survey
          ? {
              ...survey,
              points: db.fieldSurveyGpsPoints
                .filter((point) => point.fieldSurveySessionId === survey.id)
                .sort((a, b) => a.sequence - b.sequence),
            }
          : null;
      })(),
    });
  }),

  http.get(`${API}/field-reports`, async ({ request }) => {
    await latency();
    const me = authenticatedUser(request);
    if (!me) return unauthorized();
    if (me.role !== "land-office") return forbidden();
    const url = new URL(request.url);
    const agent = url.searchParams.get("agent");
    const status = url.searchParams.get("status");
    let items = db.fieldReports.slice();
    if (agent === "me") items = items.filter((v) => v.assignedAgentId === me.id);
    else if (agent) items = items.filter((v) => v.assignedAgentId === agent);
    if (status) items = items.filter((v) => v.status === status);
    items.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    return HttpResponse.json(paginate(items, url));
  }),

  /** Mirrors FieldReportsController.create() — see its own note on the gate. */
  http.post(`${API}/field-reports`, async ({ request }) => {
    await latency();
    const me = authenticatedUser(request);
    if (!me) return unauthorized();
    if (me.role !== "land-office") return forbidden();
    const body = (await request.json()) as Partial<{
      parcelId: string;
      disputeId: string;
      mutationId: string;
      purpose: string;
      assignedAgentId: string;
      scheduledFor: string;
      addressHint: string;
      allowOutsideJurisdiction: boolean;
    }>;

    const parcel = db.parcels.find((p) => p.id === body.parcelId);
    if (!parcel) return notFound("Parcel not found");
    const agent = db.users.find((u) => u.id === body.assignedAgentId);
    if (!agent || agent.role !== "field-agent") return notFound("Field agent not found");
    const dispute = body.disputeId ? db.disputes.find((d) => d.id === body.disputeId) : undefined;
    if (body.disputeId && !dispute) return notFound("Dispute not found");
    const mutation = body.mutationId ? db.mutations.find((item) => item.id === body.mutationId) : undefined;
    if (body.mutationId && !mutation) return notFound("Mutation not found");
    if (mutation && mutation.parcelId !== parcel.id) {
      return unprocessable({ mutationId: { code: "mutation-parcel-mismatch" } });
    }
    if (
      mutation &&
      mutation.status !== "field-investigation" &&
      !(mutation.status === "under-primary-verification" && mutation.verifiedAt)
    ) {
      return unprocessable({ mutationId: { code: "wrong-status", expected: ["verified-primary-investigation"] } });
    }
    if (mutation && db.fieldReports.some((report) => report.mutationId === mutation.id && report.status !== "cancelled")) {
      return conflict("This mutation already has a field visit.");
    }

    const agentReports = db.fieldReports.filter((v) => v.assignedAgentId === agent.id);
    const [candidate] = rankCandidates(
      parcel,
      [agent],
      agentReports,
      db.jurisdictions,
      body.allowOutsideJurisdiction ?? false,
    );
    if (candidate.blocker) return unprocessable({ assignedAgentId: candidate.blocker });

    const now = new Date().toISOString();
    const purpose = body.purpose ?? "measurement";
    const report = {
      id: `fr-${Date.now()}`,
      parcelId: parcel.id,
      parcelDagNo: parcel.dagNo,
      disputeId: body.disputeId || undefined,
      mutationId: body.mutationId || undefined,
      purpose: purpose as never,
      status: "assigned" as const,
      assignedAgentId: agent.id,
      assignedAt: now,
      scheduledFor: body.scheduledFor || now,
      addressHint: body.addressHint || undefined,
      gpsCaptures: [],
      photos: [],
    };
    db.fieldReports.unshift(report);

    if (mutation) {
      const previousStatus = mutation.status;
      mutation.status = "field-investigation";
      mutation.updatedAt = now;
      await appendAudit({
        entityType: "mutation",
        entityId: mutation.id,
        action: "assign-field-agent",
        actorId: me.id,
        actorName: me.name,
        payload: {
          previousStatus,
          newStatus: "field-investigation",
          fieldReportId: report.id,
          assignedAgentId: agent.id,
        },
        createdAt: now,
      });
    }

    db.notifications.unshift({
      id: `n-${Date.now()}-${agent.id}`,
      userId: agent.id,
      at: now,
      severity: "info",
      title: "New field investigation assigned",
      body: `You have been assigned a ${purpose.replace(/-/g, " ")} for dag ${report.parcelDagNo}.`,
      read: false,
      href: `/field/${report.id}`,
    });

    // Booking a survey against an open dispute moves the case along and shows
    // up on its tracking timeline, same as the real workflow.
    if (dispute) {
      dispute.assignedAgentId = agent.id;
      dispute.updatedAt = now;
      db.disputeEvents.push({
        id: `de-${Date.now()}`,
        disputeId: dispute.id,
        at: now,
        type: "field-visit",
        title: "Field visit scheduled",
        content: { code: "assigned", to: agent.name },
        description: `${agent.name} is booked for a ${purpose.replace(/-/g, " ")} on ${report.parcelDagNo}.`,
        actorId: me.id,
        actorName: me.name,
      });

      // survey-scheduled has existed on NotificationContent with no writer
      // anywhere — the citizen whose case this is finds out from the app.
      if (dispute.filedById !== me.id) {
        db.notifications.unshift({
          id: `n-${Date.now()}-${dispute.filedById}`,
          userId: dispute.filedById,
          at: now,
          severity: "info",
          title: "Field survey scheduled",
          body: `A ${purpose.replace(/-/g, " ")} for dag ${report.parcelDagNo} has been scheduled.`,
          content: { code: "survey-scheduled", dagNo: report.parcelDagNo },
          read: false,
          href: `/disputes/${dispute.id}`,
        });
      }
    }

    return HttpResponse.json(report, { status: 201 });
  }),

  // Hearings ---------------------------------------------------------------
  http.patch(`${API}/hearings/:id/ruling`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "mediator");
    if (denied) return denied;
    const hearing = db.hearings.find((h) => h.id === params.id);
    if (!hearing) return notFound("Hearing not found");
    const { ruling, outcome } = (await request.json()) as {
      ruling: string;
      outcome: "resolved" | "unresolved";
    };
    if (outcome !== "resolved" && outcome !== "unresolved") {
      return badRequest("A mediation outcome is required");
    }

    // The same gate the client shows (lib/hearings.ts), so a hand-rolled
    // request can't enter a ruling against a party who was never heard.
    const review = rulingGate(hearing, ruling ?? "");
    if (!review.canRule) return unprocessable({ ruling: review.blockers[0] });

    const now = new Date().toISOString();
    hearing.ruling = ruling;
    hearing.outcome = outcome;
    hearing.status = "ruled";
    hearing.ruledAt = now;

    const actor = currentUser(request);
    await appendAudit({
      entityType: "hearing",
      entityId: hearing.id,
      action: "ruling",
      actorId: actor.id,
      actorName: actor.name,
      payload: { caseNumber: hearing.caseNumber, ruling, outcome },
      createdAt: now,
    });

    // A ruling is what closes the dispute the hearing was convened over —
    // without this the case would sit in mediation forever with a decided
    // hearing hanging off it.
    const dispute = db.disputes.find((d) => d.id === hearing.disputeId);
    if (dispute && !isClosed(dispute.status)) {
      dispute.status = outcome === "resolved" ? "decided" : "rejected";
      // The ruling text is the resolution — record content, stored as typed.
      dispute.resolution = ruling;
      dispute.updatedAt = now;
      db.disputeEvents.push({
        id: `de-${Date.now()}`,
        disputeId: dispute.id,
        at: now,
        type: "resolved",
        title: outcome === "resolved" ? "Dispute decided" : "Claim not upheld",
        content: { code: "decided" },
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
          title: outcome === "resolved" ? "Dispute decided" : "Claim not upheld",
          body: outcome === "resolved"
            ? `Case ${dispute.caseNumber} has been decided by the Settlement Office.`
            : `Case ${dispute.caseNumber}: the claim was not upheld. Please see the case for details.`,
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
  // Mirrors hearings.controller.ts's updateStatus(): deliberation, reopening,
  // closing without a ruling, and recording an appeal.
  http.patch(`${API}/hearings/:id/status`, async ({ params, request }) => {
    await latency();
    const hearing = db.hearings.find((h) => h.id === params.id);
    if (!hearing) return notFound("Hearing not found");

    const body = (await request.json()) as Partial<{ status: string; note: string }>;
    const to = body.status;
    if (!to || !HEARING_STATUS_VALUES.includes(to)) return badRequest("Invalid status");

    const review = hearingTransition(hearing.status, to as never);
    if (!review.canChange) return unprocessable({ status: review.blockers[0] });

    const now = new Date().toISOString();
    const me = currentUser(request);
    // Read before the write: the ledger records where it came from.
    const from = hearing.status;
    hearing.status = to as never;

    await appendAudit({
      entityType: "hearing",
      entityId: hearing.id,
      action: "status-change",
      actorId: me.id,
      actorName: me.name,
      payload: { caseNumber: hearing.caseNumber, from, to },
    });

    const publicEvent =
      to === "closed"
        ? { code: "hearing-closed" as const, title: "Hearing closed without a ruling" }
        : to === "appealed"
          ? { code: "hearing-appealed" as const, title: "Ruling appealed" }
          : null;

    const dispute = db.disputes.find((d) => d.id === hearing.disputeId);
    if (dispute && publicEvent) {
      db.disputeEvents.push({
        id: `de-${Date.now()}`,
        disputeId: dispute.id,
        at: now,
        type: "hearing",
        title: publicEvent.title,
        content: { code: publicEvent.code },
        ...(body.note?.trim() ? { description: body.note.trim() } : {}),
        actorId: me.id,
        actorName: me.name,
      } as never);
      if (to === "closed" && !isClosed(dispute.status) && dispute.status === "hearing-scheduled") {
        dispute.status = "forwarded-to-settlement";
        dispute.updatedAt = now;
      }
    }

    return HttpResponse.json(hearing);
  }),

  // Adjournment. Mirrors hearings.controller.ts's reschedule().
  http.patch(`${API}/hearings/:id/schedule`, async ({ params, request }) => {
    await latency();
    const hearing = db.hearings.find((h) => h.id === params.id);
    if (!hearing) return notFound("Hearing not found");
    if (!isHearingOpen(hearing.status)) {
      return unprocessable({ status: { code: "already-decided" } });
    }

    const body = (await request.json()) as Partial<{ hearingDate: string; reason: string }>;
    const at = body.hearingDate ? new Date(body.hearingDate) : new Date(NaN);
    if (Number.isNaN(at.getTime())) return unprocessable({ hearingDate: { code: "need-date" } });

    const now = new Date().toISOString();
    const me = currentUser(request);
    const from = hearing.hearingDate ?? "";
    hearing.hearingDate = at.toISOString();

    await appendAudit({
      entityType: "hearing",
      entityId: hearing.id,
      action: "update",
      actorId: me.id,
      actorName: me.name,
      payload: { caseNumber: hearing.caseNumber, from, to: hearing.hearingDate },
    });

    const dispute = db.disputes.find((d) => d.id === hearing.disputeId);
    if (dispute) {
      dispute.hearingDate = hearing.hearingDate;
      dispute.updatedAt = now;
      db.disputeEvents.push({
        id: `de-${Date.now()}`,
        disputeId: dispute.id,
        at: now,
        type: "hearing",
        title: "Hearing adjourned",
        content: { code: "hearing-adjourned" },
        ...(body.reason?.trim() ? { description: body.reason.trim() } : {}),
        actorId: me.id,
        actorName: me.name,
      } as never);
    }

    return HttpResponse.json(hearing);
  }),

  // Handing the case to another mediator. Mirrors reassign().
  http.patch(`${API}/hearings/:id/mediator`, async ({ params, request }) => {
    await latency();
    const hearing = db.hearings.find((h) => h.id === params.id);
    if (!hearing) return notFound("Hearing not found");
    if (!isHearingOpen(hearing.status)) {
      return unprocessable({ status: { code: "already-decided" } });
    }

    const body = (await request.json()) as Partial<{ mediatorId: string }>;
    const mediator = db.users.find((u) => u.id === body.mediatorId);
    if (!mediator || mediator.role !== "mediator" || mediator.status !== "active") {
      return notFound("Mediator not found");
    }
    if (mediator.id === hearing.mediatorId) {
      return conflict("This case is already with that mediator.");
    }

    const now = new Date().toISOString();
    const me = currentUser(request);
    const from = hearing.mediatorId;
    hearing.mediatorId = mediator.id;

    await appendAudit({
      entityType: "hearing",
      entityId: hearing.id,
      action: "assign",
      actorId: me.id,
      actorName: me.name,
      payload: { caseNumber: hearing.caseNumber, from, to: mediator.id },
    });

    const dispute = db.disputes.find((d) => d.id === hearing.disputeId);
    if (dispute) {
      dispute.assignedMediatorId = mediator.id;
      dispute.updatedAt = now;
      db.disputeEvents.push({
        id: `de-${Date.now()}`,
        disputeId: dispute.id,
        at: now,
        type: "assignment",
        title: `Assigned to ${mediator.name}`,
        content: { code: "assigned", to: mediator.name },
        actorId: me.id,
        actorName: me.name,
      } as never);
    }

    return HttpResponse.json(hearing);
  }),

  http.post(`${API}/hearings/:id/sessions`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "mediator");
    if (denied) return denied;
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
      dispute.status = "forwarded-to-settlement";
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

  // The parcel and the parties come off the dispute, not the body — the
  // hearing is over that record. Mirrors hearings.controller.ts's convene().
  http.post(`${API}/hearings`, async ({ request }) => {
    await latency();
    const denied = requireRole(request, "mediator");
    if (denied) return denied;
    const body = (await request.json()) as { disputeId: string; hearingDate: string };
    const me = currentUser(request);

    const dispute = db.disputes.find((d) => d.id === body.disputeId);
    if (!dispute) return notFound("Dispute not found");
    if (isClosed(dispute.status)) {
      return conflict("This case is closed and cannot be listed for hearing.");
    }
    // Settlement Office can only convene a hearing once the Land Office has
    // forwarded the verified case — enforces the strict pipeline order.
    if (dispute.status !== "forwarded-to-settlement") {
      return conflict("This case must be forwarded to the Settlement Office before scheduling a hearing.");
    }
    const OPEN_HEARING_STATUSES = ["scheduled", "in-hearing", "deliberation"];
    if (
      db.hearings.some(
        (h) => h.disputeId === dispute.id && OPEN_HEARING_STATUSES.includes(h.status),
      )
    ) {
      return conflict("This case is already listed for hearing.");
    }

    const hearing = {
      id: `h-${Date.now()}`,
      caseNumber: `HRG-2026-${String(1000 + db.hearings.length).padStart(4, "0")}`,
      disputeId: dispute.id,
      parcelDagNo: dispute.parcelDagNo,
      mediatorId: me.id,
      status: "scheduled" as const,
      parties: dispute.parties.map((p) => p.name),
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

    return HttpResponse.json(hearing, { status: 201 });
  }),

  // Inheritance ------------------------------------------------------------
  http.post(`${API}/inheritance/calculate`, async ({ request }) => {
    await latency();
    const input = (await request.json()) as Parameters<typeof calcInheritance>[0];
    return HttpResponse.json(calcInheritance(input));
  }),

  // Audit ------------------------------------------------------------------
  http.get(`${API}/audit/verify`, async ({ request }) => {
    await latency();
    if (currentUser(request).role !== "admin") return forbidden("Administrator access required.");
    return HttpResponse.json(await verifyAuditChain());
  }),

  /** Mirrors AdminDashboardController — counts, not queues, and no chain walk. */
  http.get(`${API}/admin/dashboard`, async ({ request }) => {
    await latency();
    if (currentUser(request).role !== "admin") {
      return forbidden("Administrator access required.");
    }
    const CLOSED_SERVICES = ["approved", "rejected", "withdrawn"];
    const TERMINAL_MUTATIONS = ["complete", "rejected"];
    const CLOSED_DISPUTES = ["resolved", "rejected", "withdrawn"];
    const CLOSED_FIELD_REPORTS = ["completed", "cancelled"];
    const OPEN_HEARINGS = ["scheduled", "in-hearing", "deliberation"];
    const ROLE_LIST = ["citizen", "land-office", "field-agent", "mediator", "admin"] as const;

    const chain = await getAuditChain();
    const newest = [...chain].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const byStatus = (status: string) => db.users.filter((u) => u.status === status).length;

    return HttpResponse.json({
      queues: {
        serviceApplications: db.serviceApplications.filter((a) => !CLOSED_SERVICES.includes(a.status)).length,
        mutations: db.mutations.filter((m) => !TERMINAL_MUTATIONS.includes(m.status)).length,
        disputes: db.disputes.filter((d) => !CLOSED_DISPUTES.includes(d.status)).length,
        hearings: db.hearings.filter((h) => OPEN_HEARINGS.includes(h.status)).length,
        fieldReports: db.fieldReports.filter((r) => !CLOSED_FIELD_REPORTS.includes(r.status)).length,
        documentsToVerify: db.documents.filter((d) => d.verificationStatus === "unverified").length,
      },
      accounts: {
        total: db.users.length,
        active: byStatus("active"),
        suspended: byStatus("suspended"),
        invited: byStatus("invited"),
        byRole: Object.fromEntries(
          ROLE_LIST.map((role) => [role, db.users.filter((u) => u.role === role).length]),
        ),
      },
      ledger: {
        events: chain.length,
        ...(newest[0] ? { lastAt: newest[0].createdAt } : {}),
      },
      jurisdictionCount: db.jurisdictions.length,
      recentAudit: newest.slice(0, 5),
    });
  }),

  // The entity types actually present, so the filter offers real options.
  http.get(`${API}/audit/entity-types`, async ({ request }) => {
    await latency();
    if (currentUser(request).role !== "admin") return forbidden("Administrator access required.");
    const chain = await getAuditChain();
    return HttpResponse.json([...new Set(chain.map((e) => e.entityType))].sort());
  }),

  // Full ledger (admin), filtered and paged — mirrors AuditController.list().
  http.get(`${API}/audit`, async ({ request }) => {
    await latency();
    if (currentUser(request).role !== "admin") return forbidden("Administrator access required.");
    const url = new URL(request.url);
    const chain = await getAuditChain();
    const p = (key: string) => url.searchParams.get(key)?.trim() || undefined;
    const entityType = p("entityType");
    const action = p("action");
    const actorId = p("actorId");
    const from = auditBound(p("from"));
    const to = auditBound(p("to"), true);

    const items = [...chain].reverse().filter((e) => {
      if (entityType && e.entityType !== entityType) return false;
      if (action && e.action !== action) return false;
      if (actorId && e.actorId !== actorId) return false;
      const at = new Date(e.createdAt).getTime();
      if (from && at < from.getTime()) return false;
      if (to && at >= to.getTime()) return false;
      return true;
    });
    return HttpResponse.json(paginate(items, url));
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

  // Assistant (citizen help chatbot) --------------------------------------
  // Simulated: keyword matching against the same mock data, not a real
  // model. Proves the UI contract (shapes), not the model's intelligence —
  // see apps/api/src/assistant for the real Gemini-backed version.
  http.get(`${API}/assistant/conversation`, async ({ request }) => {
    await latency();
    const me = currentUser(request);
    const messages = db.assistantMessages.filter((m) => m.userId === me.id);
    return HttpResponse.json({ id: `conv-${me.id}`, messages });
  }),

  http.post(`${API}/assistant/message`, async ({ request }) => {
    await latency();
    const me = currentUser(request);
    const body = (await request.json()) as { message: string; locale: "en" | "bn" };

    const userMessage: db.AssistantMessageMock = {
      id: crypto.randomUUID(),
      userId: me.id,
      role: "user",
      content: body.message,
      createdAt: new Date().toISOString(),
    };
    db.assistantMessages.push(userMessage);

    const text = body.message.toLowerCase();
    let reply = "This is a mock reply — ask about your tax, mutations, or disputes to see it look something up.";
    const suggestedActions: { href: string; label: string }[] = [];

    if (text.includes("tax")) {
      const applications = db.serviceApplications.filter(
        (a) => a.applicantId === me.id && a.serviceType === "land-tax",
      );
      reply = applications.length
        ? `You have ${applications.length} land tax application(s). Most recent status: ${applications[0].status}.`
        : "You have no land tax applications on file.";
      suggestedActions.push({ href: "/land-tax", label: "Go to Land Tax" });
    } else if (text.includes("dispute")) {
      const disputes = db.disputes.filter((d) => d.filedById === me.id);
      reply = disputes.length
        ? `You have ${disputes.length} dispute(s) filed. Most recent status: ${disputes[0].status}.`
        : "You have no disputes on file.";
      suggestedActions.push({ href: "/disputes/new", label: "File a dispute" });
    } else if (text.includes("mutation") || text.includes("namjari")) {
      const mutations = db.mutations.filter(
        (m) => m.requestedById === me.id || m.fromOwnerId === me.id || m.toOwnerId === me.id,
      );
      reply = mutations.length
        ? `You have ${mutations.length} mutation filing(s). Most recent status: ${mutations[0].status}.`
        : "You have no mutation filings on file.";
      suggestedActions.push({ href: "/mutations/new", label: "File a mutation" });
    }

    const modelMessage: db.AssistantMessageMock = {
      id: crypto.randomUUID(),
      userId: me.id,
      role: "model",
      content: reply,
      createdAt: new Date().toISOString(),
    };
    db.assistantMessages.push(modelMessage);

    return HttpResponse.json({ message: modelMessage, suggestedActions });
  }),

  http.post(`${API}/assistant/reset`, async ({ request }) => {
    const me = currentUser(request);
    const remaining = db.assistantMessages.filter((m) => m.userId !== me.id);
    db.assistantMessages.length = 0;
    db.assistantMessages.push(...remaining);
    return HttpResponse.json({ ok: true });
  }),



  // Complaints & grievances ------------------------------------------------
  // Mirrors GrievancesController. Every citizen complaint routes directly to
  // the admin portal; land-office users cannot read or decide grievances.

  http.get(`${API}/grievances`, async ({ request }) => {
    await latency();
    const denied = requireRole(request, "citizen", "admin");
    if (denied) return denied;
    await escalateOverdueGrievances();
    const me = currentUser(request);
    const items = db.grievances
      .filter((g) => me.role === "admin" || g.filedById === me.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(items);
  }),

  http.get(`${API}/grievances/:id`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "citizen", "admin");
    if (denied) return denied;
    await escalateOverdueGrievances();
    const me = currentUser(request);
    const grievance = db.grievances.find((g) => g.id === params.id);
    if (!grievance) return notFound("Grievance not found");
    if (me.role !== "admin" && grievance.filedById !== me.id) {
      return forbidden("Not authorized to view this grievance");
    }
    const timeline = db.grievanceEvents
      .filter((e) => e.grievanceId === grievance.id)
      .sort((a, b) => a.at.localeCompare(b.at));
    return HttpResponse.json({ grievance, timeline });
  }),

  http.post(`${API}/grievances`, async ({ request }) => {
    await latency();
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
    const me = currentUser(request);
    const body = (await request.json()) as { category?: string; description?: string };
    const categories: GrievanceCategory[] = ["technical", "delay", "staff-conduct", "corruption"];
    if (!categories.includes(body.category as GrievanceCategory)) {
      return unprocessable({ category: { code: "invalid-category" } });
    }
    const description = (body.description ?? "").trim();
    if (description.length < 20 || description.length > 2000) {
      return unprocessable({ description: { code: "invalid-length", min: 20, max: 2000 } });
    }
    const activeAdmins = db.users.filter((u) => u.role === "admin" && u.status === "active");
    const { escalatedToId } = routeGrievance(activeAdmins);
    if (!escalatedToId) {
      return conflict("No active administrator is available to receive this complaint");
    }

    const now = new Date();
    const at = now.toISOString();
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + 7);
    const grievance = {
      id: `grv-${crypto.randomUUID()}`,
      caseNumber: `GRV-2026-${String(1000 + db.grievances.length).padStart(5, "0")}`,
      category: body.category as GrievanceCategory,
      status: "submitted" as const,
      description,
      filedById: me.id,
      filedByName: me.name,
      escalatedToId,
      slaDeadline: deadline.toISOString(),
      createdAt: at,
      updatedAt: at,
    };
    db.grievances.unshift(grievance);
    db.grievanceEvents.push({ id: `ge-${crypto.randomUUID()}`, grievanceId: grievance.id, at, type: "filed", title: "Grievance filed", actorId: me.id, actorName: me.name });
    await appendAudit({ entityType: "grievance", entityId: grievance.id, action: "create", actorId: me.id, actorName: me.name, payload: { caseNumber: grievance.caseNumber, category: grievance.category } });
    db.notifications.unshift({ id: `n-${crypto.randomUUID()}`, userId: me.id, at, severity: "success", title: "Grievance submitted", body: `Your complaint ${grievance.caseNumber} has been successfully submitted.`, read: false, href: `/grievances/${grievance.id}` });
    db.notifications.unshift({ id: `n-${crypto.randomUUID()}`, userId: escalatedToId, at, severity: "info", title: "New grievance assigned", body: `${grievance.caseNumber} requires your review.`, read: false, href: `/grievances/${grievance.id}` });
    return HttpResponse.json(grievance, { status: 201 });
  }),

  http.patch(`${API}/grievances/:id/status`, async ({ params, request }) => {
    await latency();
    const found = grievanceForHandler(params.id as string, request);
    if (found instanceof Response) return found;
    const { grievance, me } = found;
    const body = (await request.json()) as { status?: string };
    if (body.status !== "under-review" && body.status !== "investigating") {
      return unprocessable({ status: { code: "invalid-status" } });
    }
    const at = new Date().toISOString();
    const from = grievance.status;
    grievance.status = body.status;
    grievance.updatedAt = at;
    db.grievanceEvents.push({ id: `ge-${crypto.randomUUID()}`, grievanceId: grievance.id, at, type: "status-change", title: "Status updated", description: `Status changed to ${body.status}`, actorId: me.id, actorName: me.name });
    await appendAudit({ entityType: "grievance", entityId: grievance.id, action: "status-change", actorId: me.id, actorName: me.name, payload: { from, to: body.status } });
    db.notifications.unshift({ id: `n-${crypto.randomUUID()}`, userId: grievance.filedById, at, severity: "info", title: "Grievance status updated", body: `Complaint ${grievance.caseNumber} status was updated to ${body.status}.`, read: false, href: `/grievances/${grievance.id}` });
    return HttpResponse.json(grievance);
  }),

  http.patch(`${API}/grievances/:id/resolve`, async ({ params, request }) => {
    await latency();
    const found = grievanceForHandler(params.id as string, request);
    if (found instanceof Response) return found;
    const { grievance, me } = found;
    const body = (await request.json()) as { resolutionNote?: string; dismissed?: boolean };
    const note = (body.resolutionNote ?? "").trim();
    if (note.length < 10) return unprocessable({ resolutionNote: { code: "too-short", min: 10 } });
    const outcome = body.dismissed ? "dismissed" : "resolved";
    const at = new Date().toISOString();
    Object.assign(grievance, { status: outcome, resolutionNote: note, resolvedAt: at, updatedAt: at });
    db.grievanceEvents.push({ id: `ge-${crypto.randomUUID()}`, grievanceId: grievance.id, at, type: outcome, title: body.dismissed ? "Grievance dismissed" : "Grievance resolved", description: note, actorId: me.id, actorName: me.name });
    await appendAudit({ entityType: "grievance", entityId: grievance.id, action: "ruling", actorId: me.id, actorName: me.name, payload: { outcome } });
    db.notifications.unshift({ id: `n-${crypto.randomUUID()}`, userId: grievance.filedById, at, severity: body.dismissed ? "warning" : "success", title: `Grievance ${outcome}`, body: `Complaint ${grievance.caseNumber} has been ${outcome}.`, read: false, href: `/grievances/${grievance.id}` });
    return HttpResponse.json(grievance);
  }),

  http.patch(`${API}/grievances/:id/rate`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "citizen");
    if (denied) return denied;
    const me = currentUser(request);
    const grievance = db.grievances.find((g) => g.id === params.id);
    if (!grievance) return notFound("Grievance not found");
    if (grievance.filedById !== me.id) return forbidden("Only the filer can rate the grievance");
    if (grievance.status !== "resolved" && grievance.status !== "dismissed") {
      return conflict("Grievance must be resolved or dismissed before rating.");
    }
    if (grievance.satisfactionRating != null) return conflict("Grievance has already been rated.");
    const body = (await request.json()) as { rating?: number };
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return unprocessable({ rating: { code: "out-of-range", min: 1, max: 5 } });
    }
    const at = new Date().toISOString();
    grievance.satisfactionRating = rating;
    grievance.updatedAt = at;
    db.grievanceEvents.push({ id: `ge-${crypto.randomUUID()}`, grievanceId: grievance.id, at, type: "rated", title: "Rating submitted", description: `Citizen rated resolution: ${rating} stars`, actorId: me.id, actorName: me.name });
    await appendAudit({ entityType: "grievance", entityId: grievance.id, action: "update", actorId: me.id, actorName: me.name, payload: { satisfactionRating: rating } });
    return HttpResponse.json(grievance);
  }),

  // Mirrors DocumentsController.runOcrNow(): runs the (simulated) reader now,
  // then routes the document to fraud review if what was read disagrees with
  // the register or the fraud score is over the policy threshold.
  http.post(`${API}/documents/:id/run-ocr`, async ({ params, request }) => {
    await latency();
    const denied = requireRole(request, "land-office");
    if (denied) return denied;
    const me = currentUser(request);
    const doc = db.documents.find((d) => d.id === params.id);
    if (!doc) return notFound("Document not found");
    const parcel = doc.parcelId ? db.parcels.find((p) => p.id === doc.parcelId) : undefined;
    doc.ocrStatus = "extracted";
    doc.fraudScore = 0.04;
    doc.extractedFields = {
      "Document type": doc.type.replace(/-/g, " "),
      ...(parcel ? { "Dag No": parcel.dagNo, Khatian: parcel.khatianNo } : {}),
      "Pages read": String(doc.pageCount ?? 1),
    };
    const review = extractionReview(doc, parcel);
    const findings = review.issues
      .filter((issue) => issue.kind === "mismatch")
      .map((issue) => `${issue.field} does not match the registered record (${issue.scanned} vs ${issue.registered}).`);
    const flagged = findings.length > 0 || review.mustEscalate || doc.fraudScore >= db.policies.fraudScoreThreshold;
    doc.ocrFindings = findings;
    doc.ocrModel = "mock-ocr";
    doc.verificationStatus = flagged ? "flagged" : "unverified";
    await appendAudit({ entityType: "document", entityId: doc.id, action: "status-change", actorId: me.id, actorName: me.name, payload: { fileName: doc.fileName, ocrStatus: doc.ocrStatus, routedToFraudReview: flagged, findingCount: findings.length } });
    return HttpResponse.json(doc);
  }),

  http.get(`${API}/khas-land-plots/:id`, async ({ params }) => {
    await latency();
    const plot = db.khasLandPlots.find((p) => p.id === params.id);
    if (!plot) return notFound("Khas land plot not found");
    return HttpResponse.json(plot);
  }),

  // Admin ------------------------------------------------------------------
  /** Mirrors UsersController.search() — the mutation wizard's recipient picker. */
  http.get(`${API}/users/search`, async ({ request }) => {
    await latency();
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim();
    if (query.length < 4) return HttpResponse.json([]);

    const q = query.toLowerCase();
    const me = currentUser(request);
    const matches = db.users
      .filter(
        (u) =>
          u.role === "citizen" &&
          u.id !== me.id &&
          (u.email.toLowerCase().includes(q) || u.phone?.toLowerCase().includes(q)),
      )
      .slice(0, 5)
      .map((u) => ({ id: u.id, name: u.name }));
    return HttpResponse.json(matches);
  }),

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

  /** Mirrors UsersController.invite(). */
  http.post(`${API}/users`, async ({ request }) => {
    await latency();
    const me = currentUser(request);
    if (me.role !== "admin") return forbidden("Administrator access required.");

    const body = (await request.json()) as Partial<{
      name: string;
      email: string;
      role: User["role"];
      jurisdictionId: string;
      title: string;
    }>;
    const email = body.email?.trim().toLowerCase();
    if (!body.name?.trim() || !email || !body.role || !body.jurisdictionId) {
      return badRequest("Missing required fields");
    }
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      return conflict("An account with that email already exists.");
    }
    if (!db.jurisdictions.some((j) => j.id === body.jurisdictionId)) {
      return notFound("Jurisdiction not found");
    }

    const user: User = {
      id: `usr-${Math.random().toString(36).slice(2, 10)}`,
      name: body.name.trim(),
      email,
      role: body.role,
      jurisdictionId: body.jurisdictionId,
      ...(body.title?.trim() ? { title: body.title.trim() } : {}),
      status: "invited",
      createdAt: new Date().toISOString(),
    } as User;
    db.users.push(user);

    await appendAudit({
      entityType: "user",
      entityId: user.id,
      action: "create",
      actorId: me.id,
      actorName: me.name,
      payload: { name: user.name, email: user.email, role: user.role },
    });

    // The fixture API authenticates on the demo password, so the issued one
    // is cosmetic here — the shape matches, which is what parity means.
    return HttpResponse.json(
      { user, temporaryPassword: Math.random().toString(36).slice(2, 10) },
      { status: 201 },
    );
  }),

  /** Mirrors UsersController.resetPassword(). */
  http.post(`${API}/users/:id/password-reset`, async ({ params, request }) => {
    await latency();
    const user = db.users.find((u) => u.id === params.id);
    if (!user) return notFound("User not found");

    const me = currentUser(request);
    if (me.role !== "admin") return forbidden("Administrator access required.");

    const review = passwordResetGate({ status: user.status });
    if (!review.canReset) return unprocessable({ status: review.blockers[0] });
    await appendAudit({
      entityType: "user",
      entityId: user.id,
      action: "update",
      actorId: me.id,
      actorName: me.name,
      payload: { name: user.name, passwordReset: "true" },
    });

    return HttpResponse.json({ temporaryPassword: Math.random().toString(36).slice(2, 10) });
  }),

  /** Mirrors UsersController.update() — see its own note on scope. */
  http.patch(`${API}/users/:id`, async ({ params, request }) => {
    await latency();
    const user = db.users.find((u) => u.id === params.id);
    if (!user) return notFound("User not found");

    const body = (await request.json()) as Partial<{
      status: "active" | "suspended";
      jurisdictionId: string;
      role: User["role"];
    }>;

    const me = currentUser(request);
    if (me.role !== "admin") return forbidden("Administrator access required.");
    if (body.status === "suspended" && user.id === me.id) {
      return conflict("You cannot suspend your own account.");
    }
    if (body.role) {
      const review = roleChangeGate(me.id, { id: user.id, role: user.role }, body.role);
      if (!review.canChange) return unprocessable({ role: review.blockers[0] });
    }
    if (body.jurisdictionId && !db.jurisdictions.some((j) => j.id === body.jurisdictionId)) {
      return notFound("Jurisdiction not found");
    }

    if (body.status) user.status = body.status;
    if (body.jurisdictionId) user.jurisdictionId = body.jurisdictionId;
    if (body.role) user.role = body.role;

    await appendAudit({
      entityType: "user",
      entityId: user.id,
      action: "update",
      actorId: me.id,
      actorName: me.name,
      payload: {
        name: user.name,
        ...(body.status ? { status: user.status } : {}),
        ...(body.jurisdictionId ? { jurisdictionId: user.jurisdictionId } : {}),
        ...(body.role ? { role: user.role } : {}),
      },
    });

    return HttpResponse.json(user);
  }),

  http.get(`${API}/policies`, async () => {
    await latency();
    return HttpResponse.json(db.policies);
  }),

  http.patch(`${API}/policies`, async ({ request }) => {
    await latency();
    const denied = requireRole(request, "admin");
    if (denied) return denied;
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
