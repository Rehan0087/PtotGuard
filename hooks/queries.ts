"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { api, qs } from "@/lib/api-client";
import { useSessionStore } from "@/store/session";
import type {
  Paginated,
  Parcel,
  OwnershipRecord,
  Dispute,
  Mutation as LandMutation,
  ServiceApplication,
  LandDocument,
  FieldReport,
  FieldReportStatus,
  Hearing,
  AppNotification,
  User,
  Jurisdiction,
  AuthMe,
  ParcelDetail,
  DisputeDetail,
  MutationDetail,
  ServiceApplicationDetail,
  LandTaxHolding,
  FieldReportDetail,
  HearingDetail,
  InheritanceInput,
  InheritanceResult,
  AuditEvent,
  AuditVerifyResult,
  Policy,
} from "@/lib/types";

/** The active role scopes every query key so switching roles refetches. */
export function useRole() {
  return useSessionStore((s) => s.role);
}

type ListParams = Record<string, string | number | boolean | undefined | null>;

// --- Session / auth --------------------------------------------------------
export function useSession() {
  const role = useRole();
  return useQuery({
    queryKey: ["auth-me", role],
    queryFn: () => api.get<AuthMe>("/auth/me"),
  });
}

export function useJurisdictions() {
  return useQuery({
    queryKey: ["jurisdictions"],
    queryFn: () => api.get<Jurisdiction[]>("/jurisdictions"),
    staleTime: Infinity,
  });
}

/**
 * Editing the tree moves more than the tree: agent coverage is read from it
 * (lib/assignment.ts) and the signed-in user carries their own node, so both
 * are invalidated alongside it.
 */
function useJurisdictionWrite<TData, TVariables>(
  mutationFn: (vars: TVariables) => Promise<TData>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jurisdictions"] });
      qc.invalidateQueries({ queryKey: ["auth-me"] });
    },
  });
}

export function useCreateJurisdiction() {
  return useJurisdictionWrite((body: Omit<Jurisdiction, "id">) =>
    api.post<Jurisdiction>("/jurisdictions", body),
  );
}

export function useUpdateJurisdiction() {
  return useJurisdictionWrite(({ id, ...body }: Partial<Jurisdiction> & { id: string }) =>
    api.patch<Jurisdiction>(`/jurisdictions/${id}`, body),
  );
}

export function useDeleteJurisdiction() {
  return useJurisdictionWrite((id: string) => api.del<void>(`/jurisdictions/${id}`));
}

// --- Parcels ---------------------------------------------------------------
export function useParcels(params: ListParams = {}) {
  const role = useRole();
  return useQuery({
    queryKey: ["parcels", role, params],
    queryFn: () => api.get<Paginated<Parcel>>(`/parcels${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useParcel(id: string | undefined) {
  return useQuery({
    queryKey: ["parcel", id],
    queryFn: () => api.get<ParcelDetail>(`/parcels/${id}`),
    enabled: Boolean(id),
  });
}

export function useParcelNeighbours(id: string | undefined) {
  return useQuery({
    queryKey: ["parcel-neighbours", id],
    queryFn: () => api.get<Parcel[]>(`/parcels/${id}/neighbours`),
    enabled: Boolean(id),
  });
}

export function useParcelHistory(id: string | undefined) {
  return useQuery({
    queryKey: ["parcel-history", id],
    queryFn: () => api.get<OwnershipRecord[]>(`/parcels/${id}/history`),
    enabled: Boolean(id),
  });
}

// --- Disputes --------------------------------------------------------------
export function useDisputes(params: ListParams = {}) {
  const role = useRole();
  return useQuery({
    queryKey: ["disputes", role, params],
    queryFn: () => api.get<Paginated<Dispute>>(`/disputes${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useDispute(id: string | undefined) {
  return useQuery({
    queryKey: ["dispute", id],
    queryFn: () => api.get<DisputeDetail>(`/disputes/${id}`),
    enabled: Boolean(id),
  });
}

export function useFileDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Dispute> & { respondentName?: string }) =>
      api.post<Dispute>("/disputes", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["disputes"] }),
  });
}

