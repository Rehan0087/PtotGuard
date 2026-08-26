"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, FileText, Scale, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { executionGate, type ParcelRestriction, type RestrictionType, type RulingOutcome } from "@plotguard/rules";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useDispute, useExecuteRuling, useRole } from "@/hooks/queries";
import { useDisputeEventTitle } from "@/lib/i18n/content";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";

const RESTRICTION_TYPES: RestrictionType[] = [
  "mortgage",
  "injunction",
  "attachment",
  "acquisition",
  "non-transferable",
];

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * The step a ruling used to stop short of: land office turns "resolved"
 * into an actual change on the parcel record. Only shown to the role that
 * does this (land-office), only once there's a ruling to execute, and only
 * until it's been executed once — executionGate() is the same gate the
 * endpoint enforces, so this is explanation, not the only thing stopping a
 * bad request.
 */
function ExecuteRulingCard({
  disputeId,
  status,
  recordsExecutedAt,
  activeRestrictions,
}: {
  disputeId: string;
  status: string;
  recordsExecutedAt?: string;
  activeRestrictions: ParcelRestriction[];
}) {
  const t = useT();
  const et = t.pages.dispute.execute;
  const execute = useExecuteRuling(disputeId);

  const [action, setAction] = useState<RulingOutcome["action"]>("no-change");
  const [restrictionType, setRestrictionType] = useState<RestrictionType>("injunction");
  const [authority, setAuthority] = useState("");
  const [note, setNote] = useState("");
  const [restrictionId, setRestrictionId] = useState(activeRestrictions[0]?.id ?? "");

  if (recordsExecutedAt) return null;

  const outcome: RulingOutcome =
    action === "restriction-added"
      ? { action, restrictionType, authority, note: note || undefined }
      : action === "restriction-removed"
        ? { action, restrictionId }
        : { action };

  const review = executionGate(
    { status: status as never, recordsExecutedAt },
    outcome,
    activeRestrictions.map((r) => r.id),
  );

  function submit() {
    execute.mutate(outcome, {
      onSuccess: () => toast.success(et.successTitle),
      onError: () => toast.error(et.failedTitle),
    });
  }

  return (
    <Card className="gap-3 px-4">
      <h3 className="font-heading text-sm font-semibold text-foreground">{et.title}</h3>
      <p className="text-xs text-muted-foreground">{et.description}</p>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-muted-foreground">{et.outcomeLabel}</label>
        <select
          className={selectClass}
          value={action}
          onChange={(e) => setAction(e.target.value as RulingOutcome["action"])}
        >
          {(
            [
              "no-change",
              "restriction-added",
              "restriction-removed",
              "referred-to-mutation",
            ] satisfies RulingOutcome["action"][]
          ).map((a) => (
            <option key={a} value={a}>
              {t.domain.rulingOutcome[a]}
            </option>
          ))}
        </select>
      </div>

      {action === "restriction-added" ? (
        <>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              {et.restrictionTypeLabel}
            </label>
            <select
              className={selectClass}
              value={restrictionType}
              onChange={(e) => setRestrictionType(e.target.value as RestrictionType)}
            >
              {RESTRICTION_TYPES.map((rt) => (
                <option key={rt} value={rt}>
                  {t.domain.restrictionType[rt]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              {et.authorityLabel}
            </label>
            <input
              className={selectClass}
              value={authority}
              placeholder={et.authorityPlaceholder}
              onChange={(e) => setAuthority(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">{et.noteLabel}</label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </>
      ) : null}

      {action === "restriction-removed" ? (
        activeRestrictions.length === 0 ? (
          <p className="text-xs text-muted-foreground">{et.noActiveRestrictions}</p>
        ) : (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              {et.restrictionToLiftLabel}
            </label>
            <select
              className={selectClass}
              value={restrictionId}
              onChange={(e) => setRestrictionId(e.target.value)}
            >
              {activeRestrictions.map((r) => (
                <option key={r.id} value={r.id}>
                  {t.domain.restrictionType[r.type]} — {r.authority}
                </option>
              ))}
            </select>
          </div>
        )
      ) : null}

      <Button
        type="button"
        size="sm"
        disabled={!review.canExecute || execute.isPending}
        onClick={submit}
      >
        {et.submit}
      </Button>
    </Card>
  );
}

export default function DisputeDetailPage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const role = useRole();
  const eventTitle = useDisputeEventTitle();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useDispute(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={Scale}
        title={t.pages.dispute.notFoundTitle}
        description={t.pages.dispute.notFoundBody}
      >
        <Link href="/disputes" className="text-sm text-primary hover:underline">
          {t.pages.dispute.backToDisputes}
        </Link>
      </EmptyState>
    );
  }

  const { dispute, timeline, parcel, evidence, activeRestrictions } = data;

  return (
    <div className="space-y-6">
      <Link
        href="/disputes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t.pages.dispute.backToDisputes}
      </Link>

      <PageHeader
        eyebrow={<IdChip icon={Scale}>{dispute.caseNumber}</IdChip>}
        title={t.pages.dispute.heading(t.domain.disputeType[dispute.type])}
        description={dispute.description}
      >
        <StatusMetaBadge meta={s.dispute[dispute.status]} />
        <StatusMetaBadge meta={s.priority[dispute.priority]} dot={false} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-4 font-heading text-base font-semibold text-foreground">
            {t.pages.dispute.timeline}
          </h2>
          <ol className="relative border-l border-border pl-6">
            {timeline.map((e, i) => (
              <li key={e.id} className="relative pb-6 last:pb-0">
                <span
                  className={`absolute -left-[1.6rem] top-0.5 flex size-3 items-center justify-center rounded-full ring-4 ring-background ${
                    i === timeline.length - 1 ? "bg-marker" : "bg-primary"
                  }`}
                  aria-hidden
                />
                <div className="text-sm font-medium text-foreground">{eventTitle(e)}</div>
                {e.description ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{e.description}</p>
                ) : null}
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{f.dateTime(e.at)}</span>
                  {e.actorName ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>{e.actorName}</span>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
            {timeline.length === 0 ? (
              <li className="text-sm text-muted-foreground">{t.pages.dispute.noEvents}</li>
            ) : null}
          </ol>
        </div>

        <div className="space-y-6">
          <Card className="gap-3 px-4">
            <h3 className="font-heading text-sm font-semibold text-foreground">
              {t.pages.dispute.details}
            </h3>
            <dl className="grid gap-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t.pages.dispute.filedBy}</dt>
                <dd className="text-right font-medium text-foreground">{dispute.filedByName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t.pages.dispute.filed}</dt>
                <dd className="text-right text-foreground">{f.date(dispute.filedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t.pages.dispute.lastUpdate}</dt>
                <dd className="text-right text-foreground">{f.fromNow(dispute.updatedAt)}</dd>
              </div>
              {dispute.hearingDate ? (
                <div className="flex justify-between gap-3">
                  <dt className="inline-flex items-center gap-1 text-muted-foreground">
                    <CalendarClock className="size-3.5" /> {t.pages.dispute.hearing}
                  </dt>
                  <dd className="text-right font-medium text-marker">
                    {f.date(dispute.hearingDate)}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="border-t border-border pt-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {t.pages.dispute.parties}
              </div>
              <ul className="space-y-1.5">
                {dispute.parties.map((p, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.domain.partyRole[p.role]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {parcel ? (
              <Link
                href={`/parcels/${parcel.id}`}
                className="flex items-center gap-2 border-t border-border pt-3 text-sm text-primary hover:underline"
              >
                <MapPin className="size-4" />
                {t.components.disputeListItem.dag(parcel.dagNo)} · {parcel.title}
              </Link>
            ) : null}
          </Card>

          {role === "land-office" && dispute.status === "resolved" ? (
            <ExecuteRulingCard
              disputeId={dispute.id}
              status={dispute.status}
              recordsExecutedAt={dispute.recordsExecutedAt}
              activeRestrictions={activeRestrictions}
            />
          ) : null}

          {evidence.length > 0 ? (
            <section>
              <h3 className="mb-2 font-heading text-sm font-semibold text-foreground">
                {t.pages.dispute.evidence}
              </h3>
              <div className="space-y-2">
                {evidence.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5"
                  >
                    <FileText className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {d.fileName}
                    </span>
                    <StatusMetaBadge meta={s.verification[d.verificationStatus]} dot={false} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
