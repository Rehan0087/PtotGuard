"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardCheck,
  Loader2,
  MapPin,
  Navigation,
  UserPlus,
  Users2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDisputes,
  useFieldReports,
  useUsers,
  useParcels,
  useJurisdictions,
  useAssignFieldSurvey,
} from "@/hooks/queries";
import {
  disputesNeedingSurvey,
  isOpenVisit,
  rankCandidates,
  COMFORTABLE_LOAD,
  PURPOSE_FOR_DISPUTE,
} from "@plotguard/rules";
import type { CandidateBlocker, CandidateNote } from "@plotguard/rules";
import { initials } from "@/lib/format";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import type { Dictionary } from "@/lib/i18n";
import { useJurisdictionName } from "@/components/jurisdiction-name";
import { cn } from "@/lib/utils";
import type {
  Dispute,
  FieldReport,
  FieldReportPurpose,
  Jurisdiction,
  Parcel,
  User,
} from "@/lib/types";

/**
 * The ranker states its reasons as codes; the wording is the screen's job.
 * `area` resolves a jurisdiction id to the name this reader should see.
 */
function blockerText(
  blocker: CandidateBlocker,
  t: Dictionary,
  area: (id: string) => string,
): string {
  return blocker.code === "inactive"
    ? t.pages.agents.blocker.inactive(t.status.user[blocker.status])
    : t.pages.agents.blocker.outsideArea(
        area(blocker.agentAreaId),
        area(blocker.parcelAreaId),
      );
}

function noteText(
  note: CandidateNote,
  t: Dictionary,
  area: (id: string) => string,
): string {
  switch (note.code) {
    case "heavy-load":
      return t.pages.agents.note.heavyLoad(note.openVisits);
    case "same-parcel":
      return t.pages.agents.note.sameParcel;
    case "outside-area":
      return t.pages.agents.note.outsideArea(
        area(note.agentAreaId),
        area(note.parcelAreaId),
      );
  }
}

const PURPOSES: FieldReportPurpose[] = [
  "boundary-survey",
  "encroachment-check",
  "possession-verify",
  "measurement",
];