export function useUpdateDisputeStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) => api.patch<Dispute>(`/disputes/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispute", id] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
    },
  });
}

export function useAssignAgent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => api.post<Dispute>(`/disputes/${id}/assign-agent`, { agentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispute", id] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
    },
  });
}

// --- Mutations (namjari) ---------------------------------------------------
export function useMutations(params: ListParams = {}) {
  const role = useRole();
  return useQuery({
    queryKey: ["mutations", role, params],
    queryFn: () => api.get<Paginated<LandMutation>>(`/mutations${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useMutationById(id: string | undefined) {
  return useQuery({
    queryKey: ["mutation", id],
    queryFn: () => api.get<MutationDetail>(`/mutations/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<LandMutation>) => api.post<LandMutation>("/mutations", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mutations"] }),
  });
}

export function useMutationDecision(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      api.patch<LandMutation>(`/mutations/${id}/decision`, { decision }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mutation", id] });
      qc.invalidateQueries({ queryKey: ["mutations"] });
    },
  });
}

// --- Land development tax (khajna) ------------------------------------------
export function useLandTaxHoldings() {
  const role = useRole();
  return useQuery({
    queryKey: ["land-tax-holdings", role],
    queryFn: () => api.get<LandTaxHolding[]>("/land-tax/holdings"),
  });
}

export function usePayLandTax() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { parcelId: string; paymentMethod: string }) =>
      api.post<ServiceApplication>("/land-tax/pay", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["land-tax-holdings"] });
      qc.invalidateQueries({ queryKey: ["service-applications"] });
    },
  });
}

// --- Service applications ---------------------------------------------------
// Shared foundation across services — see ServiceApplication in
// @plotguard/rules. Land Development Tax is the first one built on it (via
// the land-tax hooks above, which record payment as a ServiceApplication);
// Acquisition & Requisition, Lease & Settlement, Land Administration, Revenue
// Cases, and Land Information Bank still compose their screens on top of this
// same apply → pay → track → decide loop.
export function useServiceApplications(params: ListParams = {}) {
  const role = useRole();
  return useQuery({
    queryKey: ["service-applications", role, params],
    queryFn: () => api.get<Paginated<ServiceApplication>>(`/service-applications${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useServiceApplication(id: string | undefined) {
  return useQuery({
    queryKey: ["service-application", id],
    queryFn: () => api.get<ServiceApplicationDetail>(`/service-applications/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateServiceApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ServiceApplication>) =>
      api.post<ServiceApplication>("/service-applications", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-applications"] }),
  });
}

function useServiceApplicationWrite(id: string) {
  const qc = useQueryClient();
  return {
    invalidate: () => {
      qc.invalidateQueries({ queryKey: ["service-application", id] });
      qc.invalidateQueries({ queryKey: ["service-applications"] });
    },
  };
}

export function useSubmitServiceApplication(id: string) {
  const { invalidate } = useServiceApplicationWrite(id);
  return useMutation({
    mutationFn: () => api.patch<ServiceApplication>(`/service-applications/${id}/submit`),
    onSuccess: invalidate,
  });
}

export function usePayServiceApplication(id: string) {
  const { invalidate } = useServiceApplicationWrite(id);
  return useMutation({
    mutationFn: (paymentMethod: string) =>
      api.patch<ServiceApplication>(`/service-applications/${id}/pay`, { paymentMethod }),
    onSuccess: invalidate,
  });
}

export function useServiceApplicationDecision(id: string) {
  const { invalidate } = useServiceApplicationWrite(id);
  return useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      api.patch<ServiceApplication>(`/service-applications/${id}/decision`, { decision }),
    onSuccess: invalidate,
  });
}

// --- Documents -------------------------------------------------------------
export function useDocuments(params: ListParams = {}) {
  const role = useRole();
  return useQuery({
    queryKey: ["documents", role, params],
    queryFn: () => api.get<Paginated<LandDocument>>(`/documents${qs(params)}`),
    placeholderData: keepPreviousData,
    // Poll while the OCR/fraud worker still has anything in flight, so
    // processing → extracted lands in the UI without a manual refresh.
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const working = items.some(
        (d) => d.ocrStatus === "processing" || d.ocrStatus === "pending",
      );
      return working ? 2500 : false;
    },
  });
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: ["document", id],
    queryFn: () => api.get<LandDocument>(`/documents/${id}`),
    enabled: Boolean(id),
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<LandDocument>) => api.post<LandDocument>("/documents", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

/** `flag` hands the document from the OCR queue to the fraud-review queue. */
export function useDocumentDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
    }: {
      id: string;
      decision: "verify" | "reject" | "flag";
    }) => api.patch<LandDocument>(`/documents/${id}/decision`, { decision }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

/** Fields an officer keyed in by hand where the reader came up short. */
export function useSaveExtractedFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Record<string, string> }) =>
      api.patch<LandDocument>(`/documents/${id}/fields`, { fields }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useReprocessDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<LandDocument>(`/documents/${id}/reprocess`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

// --- Field reports ---------------------------------------------------------
/** The signed-in agent's assigned reports (GET /field-reports/assigned). */
export function useAssignedFieldReports() {
  const role = useRole();
  return useQuery({
    queryKey: ["field-reports-assigned", role],
    queryFn: () => api.get<FieldReport[]>("/field-reports/assigned"),
  });
}

export function useFieldReports(params: ListParams = {}) {
  const role = useRole();
  return useQuery({
    queryKey: ["field-reports", role, params],
    queryFn: () => api.get<Paginated<FieldReport>>(`/field-reports${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

/** The land office booking a survey: creates the visit and moves the dispute. */
export function useAssignFieldSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      parcelId: string;
      parcelDagNo: string;
      disputeId?: string;
      purpose: string;
      assignedAgentId: string;
      scheduledFor: string;
      addressHint?: string;
    }) => api.post<FieldReport>("/field-reports", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-reports"] });
      qc.invalidateQueries({ queryKey: ["field-reports-assigned"] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
    },
  });
}

export function useFieldReport(id: string | undefined) {
  return useQuery({
    queryKey: ["field-report", id],
    queryFn: () => api.get<FieldReportDetail>(`/field-reports/${id}`),
    enabled: Boolean(id),
  });
}

export function useAddFieldReportMedia(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      photo?: { url: string; caption?: string };
      gps?: { lat: number; lng: number; accuracyMeters: number; label?: string };
    }) => api.post<FieldReport>(`/field-reports/${id}/media`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-report", id] });
      qc.invalidateQueries({ queryKey: ["field-reports-assigned"] });
    },
  });
}

/** The agent's own edits: status along the ladder, notes, and filing. */
export function useUpdateFieldReport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { status?: FieldReportStatus; notes?: string }) =>
      api.patch<FieldReport>(`/field-reports/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-report", id] });
      qc.invalidateQueries({ queryKey: ["field-reports-assigned"] });
      qc.invalidateQueries({ queryKey: ["field-reports"] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
    },
  });
}

// --- Hearings --------------------------------------------------------------
export function useHearings(params: ListParams = {}) {
  const role = useRole();
  return useQuery({
    queryKey: ["hearings", role, params],
    queryFn: () => api.get<Paginated<Hearing>>(`/hearings${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useHearing(id: string | undefined) {
  return useQuery({
    queryKey: ["hearing", id],
    queryFn: () => api.get<HearingDetail>(`/hearings/${id}`),
    enabled: Boolean(id),
  });
}

export function useHearingRuling(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruling: string) => api.patch<Hearing>(`/hearings/${id}/ruling`, { ruling }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hearing", id] });
      qc.invalidateQueries({ queryKey: ["hearings"] });
    },
  });
}

/** Listing a referred case for hearing. Also moves the dispute and notifies its parties. */
export function useCreateHearing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      disputeId: string;
      parcelDagNo: string;
      parties: string[];
      hearingDate: string;
    }) => api.post<Hearing>("/hearings", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hearings"] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Recording a sitting. The ruling gate reads these, so this is what unblocks a decision. */
export function useRecordHearingSession(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { summary: string; attendees: string[] }) =>
      api.post<Hearing>(`/hearings/${id}/sessions`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hearing", id] });
      qc.invalidateQueries({ queryKey: ["hearings"] });
    },
  });
}

