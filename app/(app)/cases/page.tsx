"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Gavel, CalendarClock, Users, ArrowRight, Scale, Bell, Check, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateHearing, useDisputes, useHearings, useNotifyRevenueCaseCitizen, useScheduleHearing, useServiceApplicationDecision, useServiceApplications } from "@/hooks/queries";
import { disputesNeedingHearing } from "@plotguard/rules";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import type { Dispute, ServiceApplication } from "@/lib/types";

type RevenueCaseDetails = { grounds?: string; hearingAt?: string; amountDue?: number; dagNo?: string; ownerName?: string };

function RevenueCaseWorkCard({ application }: { application: ServiceApplication }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const schedule = useScheduleHearing(application.id);
  const notify = useNotifyRevenueCaseCitizen(application.id);
  const decision = useServiceApplicationDecision(application.id);
  const details = application.details as RevenueCaseDetails;
  const [when, setWhen] = useState("");
  const closed = ["approved", "rejected", "withdrawn"].includes(application.status);

  return <Card className="gap-3 px-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><IdChip icon={Scale}>{application.applicationNo}</IdChip><div className="mt-1 text-sm font-medium">{details.ownerName}</div><div className="text-xs text-muted-foreground">{details.dagNo}</div></div>
      <StatusMetaBadge meta={s.serviceApplication[application.status]} />
    </div>
    {details.amountDue != null ? <div className="text-sm text-destructive">{t.pages.revenueCases.amountDue(f.money({ amount: details.amountDue, currency: "BDT" }))}</div> : null}
    {details.grounds ? <p className="rounded-md bg-muted/40 p-3 text-sm">{details.grounds}</p> : null}
    {details.hearingAt ? <div className="text-sm text-marker">{t.pages.revenueCases.hearingAtLabel(f.dateTime(details.hearingAt))}</div> : null}
    {!closed ? <div className="space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label htmlFor={`revenue-when-${application.id}`} className="text-xs">{t.pages.revenueCases.hearingDateLabel}</Label><Input id={`revenue-when-${application.id}`} type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} className="w-56" /></div>
        <Button size="sm" disabled={!when || schedule.isPending} onClick={() => schedule.mutate(new Date(when).toISOString(), { onSuccess: () => toast.success(t.pages.revenueCases.hearingScheduledTitle) })}><CalendarClock className="size-3.5" />{t.pages.revenueCases.scheduleHearing}</Button>
        <Button size="sm" variant="outline" disabled={notify.isPending} onClick={() => notify.mutate(undefined, { onSuccess: () => toast.success(t.pages.revenueCases.citizenNotifiedTitle) })}><Bell className="size-3.5" />{t.pages.revenueCases.notifyCitizen}</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={decision.isPending} onClick={() => decision.mutate({ decision: "approve" })}><Check className="size-3.5" />{t.pages.revenueCases.uphold}</Button>
        <Button size="sm" variant="outline" disabled={decision.isPending} onClick={() => decision.mutate({ decision: "reject" })}><Ban className="size-3.5" />{t.pages.revenueCases.dismiss}</Button>
        {(schedule.isPending || notify.isPending || decision.isPending) ? <Loader2 className="size-4 animate-spin self-center text-muted-foreground" /> : null}
      </div>
    </div> : null}
  </Card>;
}

/** A week out, mid-morning — in the format a datetime-local input wants. */
function defaultHearingDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(11, 30, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/** One referred case, with the date field that lists it. */
function ConveneRow({ dispute }: { dispute: Dispute }) {
  const t = useT();
  const s = useStatusMeta();
  const createHearing = useCreateHearing();
  const [when, setWhen] = useState(defaultHearingDate);

  const convene = async () => {
    // Only the case and the date — the parcel and the parties are read off
    // the dispute server-side, so a name can't be keyed in twice and differ.
    await createHearing.mutateAsync({
      disputeId: dispute.id,
      hearingDate: new Date(when).toISOString(),
    });
    toast.success(t.pages.cases.convened(dispute.caseNumber));
  };

  return (
    <Card className="gap-3 px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IdChip icon={Scale}>{dispute.caseNumber}</IdChip>
          <span className="text-sm font-medium text-foreground">
            {t.domain.disputeType[dispute.type]}
          </span>
          <span className="text-sm text-muted-foreground">
            {t.components.disputeListItem.dag(dispute.parcelDagNo)}
          </span>
        </div>
        <StatusMetaBadge meta={s.priority[dispute.priority]} dot={false} />
      </div>

      <p className="text-sm text-foreground">{dispute.description}</p>

      <div className="text-xs text-muted-foreground">
        <span className="font-medium">{t.pages.cases.partiesLabel}: </span>
        {dispute.parties.map((p) => p.name).join(t.pages.cases.partySeparator)}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`when-${dispute.id}`} className="text-xs">
            {t.pages.cases.hearingDate}
          </Label>
          <Input
            id={`when-${dispute.id}`}
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="w-56"
          />
        </div>
        <Button size="sm" disabled={!when || createHearing.isPending} onClick={convene}>
          <CalendarClock className="size-3.5" />
          {createHearing.isPending ? t.pages.cases.convening : t.pages.cases.convene}
        </Button>
      </div>
    </Card>
  );
}

