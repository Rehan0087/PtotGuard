import { recordRegistryStatus } from "@plotguard/rules";

function forbidden() {
  const error = new Error("Land Office Staff access required.");
  error.code = "forbidden";
  return error;
}

function coveredIds(rootId, jurisdictions) {
  const result = new Set([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const parentId = queue.shift();
    for (const item of jurisdictions) {
      if (item.parentId === parentId && !result.has(item.id)) {
        result.add(item.id);
        queue.push(item.id);
      }
    }
  }
  return result;
}

/**
 * Mirrors the real API's Land Office-only list boundary and composed filters.
 * @param {{
 *   actor: { role: string, status: string, jurisdictionId: string } | null | undefined,
 *   jurisdictions: Array<{ id: string, parentId?: string | null }>,
 *   parcels: import("@plotguard/rules").Parcel[],
 *   mutations?: Array<Pick<import("@plotguard/rules").Mutation, "parcelId" | "status">>,
 *   disputes?: Array<Pick<import("@plotguard/rules").Dispute, "parcelId" | "status">>,
 *   documents?: Array<Pick<import("@plotguard/rules").LandDocument, "parcelId" | "verificationStatus">>,
 *   q?: string | null,
 *   status?: string | null,
 * }} input
 */
export function filterLandOfficeRecords({ actor, jurisdictions, parcels, mutations = [], disputes = [], documents = [], q, status }) {
  if (!actor || actor.role !== "land-office" || actor.status !== "active") {
    throw forbidden();
  }

  const covered = coveredIds(actor.jurisdictionId, jurisdictions);
  const needle = q?.trim().toLowerCase();
  return parcels.map((parcel) => ({
    ...parcel,
    registryStatus: recordRegistryStatus(
      mutations.filter((mutation) => mutation.parcelId === parcel.id),
      disputes.filter((dispute) => dispute.parcelId === parcel.id && !["resolved", "rejected", "withdrawn"].includes(dispute.status)).length,
      documents.some((document) => document.parcelId === parcel.id && document.verificationStatus === "flagged"),
    ),
  })).filter((parcel) => {
    if (!covered.has(parcel.jurisdictionId)) return false;
    if (status && parcel.registryStatus !== status) return false;
    if (!needle) return true;
    return [parcel.dagNo, parcel.khatianNo, parcel.title, parcel.ownerName, parcel.ulpin]
      .some((value) => value?.toLowerCase().includes(needle));
  });
}

/**
 * Collects every audit event that can explain the current record aggregate.
 * @param {{
 *   events: import("@plotguard/rules").AuditEvent[],
 *   parcelId: string,
 *   mutationIds?: string[],
 *   disputeIds?: string[],
 *   documentIds?: string[],
 * }} input
 */
export function recordAuditEvents({
  events,
  parcelId,
  mutationIds = [],
  disputeIds = [],
  documentIds = [],
}) {
  const linked = {
    mutation: new Set(mutationIds),
    dispute: new Set(disputeIds),
    document: new Set(documentIds),
  };

  return events
    .filter((event) =>
      (event.entityType === "parcel" && event.entityId === parcelId)
      || linked[event.entityType]?.has(event.entityId),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
