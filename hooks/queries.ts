"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
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
  MutationVerificationChecklist,
  LandRecordDetail,
} from "@/lib/types";
import type { RulingOutcome } from "@plotguard/rules";
import type { FieldProfileUpdate } from "@/lib/field-profile";

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

export function useUpdateOwnProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: FieldProfileUpdate) => api.patch<User>("/auth/me", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth-me"] }),
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

export function useLandRecord(id: string | undefined) {
  const role = useRole();
  return useQuery({
    queryKey: ["land-record", role, id],
    queryFn: () => api.get<LandRecordDetail>(`/parcels/${id}/record`),
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

export interface FileDisputeInput {
  parcelId: string;
  type: Dispute["type"];
  priority: Dispute["priority"];
  description: string;
  respondentName?: string;
}

export function useFileDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FileDisputeInput) => api.post<Dispute>("/disputes", body),
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

/** Land office turning a mediator's ruling into an actual record change. */
export function useExecuteRuling(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (outcome: RulingOutcome) =>
      api.patch<Dispute>(`/disputes/${id}/execute`, outcome),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispute", id] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
      qc.invalidateQueries({ queryKey: ["parcel"] });
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
    onSuccess: (mutation) => invalidateMutationWorkflow(qc, mutation.id),
  });
}

function invalidateMutationWorkflow(qc: QueryClient, id: string) {
  qc.invalidateQueries({ queryKey: ["mutation", id] });
  qc.invalidateQueries({ queryKey: ["mutations"] });
  qc.invalidateQueries({ queryKey: ["audit", "mutation", id] });
  // Record detail embeds mutation state and its audit trail, so every workflow
  // action refreshes that aggregate and the Records list projection. Approval
  // also changes the parcel's owner through the existing backend transaction.
  qc.invalidateQueries({ queryKey: ["land-record"] });
  qc.invalidateQueries({ queryKey: ["parcel"] });
  qc.invalidateQueries({ queryKey: ["parcels"] });
}

export type CompleteMutationVerificationInput = MutationVerificationChecklist & {
  notes: string;
};

export function useStartMutationVerification(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch<LandMutation>(`/mutations/${id}/start-verification`),
    onSuccess: () => invalidateMutationWorkflow(qc, id),
  });
}

export function useCompleteMutationVerification(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CompleteMutationVerificationInput) =>
      api.patch<LandMutation>(`/mutations/${id}/complete-verification`, body),
    onSuccess: () => invalidateMutationWorkflow(qc, id),
  });
}

/** The mutation wizard's recipient picker — a citizen found by email/phone,
 * never browsed. Short-circuits below the server's own minimum length so a
 * half-typed query never fires a request. */