/** Tomorrow mid-morning, in the format a datetime-local input wants. */
function defaultSlot(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

// --- Assignment panel ------------------------------------------------------

function AssignPanel({
  dispute,
  parcel,
  agents,
  reports,
  jurisdictions,
  onCancel,
}: {
  dispute: Dispute;
  parcel?: Parcel;
  agents: User[];
  reports: FieldReport[];
  jurisdictions: Jurisdiction[];
  onCancel: () => void;
}) {
  const t = useT();
  const f = useFmt();
  const resolveName = useJurisdictionName();
  const areaName = (id: string) =>
    resolveName(jurisdictions.find((j) => j.id === id)) || t.common.unknown;
  const [purpose, setPurpose] = useState<FieldReportPurpose>(
    PURPOSE_FOR_DISPUTE[dispute.type],
  );
  const [scheduledFor, setScheduledFor] = useState(defaultSlot);
  const [allowOutside, setAllowOutside] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const assign = useAssignFieldSurvey();

  const candidates = rankCandidates(parcel, agents, reports, jurisdictions, allowOutside);
  const chosen = candidates.find((c) => c.agent.id === agentId) ?? null;
  const inArea = candidates.filter((c) => !c.needsJurisdictionOverride && !c.blocker);
  const canSubmit = Boolean(chosen && !chosen.blocker && scheduledFor) && !assign.isPending;

  function submit() {
    if (!chosen || !parcel) return;
    assign.mutate(
      {
        parcelId: parcel.id,
        parcelDagNo: parcel.dagNo,
        disputeId: dispute.id,
        purpose,
        assignedAgentId: chosen.agent.id,
        scheduledFor: new Date(scheduledFor).toISOString(),
        addressHint: parcel.title,
      },
      {
        onSuccess: () =>
          toast.success(t.pages.agents.assignedTitle, {
            description: t.pages.agents.assignedBody(
              chosen.agent.name,
              dispute.parcelDagNo,
              f.dateTime(new Date(scheduledFor).toISOString()),
              dispute.caseNumber,
            ),
          }),
        onError: () =>
          toast.error(t.pages.agents.failedTitle, {
            description: t.pages.agents.failedBody,
          }),
      },
    );
  }

  return (
    <div className="space-y-4 rounded-lg bg-muted/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t.pages.agents.surveyType}
          </span>
          <Select value={purpose} onValueChange={(v) => setPurpose(v as FieldReportPurpose)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) => t.domain.surveyPurpose[v as FieldReportPurpose]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PURPOSES.map((p) => (
                <SelectItem key={p} value={p}>
                  {t.domain.surveyPurpose[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label
            htmlFor={`when-${dispute.id}`}
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {t.pages.agents.scheduledFor}
          </label>
          <Input
            id={`when-${dispute.id}`}
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="w-full"
          />
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label={t.pages.agents.agentGroupAria(dispute.caseNumber)}
        className="space-y-1.5"
      >
        <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t.pages.agents.fieldAgent}
        </span>
        {candidates.map((c) => {
          const selected = c.agent.id === agentId;
          return (
            <button
              key={c.agent.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={Boolean(c.blocker)}
              onClick={() => setAgentId(c.agent.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                selected
                  ? "border-marker bg-card ring-1 ring-marker"
                  : "border-border bg-card hover:bg-muted/60",
                c.blocker && "cursor-not-allowed opacity-55 hover:bg-card",
              )}
            >
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-secondary text-xs font-medium text-primary">
                  {initials(c.agent.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-foreground">{c.agent.name}</span>
                  <span className="text-xs text-muted-foreground">{c.agent.title}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t.pages.agents.openVisitCount(c.openVisits)}
                  {c.openVisits > COMFORTABLE_LOAD ? t.pages.agents.heavyLoad : ""}
                </div>
                {c.blocker ? (
                  <p className="mt-1 text-pretty text-xs text-flagged">
                    {blockerText(c.blocker, t, areaName)}
                  </p>
                ) : null}
                {c.notes.map((note) => (
                  <p
                    key={note.code}
                    className={cn(
                      "mt-1 text-pretty text-xs",
                      // The one-trip saving is the good news on this card.
                      note.code === "same-parcel" ? "text-verified" : "text-muted-foreground",
                    )}
                  >
                    {noteText(note, t, areaName)}
                  </p>
                ))}
              </div>
              {selected ? <Check className="size-4 shrink-0 text-marker" /> : null}
            </button>
          );
        })}
      </div>

      {/* The jurisdiction rule has an escape hatch, because offices run short-
          staffed — but taking it is a deliberate act, not a default. */}
      <label
        className={cn(
          "flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm",
          inArea.length === 0
            ? "bg-pending-soft text-pending"
            : "bg-card text-muted-foreground ring-1 ring-border",
        )}
      >
        <Checkbox
          checked={allowOutside}
          onCheckedChange={(v) => {
            setAllowOutside(Boolean(v));
            setAgentId(null);
          }}
          className="mt-0.5"
        />
        <span className="text-pretty">
          {inArea.length === 0
            ? t.pages.agents.noneCoverArea
            : t.pages.agents.allowOutside}
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!canSubmit} onClick={submit}>
          {assign.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CalendarClock className="size-3.5" />
          )}
          {t.pages.agents.book}
        </Button>
        <Button size="sm" variant="ghost" disabled={assign.isPending} onClick={onCancel}>
          {t.common.cancel}
        </Button>
        {chosen?.needsJurisdictionOverride && !chosen.blocker ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-pending">
            <AlertTriangle className="size-3.5" />
            {t.pages.agents.outsideArea(chosen.agent.name.split(" ")[0])}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// --- Job card --------------------------------------------------------------

function JobCard({
  dispute,
  parcel,
  agents,
  reports,
  jurisdictions,
}: {
  dispute: Dispute;
  parcel?: Parcel;
  agents: User[];
  reports: FieldReport[];
  jurisdictions: Jurisdiction[];
}) {
  const t = useT();
  const s = useStatusMeta();
  const [open, setOpen] = useState(false);

  return (
    <Card className="gap-4 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip>{dispute.caseNumber}</IdChip>
            <span className="text-sm text-muted-foreground">
              {t.pages.agents.disputeHeading(t.domain.disputeType[dispute.type])}
            </span>
          </div>
          <p className="max-w-2xl text-pretty text-sm text-foreground">
            {dispute.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <IdChip icon={MapPin}>{dispute.parcelDagNo}</IdChip>
          <StatusMetaBadge meta={s.priority[dispute.priority]} />
          <StatusMetaBadge meta={s.dispute[dispute.status]} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{t.pages.agents.filedBy(dispute.filedByName)}</span>
        {parcel ? (
          <>
            <span aria-hidden>·</span>
            <span>{parcel.title}</span>
          </>
        ) : null}
        <span aria-hidden>·</span>
        <span>
          {t.pages.agents.callsFor(
            t.domain.surveyPurpose[PURPOSE_FOR_DISPUTE[dispute.type]],
          )}
        </span>
      </div>

      {open ? (
        <AssignPanel
          dispute={dispute}
          parcel={parcel}
          agents={agents}
          reports={reports}
          jurisdictions={jurisdictions}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button size="sm" onClick={() => setOpen(true)}>
            <UserPlus className="size-3.5" />
            {t.pages.agents.assign}
          </Button>
          <Link
            href={`/disputes/${dispute.id}`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "ml-auto text-muted-foreground",
            )}
          >
            {t.pages.agents.viewCase}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
    </Card>
  );
}

// --- Screen ----------------------------------------------------------------

export default function AgentsPage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const resolveJurisdictionName = useJurisdictionName();
  const { data: disputesData, isLoading: disputesLoading } = useDisputes({ pageSize: 100 });
  const { data: reportsData, isLoading: reportsLoading } = useFieldReports({ pageSize: 100 });
  const { data: agentsData } = useUsers({ role: "field-agent", pageSize: 50 });
  const { data: parcelsData } = useParcels({ pageSize: 100 });
  const { data: jurisdictionsData } = useJurisdictions();
  const [focusedAgent, setFocusedAgent] = useState<string | null>(null);

  const disputes = disputesData?.items ?? [];
  const reports = reportsData?.items ?? [];
  const agents = agentsData?.items ?? [];
  const jurisdictions = jurisdictionsData ?? [];
  const parcelById = new Map((parcelsData?.items ?? []).map((p) => [p.id, p]));
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const jurisdictionName = (id: string) =>
    resolveJurisdictionName(jurisdictions.find((j) => j.id === id)) || t.common.notAvailable;

  const jobs = disputesNeedingSurvey(disputes, reports);
  const openVisits = reports.filter(isOpenVisit);
  const shownVisits = focusedAgent
    ? openVisits.filter((v) => v.assignedAgentId === focusedAgent)
    : openVisits;

  const loading = disputesLoading || reportsLoading;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t.nav.portals.landOffice}
        title={t.nav.fieldAgents}
        description={t.pages.agents.description}
      />

      {/* Roster — doubles as the filter for the visit list below. */}
      <section className="space-y-3">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t.pages.agents.roster}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {agents.map((a) => {
            const load = openVisits.filter((v) => v.assignedAgentId === a.id).length;
            const active = focusedAgent === a.id;
            const available = a.status === "active";
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={active}
                aria-label={t.pages.agents.rosterTileAria(a.name, load)}
                onClick={() => setFocusedAgent(active ? null : a.id)}
                className={cn(
                  "rounded-xl bg-card px-4 py-3 text-left ring-1 transition-colors",
                  active ? "ring-2 ring-marker" : "ring-foreground/10 hover:bg-muted/40",
                  !available && "opacity-70",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="bg-secondary text-xs font-medium text-primary">
                      {initials(a.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{a.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.title}</div>
                  </div>
                </div>
                <div className="mt-2.5 flex items-end justify-between gap-2">
                  <div>
                    <div className="font-heading text-2xl font-semibold leading-none tabular-nums text-foreground">
                      {f.number(load)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t.pages.agents.openVisits(load)}
                      {load > COMFORTABLE_LOAD ? t.pages.agents.heavy : ""}
                    </div>
                  </div>
                  {available ? null : (
                    <span className="text-xs font-medium text-flagged">
                      {t.status.user[a.status]}
                    </span>
                  )}
                </div>
                <div className="mt-2 truncate text-xs text-muted-foreground">
                  {jurisdictionName(a.jurisdictionId)}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Work waiting on an assignment. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t.pages.agents.needsAgent}
          </h2>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {loading ? (
              t.pages.agents.loading
            ) : (
              <span className="font-medium text-foreground">
                {t.pages.agents.openCases(jobs.length)}
              </span>
            )}
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={t.pages.agents.allBookedTitle}
            description={t.pages.agents.allBookedBody}
          />
        ) : (
          <div className="space-y-3">
            {jobs.map((d) => (
              <JobCard
                key={d.id}
                dispute={d}
                parcel={parcelById.get(d.parcelId)}
                agents={agents}
                reports={reports}
                jurisdictions={jurisdictions}
              />
            ))}
          </div>
        )}
      </section>

      {/* What is already booked. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t.pages.agents.inTheField}
          </h2>
          {focusedAgent ? (
            <Button variant="ghost" size="sm" onClick={() => setFocusedAgent(null)}>
              {t.pages.agents.showEveryAgent}
            </Button>
          ) : null}
        </div>

        {loading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : shownVisits.length === 0 ? (
          <EmptyState
            icon={Users2}
            title={
              focusedAgent
                ? t.pages.agents.noneForAgentTitle
                : t.pages.agents.noVisitsTitle
            }
            description={
              focusedAgent ? t.pages.agents.noneForAgentBody : t.pages.agents.noVisitsBody
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {shownVisits.map((v) => (
              <Card key={v.id} className="gap-2.5 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <IdChip icon={MapPin}>{v.parcelDagNo}</IdChip>
                    <span className="text-sm font-medium text-foreground">
                      {t.domain.surveyPurpose[v.purpose]}
                    </span>
                  </div>
                  <StatusMetaBadge meta={s.fieldReport[v.status]} />
                </div>
                <div className="grid gap-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Users2 className="size-3.5 shrink-0" />
                    {agentById.get(v.assignedAgentId)?.name ?? v.assignedAgentId}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-3.5 shrink-0" />
                    {f.dateTime(v.scheduledFor)}
                  </span>
                  {v.addressHint ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Navigation className="size-3.5 shrink-0" />
                      {v.addressHint}
                    </span>
                  ) : null}
                </div>
                {v.disputeId ? (
                  <Link
                    href={`/disputes/${v.disputeId}`}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "w-fit text-muted-foreground",
                    )}
                  >
                    {t.pages.agents.viewCase}
                    <ArrowRight className="size-3.5" />
                  </Link>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