export default function CasesPage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const { data, isLoading } = useHearings({ mediator: "me" });
  const { data: disputeData } = useDisputes({ pageSize: 100 });
  // Deliberately every hearing, not just this mediator's: a case listed by a
  // colleague has been listed, and must not sit on anyone's board as pending.
  const { data: allHearings } = useHearings({ pageSize: 100 });
  const { data: revenueData, isLoading: revenueLoading } = useServiceApplications({ serviceType: "revenue-case", pageSize: 100 });
  const cases = data?.items ?? [];
  const revenueCases = revenueData?.items ?? [];

  // Referral is the officer's call; this is only what has already been sent
  // to mediation and not yet listed. See lib/hearings.ts.
  const toConvene = disputesNeedingHearing(
    disputeData?.items ?? [],
    allHearings?.items ?? [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.mediation}
        title={t.nav.cases}
        description={t.pages.cases.description}
      />

      {revenueLoading ? <Skeleton className="h-32 rounded-xl" /> : revenueCases.length > 0 ? <section className="space-y-3"><div><h2 className="text-sm font-medium text-foreground">{t.pages.revenueCases.assignedTaxCases}</h2><p className="text-xs text-muted-foreground">{t.pages.revenueCases.assignedTaxCasesBody}</p></div>{revenueCases.map((item) => <RevenueCaseWorkCard key={item.id} application={item} />)}</section> : null}

      {toConvene.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">{t.pages.cases.toConvene}</h2>
            <p className="text-xs text-muted-foreground">{t.pages.cases.toConveneBody}</p>
          </div>
          {toConvene.map((d) => (
            <ConveneRow key={d.id} dispute={d} />
          ))}
        </section>
      ) : null}

      {toConvene.length > 0 && cases.length > 0 ? (
        <h2 className="text-sm font-medium text-foreground">{t.pages.cases.listed}</h2>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : cases.length === 0 && revenueCases.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title={t.pages.cases.emptyTitle}
          description={t.pages.cases.emptyBody}
        />
      ) : cases.length > 0 ? (
        <div className="space-y-3">
          {cases.map((c) => (
            <Card key={c.id} className="gap-3 px-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <IdChip icon={Gavel}>{c.caseNumber}</IdChip>
                  <span className="text-sm text-muted-foreground">
                    {t.components.disputeListItem.dag(c.parcelDagNo)}
                  </span>
                </div>
                <StatusMetaBadge meta={s.hearing[c.status]} />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  {c.parties.join(t.pages.cases.partySeparator)}
                </span>
                {c.hearingDate ? (
                  <span className="inline-flex items-center gap-1.5 text-marker">
                    <CalendarClock className="size-3.5" />
                    {t.pages.cases.hearingAt(f.dateTime(c.hearingDate))}
                  </span>
                ) : null}
                <span>{t.pages.cases.sessions(c.sessions.length)}</span>
              </div>

              {c.ruling ? (
                <p className="rounded-md bg-secondary/50 px-3 py-2 text-xs text-secondary-foreground">
                  <span className="font-medium">{t.pages.cases.ruling} · </span>
                  {c.ruling}
                </p>
              ) : null}

              <Link
                href={`/cases/${c.id}`}
                className="inline-flex w-fit items-center gap-1 text-sm text-primary hover:underline"
              >
                {t.pages.cases.openCase} <ArrowRight className="size-3.5" />
              </Link>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
