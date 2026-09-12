"use client";

import { useState } from "react";
import { ArrowRight, FileText, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { IdChip } from "@/components/id-chip";
import { MutationDecisionDialog } from "@/components/mutations/mutation-decision-dialog";
import { MutationVerificationForm } from "@/components/mutations/mutation-verification-form";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
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
import {
  useMutationById,
  useRole,
  useSession,
  useStartMutationVerification,
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

const CHECKLIST_KEYS: (keyof MutationVerificationChecklist)[] = [
  "applicantVerified",
  "previousOwnerVerified",
  "proposedOwnerVerified",
  "dagKhatianVerified",
  "deedVerified",
  "landRecordMatched",
  "documentsPresent",
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
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const { mutation, parcel, applicant, assignedOfficer, timeline } = detail;
  const presentation = mutationDetailPresentation(detail);
  const actorId = session.data?.user.id;
  const action = actorId ? mutationActionState(mutation, actorId) : null;

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
              ]}
            />
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
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t.pages.mutations.verificationNotStarted}</p>
              )}
              {mutation.verifiedAt ? (
                <p className="text-sm text-muted-foreground">
                  {t.pages.mutations.verificationCompleted(f.dateTime(mutation.verifiedAt))}
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
              {role === "land-office" && action?.primary === "approve" ? (
                <Button type="button" onClick={() => setDecision("approve")}>
                  {t.pages.mutations.approve}
                </Button>
              ) : null}
              {role === "land-office" && action?.canReject ? (
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