// --- Inheritance -----------------------------------------------------------
export function useCalculateInheritance() {
  return useMutation({
    mutationFn: (input: InheritanceInput) =>
      api.post<InheritanceResult>("/inheritance/calculate", input),
  });
}

// --- Audit -----------------------------------------------------------------
export function useAuditLedger() {
  return useQuery({
    queryKey: ["audit-ledger"],
    queryFn: () => api.get<AuditEvent[]>("/audit"),
  });
}

export function useAuditTrail(entityType: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: ["audit", entityType, id],
    queryFn: () => api.get<AuditEvent[]>(`/audit/${entityType}/${id}`),
    enabled: Boolean(entityType && id),
  });
}

export function useVerifyAudit() {
  return useMutation({
    mutationFn: () => api.get<AuditVerifyResult>("/audit/verify"),
  });
}

// --- Notifications ---------------------------------------------------------
export function useNotifications() {
  const role = useRole();
  return useQuery({
    queryKey: ["notifications", role],
    queryFn: () => api.get<AppNotification[]>("/notifications"),
    // The bell picks up server-pushed alerts (e.g. "document processed") without
    // a reload. Swap for a websocket/SSE subscription when the backend has one.
    refetchInterval: 15_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// --- Users (admin) ---------------------------------------------------------
export function useUsers(params: ListParams = {}) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () => api.get<Paginated<User>>(`/users${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

// --- Policies (admin) -------------------------------------------------------
export function usePolicies() {
  return useQuery({
    queryKey: ["policies"],
    queryFn: () => api.get<Policy>("/policies"),
  });
}

export function useUpdatePolicies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<Policy>) =>
      api.patch<Policy>("/policies", updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies"] });
    },
  });
}