export function useSearchCitizens(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["users-search", q],
    queryFn: () => api.get<{ id: string; name: string }[]>(`/users/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 4,
    placeholderData: keepPreviousData,
  });
}

export type MutationDecisionBody =
  | { decision: "approve"; approvalNote?: string; orderSheet: string; digitalSignature: string }
  | { decision: "reject"; rejectionReason: string };

export function useMutationDecision(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MutationDecisionBody) =>
      api.patch<LandMutation>(`/mutations/${id}/decision`, input),
    onSuccess: () => invalidateMutationWorkflow(qc, id),
  });
}

export function usePayMutationDcr(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch<LandMutation>(`/mutations/${id}/dcr-payment`),
    onSuccess: () => invalidateMutationWorkflow(qc, id),
  });
}

export function useFlagMutationDispute(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (description: string) =>
      api.patch<LandMutation>(`/mutations/${id}/flag-dispute`, { description }),
    onSuccess: () => {
      invalidateMutationWorkflow(qc, id);
      qc.invalidateQueries({ queryKey: ["disputes"] });
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

// --- Land administration (certified copies + record corrections) -----------
// The first screen actually built on the generic service-applications hooks
// above. Deciding reuses useServiceApplicationDecision untouched. Applying and
// paying are two backend calls — POST /land-admin/apply (the only bespoke
// endpoint the feature needed) then the generic PATCH .../pay — chained here
// into one citizen-facing action, the same "apply and pay in one step" feel
// Mutation filing and Land Tax both already have.
export function useApplyLandAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      parcelId: string;
      requestType: "certified-copy" | "correction";
      correctionType?: string;
      currentValue?: string;
      correctedValue?: string;
      reason?: string;
      paymentMethod: string;
    }) => {
      const { paymentMethod, ...applyBody } = body;
      const created = await api.post<ServiceApplication>("/land-admin/apply", applyBody);
      return api.patch<ServiceApplication>(`/service-applications/${created.id}/pay`, {
        paymentMethod,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-applications"] }),
  });
}

// --- Revenue cases (misc. cases + appeals before AC Land / ADC Revenue) ----
// Same "apply and pay in one step" shape as useApplyLandAdmin(). Scheduling
// a hearing and deciding are two separate officer actions afterward — the
// first is the one bespoke endpoint this service needed beyond filing;
// deciding reuses useServiceApplicationDecision untouched.
export function useFileRevenueCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      parcelId: string;
      caseType: "miscellaneous" | "appeal";
      grounds: string;
      againstReference?: string;
      paymentMethod: string;
    }) => {
      const { paymentMethod, ...fileBody } = body;
      const created = await api.post<ServiceApplication>("/revenue-cases/file", fileBody);
      return api.patch<ServiceApplication>(`/service-applications/${created.id}/pay`, {
        paymentMethod,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-applications"] }),
  });
}

export function useScheduleHearing(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hearingAt: string) =>
      api.patch<ServiceApplication>(`/revenue-cases/${id}/schedule-hearing`, { hearingAt }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-application", id] });
      qc.invalidateQueries({ queryKey: ["service-applications"] });
    },
  });
}

// --- Lease & settlement (khas land settlement applications) ----------------
// Same "apply and pay in one step" shape as useApplyLandAdmin(). No parcel
// picker feeding this one — khas land isn't in the parcel table, so the
// citizen describes what they're applying for instead of choosing from what
// they own.
export function useApplyLeaseSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      landUse: "agricultural" | "non-agricultural";
      locationDescription: string;
      areaDecimals: number;
      termYears: number;
      purpose: string;
      paymentMethod: string;
    }) => {
      const { paymentMethod, ...applyBody } = body;
      const created = await api.post<ServiceApplication>("/lease-settlement/apply", applyBody);
      return api.patch<ServiceApplication>(`/service-applications/${created.id}/pay`, {
        paymentMethod,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-applications"] }),
  });
}

// --- Acquisition & requisition -----------------------------------------------
// The one service a citizen doesn't start — a land office officer issues the
// notice, so there's no "apply and pay" hook here, just issuing and, on the
// citizen's side, objecting. No fee, so no pay step in either hook.
export function useIssueAcquisitionNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { parcelId: string; purpose: string; awardAmount: number }) =>
      api.post<ServiceApplication>("/acquisition/notice", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-applications"] }),
  });
}

export function useFileAcquisitionObjection(id: string) {
  const { invalidate } = useServiceApplicationWrite(id);
  return useMutation({
    mutationFn: (objectionText: string) =>
      api.patch<ServiceApplication>(`/acquisition/${id}/object`, { objectionText }),
    onSuccess: invalidate,
  });
}

// --- Land information bank --------------------------------------------------
// Read-only: parcels with an approved acquisition notice — the only land
// this system actually knows the government holds an interest in. No apply
// or decide hooks; there's nothing here to submit.
export interface LandInfoBankEntry {
  application: ServiceApplication;
  parcel: Parcel;
}

export function useLandInfoBank(params: ListParams = {}) {
  return useQuery({
    queryKey: ["land-info-bank", params],
    queryFn: () => api.get<Paginated<LandInfoBankEntry>>(`/land-info-bank${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

// --- Appointments ------------------------------------------------------------
// No fee, so no pay step — booking lands straight in under-review. An
// officer may propose a different time (reschedule) before finally
// confirming or declining via the generic decision hook.
export function useBookAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      officeJurisdictionId: string;
      purpose: string;
      preferredAt: string;
      parcelId?: string;
    }) => api.post<ServiceApplication>("/appointments/book", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service-applications"] }),
  });
}

