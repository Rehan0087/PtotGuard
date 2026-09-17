"use client";

import { useState } from "react";
import { ArrowRight, FileText, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { IdChip } from "@/components/id-chip";
import { MutationDecisionDialog } from "@/components/mutations/mutation-decision-dialog";
import { MutationVerificationForm } from "@/components/mutations/mutation-verification-form";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useMutationById,
  useRole,
  useSession,
  useStartMutationVerification,
  useAssignFieldSurvey,
  useJurisdictions,
  useReviewFieldInvestigation,
  useFlagMutationDispute,
  useUsers,
} from "@/hooks/queries";
import { mutationActionState } from "@/components/mutations/mutation-action-state";
import {
  isUsableMutationPreviewUrl,
  mutationDetailPresentation,
  mutationTimelineActionGroup,
} from "@/components/mutations/mutation-detail-utils.mjs";
import { ApiError } from "@/lib/api-client";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import type { MutationDetail, MutationVerificationChecklist } from "@/lib/types";
import { rankCandidates } from "@plotguard/rules";

const CHECKLIST_KEYS: (keyof MutationVerificationChecklist)[] = [
  "applicantVerified",
  "previousOwnerVerified",
  "proposedOwnerVerified",
  "dagKhatianVerified",
  "deedVerified",
  "landRecordMatched",
  "documentsPresent",
  "khajnaReceiptVerified",
];

function timelineActionLabel(
  action: string,
  t: ReturnType<typeof useT>,
): string {
  const group = mutationTimelineActionGroup(action);
  if (group === "audit") {
    return t.domain.auditAction[action as keyof typeof t.domain.auditAction];
  }
  if (group === "workflow") {
    return t.pages.mutations.timelineAction[
      action as Exclude<keyof typeof t.pages.mutations.timelineAction, "unknown">
    ];
  }
  return t.pages.mutations.timelineAction.unknown;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3 p-4">
      <h3 className="font-heading text-base font-medium text-foreground">{title}</h3>
      {children}
    </Card>
  );
}

