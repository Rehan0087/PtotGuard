"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  FileText,
  Gavel,
  MapPin,
  Scale,
  Users,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useDispute,
  useHearing,
  useHearingRuling,
  useReassignHearing,
  useRecordHearingSession,
  useRescheduleHearing,
  useUpdateHearingStatus,
  useUsers,
} from "@/hooks/queries";
import {
  hearingNextStatuses,
  isHearingOpen,
  rulingGate,
  type HearingStatus,
  type MediationOutcome,
  type RulingBlocker,
} from "@plotguard/rules";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import type { Dictionary } from "@/lib/i18n";

/** Codes from the gate, worded per locale. See lib/hearings.ts. */
function blockerText(t: Dictionary, b: RulingBlocker): string {
  const w = t.pages.hearing.blocker;
  switch (b.code) {
    case "already-decided":
      return w.alreadyDecided;
    case "no-sessions":
      return w.noSessions;
    case "unheard":
      return w.unheard(b.parties.join(", "));
    case "need-ruling":
      return w.needRuling;
  }
}

export default function CaseDetailPage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useHearing(id);
  // The dispute carries the evidence; the hearing record does not.
  const disputeQ = useDispute(data?.hearing?.disputeId);
  const mediatorsQ = useUsers({ role: "mediator", pageSize: 100 });
  const recordSession = useRecordHearingSession(id);
  const issueRuling = useHearingRuling(id);
  const changeStatus = useUpdateHearingStatus(id);
  const adjourn = useRescheduleHearing(id);
  const reassign = useReassignHearing(id);

  const [summary, setSummary] = useState("");
  const [present, setPresent] = useState<string[]>([]);
  const [ruling, setRuling] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<MediationOutcome | "">("");
  const [adjournTo, setAdjournTo] = useState("");
  const [adjournReason, setAdjournReason] = useState("");
  const [nextMediator, setNextMediator] = useState("");

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
      <EmptyState icon={Gavel} title={t.pages.hearing.notFound}>
        <Link href="/cases" className="text-sm text-primary hover:underline">
          {t.pages.hearing.backToCases}
        </Link>
      </EmptyState>
    );
  }

  const { hearing, dispute } = data;
  // Seed from the saved ruling once, then the field owns it.
  const draftRuling = ruling ?? hearing.ruling ?? "";
  const review = rulingGate(hearing, draftRuling);
  // ruled, appealed, or closed — isHearingOpen() is the same answer the
  // endpoints give, so the screen and the record cannot disagree.
  const open = isHearingOpen(hearing.status as HearingStatus);
  const decided = !open;

  const otherMediators = (mediatorsQ.data?.items ?? []).filter(
    (m) => m.id !== hearing.mediatorId && m.status === "active",
  );
  const evidence = disputeQ.data?.evidence ?? [];

  const togglePresent = (party: string, on: boolean) =>
    setPresent((prev) => (on ? [...prev, party] : prev.filter((p) => p !== party)));

  const saveSession = async () => {
    await recordSession.mutateAsync({ summary, attendees: present });
    setSummary("");
    setPresent([]);
    toast.success(t.pages.hearing.sessionSaved);
  };

  const rule = async () => {
    if (!outcome) return;
    await issueRuling.mutateAsync({ ruling: draftRuling, outcome });
    toast.success(t.pages.hearing.ruled);
  };

  return (
    <div className="space-y-6">
      <Link
        href="/cases"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t.pages.hearing.backToCases}
      </Link>

      <PageHeader
        eyebrow={<IdChip icon={Gavel}>{hearing.caseNumber}</IdChip>}
        title={
          dispute
            ? t.pages.dispute.heading(t.domain.disputeType[dispute.type])
            : hearing.caseNumber
        }
        description={dispute?.description}
      >
        <StatusMetaBadge meta={s.hearing[hearing.status]} />
      </PageHeader>

      <div className="grid gap-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5" />
          {t.components.disputeListItem.dag(hearing.parcelDagNo)}
        </span>
        {hearing.hearingDate ? (
          <span className="inline-flex items-center gap-1.5 text-marker">
            {t.pages.hearing.scheduledFor(f.dateTime(hearing.hearingDate))}
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Sittings ---------------------------------------------------- */}
          <Card className="gap-4 px-4">
            <h2 className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <Scale className="size-4 text-marker" />
              {t.pages.hearing.sessions}
            </h2>

            {hearing.sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t.pages.hearing.noSessions}</p>
            ) : (
              <ol className="space-y-2">
                {hearing.sessions.map((session) => (
                  <li
                    key={session.id}
                    className="rounded-md bg-secondary/40 px-3 py-2.5 text-xs"
                  >
                    <div className="text-muted-foreground">{f.dateTime(session.at)}</div>
                    <p className="mt-1 text-sm text-foreground">{session.summary}</p>
                    {session.attendees.length > 0 ? (
                      <div className="mt-1.5 text-muted-foreground">
                        <span className="font-medium">{t.pages.hearing.attendees}: </span>
                        {session.attendees.join(", ")}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}

            {!decided ? (
              <div className="space-y-2 border-t border-border pt-3">
                <div>
                  <Label htmlFor="summary" className="text-xs">
                    {t.pages.hearing.summary}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t.pages.hearing.summaryHint}
                  </p>
                </div>
                <Textarea
                  id="summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder={t.pages.hearing.summaryPlaceholder}
                  rows={3}
                />

                <div>
                  <div className="text-xs font-medium text-foreground">
                    {t.pages.hearing.whoAttended}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.pages.hearing.whoAttendedHint}
                  </p>
                </div>
                <div className="grid gap-1.5">
                  {hearing.parties.map((party) => (
                    <label
                      key={party}
                      className="flex items-center gap-2.5 rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-border"
                    >
                      <Checkbox
                        checked={present.includes(party)}
                        onCheckedChange={(v) => togglePresent(party, Boolean(v))}
                      />
                      <span>{party}</span>
                    </label>
                  ))}
                </div>

                <Button
                  size="sm"
                  className="w-fit"
                  disabled={!summary.trim() || recordSession.isPending}
                  onClick={saveSession}
                >
                  {recordSession.isPending
                    ? t.pages.hearing.savingSession
                    : t.pages.hearing.saveSession}
                </Button>
              </div>
            ) : null}
          </Card>

          {/* Ruling ------------------------------------------------------- */}
          <Card className="gap-3 px-4">
            <div>
              <h2 className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <Gavel className="size-4 text-marker" />
                {t.pages.hearing.ruling}
              </h2>
              <p className="text-xs text-muted-foreground">{t.pages.hearing.rulingHint}</p>
            </div>

            {decided ? (
              <>
                {hearing.outcome ? (
                  <p className="text-sm font-medium text-foreground">
                    {hearing.outcome === "resolved"
                      ? t.pages.hearing.outcomeResolved
                      : t.pages.hearing.outcomeUnresolved}
                  </p>
                ) : null}
                <p className="rounded-md bg-secondary/50 px-3 py-2 text-sm text-secondary-foreground">
                  {hearing.ruling ?? t.common.notAvailable}
                </p>
                {hearing.ruledAt ? (
                  <p className="text-xs text-muted-foreground">
                    {t.pages.hearing.ruledAt(f.dateTime(hearing.ruledAt))}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="mediation-outcome" className="text-xs">
                    {t.pages.hearing.outcome}
                  </Label>
                  <select
                    id="mediation-outcome"
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    value={outcome}
                    onChange={(event) => setOutcome(event.target.value as MediationOutcome | "")}
                  >
                    <option value="">{t.pages.hearing.pickOutcome}</option>
                    <option value="resolved">{t.pages.hearing.outcomeResolved}</option>
                    <option value="unresolved">{t.pages.hearing.outcomeUnresolved}</option>
                  </select>
                </div>
                <Textarea
                  value={draftRuling}
                  onChange={(e) => setRuling(e.target.value)}
                  placeholder={t.pages.hearing.rulingPlaceholder}
                  rows={4}
                />

                {review.blockers.length > 0 ? (
                  <Alert>
                    <AlertDescription>
                      <span className="font-medium">{t.pages.hearing.needsBefore}</span>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {review.blockers.map((b) => (
                          <li key={b.code}>{blockerText(t, b)}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                ) : null}

                <Button
                  className="w-fit"
                  disabled={!review.canRule || !outcome || issueRuling.isPending}
                  onClick={rule}
                >
                  <Gavel className="size-3.5" />
                  {issueRuling.isPending
                    ? t.pages.hearing.issuing
                    : t.pages.hearing.issueRuling}
                </Button>
              </>
            )}
          </Card>
        </div>

        {/* What a mediator can still do with the case ------------------- */}
        <Card className="h-fit gap-4 px-4">
          <h2 className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
            <CalendarClock className="size-4 text-marker" />
            {t.pages.hearing.actions}
          </h2>

          {open ? (
            <div className="space-y-1.5">
              <Label htmlFor="adjourn-to" className="text-xs text-muted-foreground">
                {t.pages.hearing.adjournTo}
              </Label>
              <Input
                id="adjourn-to"
                type="datetime-local"
                className="h-8"
                value={adjournTo}
                onChange={(e) => setAdjournTo(e.target.value)}
              />
              <Input
                aria-label={t.pages.hearing.adjournReason}
                placeholder={t.pages.hearing.adjournReason}
                className="h-8"
                value={adjournReason}
                onChange={(e) => setAdjournReason(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!adjournTo || adjourn.isPending}
                onClick={() =>
                  adjourn.mutate(
                    {
                      hearingDate: new Date(adjournTo).toISOString(),
                      reason: adjournReason || undefined,
                    },
                    {
                      onSuccess: () => {
                        setAdjournTo("");
                        setAdjournReason("");
                        toast.success(t.pages.hearing.adjourned);
                      },
                      onError: () => toast.error(t.pages.hearing.actionFailed),
                    },
                  )
                }
              >
                {t.pages.hearing.adjournAction}
              </Button>
            </div>
          ) : null}

          {/* Only the moves the gate accepts: a ruling has its own form, and
              a sitting is what makes a case "in hearing". */}
          {hearingNextStatuses(hearing.status as HearingStatus).length > 0 ? (
            <div className="space-y-1.5">
              <span className="block text-xs text-muted-foreground">
                {t.pages.hearing.moveTo}
              </span>
              <div className="flex flex-wrap gap-2">
                {hearingNextStatuses(hearing.status as HearingStatus).map((to) => (
                  <Button
                    key={to}
                    size="sm"
                    variant="outline"
                    disabled={changeStatus.isPending}
                    onClick={() =>
                      changeStatus.mutate(
                        { status: to },
                        {
                          onSuccess: () =>
                            toast.success(t.pages.hearing.statusChanged(s.hearing[to].label)),
                          onError: () => toast.error(t.pages.hearing.actionFailed),
                        },
                      )
                    }
                  >
                    {s.hearing[to].label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {open ? (
            <div className="space-y-1.5">
              <Label htmlFor="next-mediator" className="text-xs text-muted-foreground">
                <UserCog className="mr-1 inline size-3.5" />
                {t.pages.hearing.reassignTo}
              </Label>
              <select
                id="next-mediator"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={nextMediator}
                onChange={(e) => setNextMediator(e.target.value)}
              >
                <option value="">{t.pages.hearing.pickMediator}</option>
                {otherMediators.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={!nextMediator || reassign.isPending}
                onClick={() =>
                  reassign.mutate(
                    { mediatorId: nextMediator },
                    {
                      onSuccess: () => {
                        setNextMediator("");
                        toast.success(t.pages.hearing.reassigned);
                      },
                      onError: () => toast.error(t.pages.hearing.actionFailed),
                    },
                  )
                }
              >
                {t.pages.hearing.reassignAction}
              </Button>
            </div>
          ) : null}
        </Card>

        {/* The evidence being ruled on, on the screen where it is ruled on */}
        {evidence.length > 0 ? (
          <Card className="h-fit gap-3 px-4">
            <h2 className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <FileText className="size-4 text-marker" />
              {t.pages.hearing.evidence}
            </h2>
            <ul className="space-y-2">
              {evidence.map((d) => (
                <li key={d.id} className="flex items-center gap-2.5 text-sm">
                  <FileText className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-foreground">{d.fileName}</span>
                  <StatusMetaBadge meta={s.verification[d.verificationStatus]} dot={false} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* Parties ------------------------------------------------------- */}
        <Card className="h-fit gap-3 px-4">
          <h2 className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
            <Users className="size-4 text-marker" />
            {t.pages.hearing.parties}
          </h2>
          <ul className="space-y-1.5">
            {hearing.parties.map((party) => {
              const wasHeard = review.heard.includes(party);
              return (
                <li key={party} className="text-sm">
                  <div className="text-foreground">{party}</div>
                  <div
                    className={
                      wasHeard ? "text-xs text-muted-foreground" : "text-xs text-pending"
                    }
                  >
                    {wasHeard ? t.pages.hearing.heard : t.pages.hearing.notHeard}
                  </div>
                </li>
              );
            })}
          </ul>

          {dispute ? (
            <Link
              href={`/disputes/${hearing.disputeId}`}
              className="inline-flex w-fit items-center gap-1 text-sm text-primary hover:underline"
            >
              {t.pages.cases.viewDispute} <ArrowRight className="size-3.5" />
            </Link>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