export function useRescheduleAppointment(id: string) {
  const { invalidate } = useServiceApplicationWrite(id);
  return useMutation({
    mutationFn: (confirmedAt: string) =>
      api.patch<ServiceApplication>(`/appointments/${id}/reschedule`, { confirmedAt }),
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
      disputeId?: string;
      mutationId?: string;
      purpose: string;
      assignedAgentId: string;
      scheduledFor: string;
      addressHint?: string;
      allowOutsideJurisdiction?: boolean;
    }) => api.post<FieldReport>("/field-reports", body),
    onSuccess: (_report, variables) => {
      qc.invalidateQueries({ queryKey: ["field-reports"] });
      qc.invalidateQueries({ queryKey: ["field-reports-assigned"] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
      qc.invalidateQueries({ queryKey: ["mutations"] });
      if (variables.mutationId) qc.invalidateQueries({ queryKey: ["mutation", variables.mutationId] });
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

export function useAcceptFieldReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<FieldReport>(`/field-reports/${id}/accept`),
    onSettled: (_data, _error, id) => {
      qc.invalidateQueries({ queryKey: ["field-report", id] });
      qc.invalidateQueries({ queryKey: ["field-reports-assigned"] });
      qc.invalidateQueries({ queryKey: ["field-reports"] });
    },
  });
}

type FieldSurveyMutationResult = Pick<FieldReportDetail, "report" | "survey">;

export function useStartFieldSurvey(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<FieldSurveyMutationResult>(`/field-reports/${id}/survey/start`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-report", id] });
      qc.invalidateQueries({ queryKey: ["field-reports-assigned"] });
      qc.invalidateQueries({ queryKey: ["field-reports"] });
    },
  });
}

export function useCompleteFieldSurvey(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string | { notes: string; disputeFound?: boolean; disputeDescription?: string }) =>
      api.post<FieldSurveyMutationResult>(`/field-reports/${id}/survey/complete`,
        typeof input === "string" ? { notes: input } : input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-report", id] });
      qc.invalidateQueries({ queryKey: ["field-reports-assigned"] });
      qc.invalidateQueries({ queryKey: ["field-reports"] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
      qc.invalidateQueries({ queryKey: ["mutations"] });
    },
  });
}

export function useAddFieldReportMedia(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      photo?: { url: string; caption?: string };
      gps?: { lat: number; lng: number; accuracyMeters: number; label?: string };
      sketchMap?: { url: string; fileName: string };
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
    mutationFn: (body: { status?: Extract<FieldReportStatus, "en-route">; notes?: string }) =>
      api.patch<FieldReport>(`/field-reports/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-report", id] });
      qc.invalidateQueries({ queryKey: ["field-reports-assigned"] });
      qc.invalidateQueries({ queryKey: ["field-reports"] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
    },
  });
}

export function useFlagFieldReportDispute(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (description: string) =>
      api.patch<FieldReport>(`/field-reports/${id}/flag-dispute`, { description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-report", id] });
      qc.invalidateQueries({ queryKey: ["mutations"] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
      qc.invalidateQueries({ queryKey: ["parcels"] });
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
    // Only the case and the date: the parcel and the parties are read off
    // the dispute server-side, so they can't drift from the record.
    mutationFn: (body: { disputeId: string; hearingDate: string }) =>
      api.post<Hearing>("/hearings", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hearings"] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Deliberation, reopening, closing without a ruling, and recording an appeal. */
export function useUpdateHearingStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { status: string; note?: string }) =>
      api.patch<Hearing>(`/hearings/${id}/status`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hearing", id] });
      qc.invalidateQueries({ queryKey: ["hearings"] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
    },
  });
}

/** Adjourning to a new date. */
export function useRescheduleHearing(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { hearingDate: string; reason?: string }) =>
      api.patch<Hearing>(`/hearings/${id}/schedule`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hearing", id] });
      qc.invalidateQueries({ queryKey: ["hearings"] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
    },
  });
}

/** Handing the case to another mediator — leave, recusal, or workload. */
export function useReassignHearing(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { mediatorId: string }) =>
      api.patch<Hearing>(`/hearings/${id}/mediator`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hearing", id] });
      qc.invalidateQueries({ queryKey: ["hearings"] });
      qc.invalidateQueries({ queryKey: ["disputes"] });
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
/** A type alias, not an interface: qs() takes a Record, and only aliases get an implicit index signature. */
export type AuditLedgerParams = {
  entityType?: string;
  action?: string;
  actorId?: string;
  /** Date-only (YYYY-MM-DD); `to` covers the whole day named. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export function useAuditLedger(params: AuditLedgerParams = {}) {
  return useQuery({
    queryKey: ["audit-ledger", params],
    queryFn: () => api.get<Paginated<AuditEvent>>(`/audit${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

/** Filter options drawn from what the ledger actually holds, not a guessed list. */
export function useAuditEntityTypes() {
  return useQuery({
    queryKey: ["audit-entity-types"],
    queryFn: () => api.get<string[]>("/audit/entity-types"),
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

/** Suspend/reactivate, or reassign jurisdiction — the two account actions
 * that need no real auth system behind them. */
export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { status?: "active" | "suspended"; jurisdictionId?: string }) =>
      api.patch<User>(`/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
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