function DefinitionList({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function MutationDetailContent({ detail, open }: { detail: MutationDetail; open: boolean }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const role = useRole();
  const session = useSession();
  const start = useStartMutationVerification(detail.mutation.id);
  const assignSurvey = useAssignFieldSurvey();
  const reviewInvestigation = useReviewFieldInvestigation(detail.mutation.id);
  const flagDispute = useFlagMutationDispute(detail.mutation.id);
  const agents = useUsers({ role: "field-agent", pageSize: 50 });
  const jurisdictions = useJurisdictions();
  const [agentId, setAgentId] = useState("");
  const [scheduledFor, setScheduledFor] = useState(() => {
    const date = new Date(Date.now() + 86_400_000);
    date.setHours(10, 0, 0, 0);
    return date.toISOString().slice(0, 16);
  });
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [disputeDescription, setDisputeDescription] = useState("");
  const {
    mutation,
    parcel,
    applicant,
    assignedOfficer,
    verificationStartedBy,
    verifiedBy,
    jurisdiction,
    objectionSummary,
    timeline,
    fieldReport,
  } = detail;
  const presentation = mutationDetailPresentation(detail);
  const actorId = session.data?.user.id;
  const action = actorId ? mutationActionState(mutation, actorId) : null;
  const requiresDisputeEntry = fieldReport?.disputeFound === true && !mutation.disputeId;
  const eligibleAgents = rankCandidates(
    parcel ?? undefined,
    agents.data?.items ?? [],
    fieldReport ? [fieldReport] : [],
    jurisdictions.data ?? [],
  ).filter((candidate) => !candidate.blocker);

  function startVerification() {
    start.mutate(undefined, {
      onSuccess: () =>
        toast.success(t.pages.mutations.verificationStartedTitle, {
          description: t.pages.mutations.verificationStartedBody,
        }),
      onError: () =>
        toast.error(t.pages.mutations.startVerificationFailedTitle, {
          description: t.pages.mutations.startVerificationFailedBody,
        }),
    });
  }

  return (
    <>
      <ScrollArea className="max-h-[calc(100dvh-11rem)] px-4 pb-4">
        <div className="space-y-4 pr-3">
          <DetailSection title={t.pages.mutations.mutationInformation}>
            <DefinitionList
              rows={[
                { label: t.pages.mutations.mutationType, value: t.domain.mutationType[mutation.type] },
                {
                  label: t.pages.mutations.currentStatus,
                  value: (
                    <StatusMetaBadge
                      meta={s.mutation[presentation.currentStatus ?? mutation.status]}
                    />
                  ),
                },
                { label: t.pages.mutations.requestedAt, value: f.dateTime(mutation.requestedAt) },
                { label: t.pages.mutations.requestedBy, value: applicant?.name ?? t.common.notAvailable },
                {
                  label: t.pages.mutations.assignedOfficer,
                  value: assignedOfficer?.name ?? t.pages.mutations.notAssigned,
                },
                {
                  label: t.pages.mutations.jurisdiction,
                  value: jurisdiction ? `${jurisdiction.name} (${jurisdiction.code})` : t.common.notAvailable,
                },
              ]}
            />
          </DetailSection>

          <DetailSection title={t.pages.mutations.fieldInvestigation}>
            {fieldReport ? (
              <div className="space-y-3">
                <DefinitionList rows={[
                  { label: t.pages.mutations.assignedFieldAgent, value: agents.data?.items.find((agent) => agent.id === fieldReport.assignedAgentId)?.name ?? fieldReport.assignedAgentId },
                  { label: t.pages.mutations.currentStatus, value: <StatusMetaBadge meta={s.fieldReport[fieldReport.status]} /> },
                  { label: t.pages.mutations.scheduledFor, value: f.dateTime(fieldReport.scheduledFor) },
                  { label: t.pages.mutations.fieldReport, value: fieldReport.notes ?? t.common.notAvailable },
                  ...(fieldReport.status === "completed" ? [{
                    label: t.pages.mutations.fieldFinding,
                    value: fieldReport.disputeFound
                      ? t.pages.mutations.disputeReported
                      : t.pages.mutations.noDisputeReported,
                  }] : []),
                  ...(fieldReport.disputeDescription ? [{
                    label: t.pages.mutations.agentDisputeDescription,
                    value: fieldReport.disputeDescription,
                  }] : []),
                  ...(fieldReport.reviewedAt ? [{
                    label: t.pages.mutations.investigationAccepted,
                    value: f.dateTime(fieldReport.reviewedAt),
                  }] : []),
                ]} />
                {role === "land-office" && mutation.status === "field-investigation" && fieldReport.status === "completed" && !fieldReport.reviewedAt ? (
                  <Button
                    type="button"
                    disabled={reviewInvestigation.isPending}
                    onClick={() => reviewInvestigation.mutate(fieldReport.id, {
                      onSuccess: () => toast.success(t.pages.mutations.investigationAcceptedTitle),
                      onError: () => toast.error(t.pages.mutations.investigationAcceptFailed),
                    })}
                  >
                    {reviewInvestigation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    {t.pages.mutations.acceptInvestigation}
                  </Button>
                ) : null}
              </div>
            ) : role === "land-office" && mutation.status === "field-investigation" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Select value={agentId} onValueChange={(value) => setAgentId(value ?? "")}>
                  <SelectTrigger><SelectValue placeholder={t.pages.mutations.selectFieldAgent} /></SelectTrigger>
                  <SelectContent>
                    {eligibleAgents.map(({ agent }) => (
                      <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} />
                <Button
                  disabled={!agentId || !scheduledFor || assignSurvey.isPending}
                  onClick={() => assignSurvey.mutate({
                    parcelId: mutation.parcelId,
                    mutationId: mutation.id,
                    purpose: "boundary-survey",
                    assignedAgentId: agentId,
                    scheduledFor: new Date(scheduledFor).toISOString(),
                    addressHint: parcel?.title,
                  }, {
                    onSuccess: () => toast.success(t.pages.agents.assignedTitle),
                    onError: () => toast.error(t.pages.agents.failedTitle, {
                      description: t.pages.agents.failedBody,
                    }),
                  })}
                >
                  {assignSurvey.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {t.pages.mutations.assignFieldAgent}
                </Button>
              </div>
            ) : mutation.status === "submitted" || mutation.status === "under-primary-verification" ? (
              <p className="text-sm text-muted-foreground">{t.pages.mutations.fieldInvestigationPending}</p>
            ) : null}
          </DetailSection>

          <DetailSection title={t.pages.mutations.ownershipChange}>
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
              <span>{mutation.fromOwnerName}</span>
              <ArrowRight className="size-4 text-marker" aria-hidden />
              <span>{mutation.toOwnerName}</span>
            </div>
            <DefinitionList
              rows={[
                { label: t.pages.mutations.fromOwner, value: mutation.fromOwnerName },
                { label: t.pages.mutations.toOwner, value: mutation.toOwnerName },
              ]}
            />
          </DetailSection>

          <DetailSection title={t.pages.mutations.landInformation}>
            {parcel ? (
              <DefinitionList
                rows={[
                  { label: t.pages.mutations.parcel, value: parcel.title },
                  { label: t.pages.mutations.dag, value: <IdChip icon={MapPin}>{parcel.dagNo}</IdChip> },
                  { label: t.pages.mutations.khatian, value: parcel.khatianNo },
                  { label: t.pages.mutations.landUse, value: t.domain.landUse[parcel.landUse] },
                  { label: t.pages.mutations.area, value: f.area(parcel.area) },
                ]}
              />
            ) : (
              <span className="text-sm text-muted-foreground">{t.common.notAvailable}</span>
            )}
          </DetailSection>

          <DetailSection title={t.pages.mutations.documents}>
            {presentation.documents.length ? (
              <ul className="divide-y divide-border">
                {presentation.documents.map(({ document, verificationStatus }) => {
                  const previewUrl = document.thumbnailUrl?.trim();
                  const canPreview = isUsableMutationPreviewUrl(previewUrl);
                  return (
                    <li key={document.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium text-foreground">{document.fileName}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t.domain.documentType[document.type]} · {f.fileSize(document.sizeBytes)}
                          {document.pageCount ? ` · ${t.pages.mutations.documentPages(document.pageCount)}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.pages.mutations.documentUploaded(f.date(document.uploadedAt))}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <StatusMetaBadge meta={s.verification[verificationStatus]} />
                        {canPreview && previewUrl ? (
                          <a
                            href={previewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {t.common.view}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t.pages.mutations.documentUnavailable}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <span className="text-sm text-muted-foreground">{t.common.none}</span>
            )}
          </DetailSection>

          <DetailSection title={t.pages.mutations.verification}>
            <div className="space-y-3">
              {mutation.verificationStartedAt ? (
                <p className="text-sm text-muted-foreground">
                  {t.pages.mutations.verificationStarted(f.dateTime(mutation.verificationStartedAt))}
                  {verificationStartedBy ? ` · ${t.pages.mutations.verificationStartedBy}: ${verificationStartedBy.name}` : ""}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t.pages.mutations.verificationNotStarted}</p>
              )}
              {mutation.verifiedAt ? (
                <p className="text-sm text-muted-foreground">
                  {t.pages.mutations.verificationCompleted(f.dateTime(mutation.verifiedAt))}
                  {verifiedBy ? ` · ${t.pages.mutations.verifiedBy}: ${verifiedBy.name}` : ""}
                </p>
              ) : null}
              {mutation.verificationChecklist ? (
                <ul className="space-y-2">
                  {CHECKLIST_KEYS.map((key) => (
                    <li key={key} className="flex items-center justify-between gap-3 text-sm">
                      <span>{t.pages.mutations[key]}</span>
                      <span className="text-muted-foreground">
                        {mutation.verificationChecklist?.[key] ? t.common.yes : t.common.no}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {mutation.verificationNotes ? (
                <div>
                  <p className="text-xs text-muted-foreground">{t.pages.mutations.verificationNotes}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                    {mutation.verificationNotes}
                  </p>
                </div>
              ) : null}
              {role === "land-office" && action?.primary === "start-verification" ? (
                <Button type="button" disabled={start.isPending} onClick={startVerification}>
                  {start.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {start.isPending
                    ? t.pages.mutations.startingVerification
                    : t.pages.mutations.startVerification}
                </Button>
              ) : null}
              {role === "land-office" && action?.primary === "complete-verification" ? (
                <MutationVerificationForm
                  key={`${mutation.id}-${open}`}
                  mutation={mutation}
                  onSuccess={() => undefined}
                />
              ) : null}
            </div>
          </DetailSection>

          <DetailSection title={t.pages.mutations.objections}>
            <div className="space-y-3">
              {mutation.disputeId ? (
                <StatusMetaBadge meta={s.registry.disputed} />
              ) : role === "land-office" && mutation.status === "field-verification-complete" && fieldReport?.reviewedAt && fieldReport.disputeFound ? (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <Textarea
                    value={disputeDescription}
                    onChange={(event) => setDisputeDescription(event.target.value)}
                    placeholder={t.pages.capture.disputeDescription}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!disputeDescription.trim() || flagDispute.isPending}
                    onClick={() => flagDispute.mutate(disputeDescription.trim())}
                  >
                    {t.pages.capture.disputeFound}
                  </Button>
                </div>
              ) : null}
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">{t.pages.mutations.objectionTotal}</dt>
                  <dd className="text-sm text-foreground">{objectionSummary.total}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t.pages.mutations.objectionUnresolved}</dt>
                  <dd className="text-sm text-foreground">{objectionSummary.unresolved}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t.pages.mutations.objectionStatus}</dt>
                  <dd className="text-sm text-foreground">{objectionSummary.status}</dd>
                </div>
              </dl>
              {mutation.objectionStartDate ? (
                <p className="text-sm text-muted-foreground">
                  {t.pages.mutations.objectionWindowStarts(f.dateTime(mutation.objectionStartDate))}
                </p>
              ) : null}
              {mutation.objectionWindowEndsAt ? (
                <p className="text-sm text-muted-foreground">
                  {t.pages.mutations.objectionWindowEnds(f.dateTime(mutation.objectionWindowEndsAt))}
                </p>
              ) : null}
              {mutation.objections.length ? (
                <ul className="space-y-3">
                  {mutation.objections.map((objection) => (
                    <li key={objection.id} className="rounded-lg bg-muted/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {t.pages.mutations.objectionBy(objection.by, f.dateTime(objection.at))}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {objection.status === "resolved"
                            ? t.pages.mutations.objectionResolved
                            : t.pages.mutations.objectionOpen}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{objection.reason}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t.pages.mutations.noObjections}</p>
              )}
              {role === "land-office" && action?.holdCode === "assigned-to-other-officer" ? (
                <p className="text-sm text-muted-foreground">{t.pages.mutations.hold.assignedToOther}</p>
              ) : null}
              {role === "land-office" && action?.hold?.code === "objections" ? (
                <p className="text-sm text-muted-foreground">{t.pages.mutations.hold.objections(action.hold.count)}</p>
              ) : null}
              {role === "land-office" && action?.hold?.code === "objection-window" ? (
                <p className="text-sm text-muted-foreground">{t.pages.mutations.hold.objectionWindow(action.hold.days)}</p>
              ) : null}
              {role === "land-office" && action?.hold?.code === "no-recipient" ? (
                <p className="text-sm text-muted-foreground">{t.pages.mutations.hold.noRecipient}</p>
              ) : null}
              {role === "land-office" && action?.primary === "approve" && !requiresDisputeEntry ? (
                <Button type="button" onClick={() => setDecision("approve")}>
                  {t.pages.mutations.approve}
                </Button>
              ) : null}
              {role === "land-office" && action?.canReject && !requiresDisputeEntry ? (
                <Button type="button" variant="destructive" onClick={() => setDecision("reject")}>
                  {t.pages.mutations.reject}
                </Button>
              ) : null}
            </div>
          </DetailSection>

          <DetailSection title={t.pages.mutations.timeline}>
            {timeline.length ? (
              <ol className="space-y-4 border-l border-border pl-4">
                {timeline.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute top-1.5 -left-[1.32rem] size-2 rounded-full bg-marker" />
                    <p className="font-medium text-foreground">{timelineActionLabel(event.action, t)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.pages.mutations.timelineBy(event.actorName, f.dateTime(event.at))}
                    </p>
                    {event.previousStatus && event.newStatus ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t.pages.mutations.timelineStatus(
                          s.mutation[event.previousStatus].label,
                          s.mutation[event.newStatus].label,
                        )}
                      </p>
                    ) : null}
                    {event.note ? <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{event.note}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">{t.common.none}</p>
            )}
          </DetailSection>
        </div>
      </ScrollArea>

      {decision ? (
        <MutationDecisionDialog
          key={`${mutation.id}-${decision}`}
          mutation={mutation}
          decision={decision}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setDecision(null);
          }}
        />
      ) : null}
    </>
  );
}

export function MutationDetailDialog({
  mutationId,
  open,
  onOpenChange,
}: {
  mutationId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const detail = useMutationById(mutationId);
  const notFound = detail.error instanceof ApiError && detail.error.status === 404;
  const presentation = mutationDetailPresentation(detail.data, mutationId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-4 py-4 pr-12">
          <DialogTitle>{t.pages.mutations.detailTitle}</DialogTitle>
          <DialogDescription>
            {presentation.identifier ? <IdChip>{presentation.identifier}</IdChip> : null}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="space-y-4 p-4" aria-label={t.pages.mutations.loadingDetail}>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : detail.isError ? (
          <div className="space-y-4 p-4">
            <p className="text-sm text-muted-foreground">
              {notFound ? t.pages.mutations.notFound : t.pages.mutations.detailFailed}
            </p>
            {!notFound ? (
              <Button type="button" variant="outline" onClick={() => void detail.refetch()}>
                {t.pages.mutations.retry}
              </Button>
            ) : null}
          </div>
        ) : detail.data ? (
          <MutationDetailContent detail={detail.data} open={open} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
