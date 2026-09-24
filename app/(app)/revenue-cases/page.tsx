"use client";

import { useState } from "react";
import Link from "next/link";
import { Gavel, Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import { useAssignRevenueCase, useFileRevenueCase, useLandTaxCollection, useRole, useServiceApplications, useUsers } from "@/hooks/queries";
import type { LandTaxCollectionHolding, ServiceApplication } from "@/lib/types";

type CaseDetails = { grounds?: string; hearingAt?: string; assessmentYear?: number; amountDue?: number; paidThroughYear?: number | null; dagNo?: string; ownerName?: string };

export default function RevenueCasesPage() {
  return useRole() === "citizen" ? <CitizenRevenueCases /> : <OfficerRevenueCases />;
}

function CaseCard({ application, officer = false }: { application: ServiceApplication; officer?: boolean }) {
  const t = useT();
  const f = useFmt();
  const statuses = useStatusMeta();
  const details = application.details as CaseDetails;

  return <Card className="gap-3 px-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <Link href={`/applications/${application.id}`} className="hover:underline"><IdChip>{application.applicationNo}</IdChip></Link>
        <div className="text-sm font-medium">{t.pages.revenueCases.taxDefaultCase}</div>
        <div className="text-xs text-muted-foreground">{f.date(application.submittedAt ?? application.createdAt)}{details.dagNo ? ` · ${details.dagNo}` : ""}</div>
      </div>
      <StatusMetaBadge meta={statuses.serviceApplication[application.status]} />
    </div>
    <div className="rounded-lg bg-muted/40 p-3 text-sm">
      {details.ownerName && officer ? <div className="font-medium">{details.ownerName}</div> : null}
      {details.amountDue != null ? <div className="text-destructive">{t.pages.revenueCases.amountDue(f.money({ amount: details.amountDue, currency: "BDT" }))}</div> : null}
      {details.assessmentYear ? <div className="text-xs text-muted-foreground">{t.pages.revenueCases.assessmentYear(f.digits(String(details.assessmentYear)))}</div> : null}
      {details.grounds ? <p className="mt-2">{details.grounds}</p> : null}
      {details.hearingAt ? <p className="mt-2 text-disputed">{t.pages.revenueCases.hearingAtLabel(f.dateTime(details.hearingAt))}</p> : null}
    </div>
    {application.parcelId ? <Link href={`/parcels/${application.parcelId}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-start")}>{t.pages.landTax.viewParcel}</Link> : null}
    {officer ? <AssignmentControls application={application} /> : null}
  </Card>;
}

function AssignmentControls({ application }: { application: ServiceApplication }) {
  const t = useT();
  const mediators = useUsers({ role: "mediator", pageSize: 100 });
  const assign = useAssignRevenueCase(application.id);
  const [mediatorId, setMediatorId] = useState("");
  return <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <select value={mediatorId} onChange={(event) => setMediatorId(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
        <option value="">{t.pages.revenueCases.selectSettlementOfficer}</option>
        {(mediators.data?.items ?? []).filter((user) => user.status === "active").map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
      </select>
      <Button size="sm" disabled={!mediatorId || assign.isPending} onClick={() => assign.mutate(mediatorId, { onSuccess: () => toast.success(t.pages.revenueCases.assignedTitle) })}>{assign.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}{t.pages.revenueCases.assignCase}</Button>
    </div>;
}

function CitizenRevenueCases() {
  const t = useT();
  const { data, isLoading } = useServiceApplications({ scope: "mine", serviceType: "revenue-case", pageSize: 50 });
  const cases = data?.items ?? [];
  return <div className="space-y-6">
    <PageHeader eyebrow={t.nav.portals.citizen} title={t.nav.revenueCases} description={t.pages.revenueCases.citizenDescription} />
    {isLoading ? <Skeleton className="h-32 rounded-xl" /> : cases.length ? <div className="space-y-3">{cases.map((item) => <CaseCard key={item.id} application={item} />)}</div> : <EmptyState icon={Scale} title={t.pages.revenueCases.emptyTitle} description={t.pages.revenueCases.citizenEmptyBody} />}
  </div>;
}

function DueHoldingCard({ holding }: { holding: LandTaxCollectionHolding }) {
  const t = useT();
  const f = useFmt();
  const file = useFileRevenueCase();
  const reason = t.pages.revenueCases.defaultGrounds(holding.dagNo, f.digits(String(holding.assessmentYear)));
  return <Card className="gap-3 px-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="font-medium">{holding.ownerName}</div><div className="text-xs text-muted-foreground">{holding.dagNo} · {holding.khatianNo}</div></div>
      <div className="text-right"><div className="text-xs text-muted-foreground">{t.pages.revenueCases.taxOutstanding}</div><div className="font-heading font-semibold text-destructive">{f.money({ amount: holding.assessment.total, currency: "BDT" })}</div></div>
    </div>
    <Button size="sm" className="self-start" disabled={file.isPending} onClick={() => file.mutate({ parcelId: holding.parcelId, grounds: reason }, { onSuccess: (item) => toast.success(t.pages.revenueCases.filedTitle, { description: t.pages.revenueCases.officerFiledBody(item.applicationNo, holding.ownerName) }), onError: () => toast.error(t.pages.revenueCases.failedTitle, { description: t.pages.revenueCases.failedBody }) })}>{file.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Gavel className="size-3.5" />}{t.pages.revenueCases.fileAgainstCitizen}</Button>
  </Card>;
}

function OfficerRevenueCases() {
  const t = useT();
  const collection = useLandTaxCollection();
  const casesQ = useServiceApplications({ scope: "assigned", serviceType: "revenue-case", pageSize: 50 });
  const cases = casesQ.data?.items ?? [];
  const eligible = (collection.data?.holdings ?? []).filter((item) => item.status === "due" && !item.hasActiveRevenueCase);
  return <div className="space-y-6">
    <PageHeader eyebrow={t.nav.portals.landOffice} title={t.nav.revenueCases} description={t.pages.revenueCases.officerDescription} />
    {collection.isLoading || casesQ.isLoading ? <Skeleton className="h-40 rounded-xl" /> : <>
      <section className="space-y-3"><h2 className="font-heading font-semibold">{t.pages.revenueCases.unpaidHoldings}</h2>{eligible.length ? eligible.map((item) => <DueHoldingCard key={item.parcelId} holding={item} />) : <p className="text-sm text-muted-foreground">{t.pages.revenueCases.noEligibleHoldings}</p>}</section>
      <section className="space-y-3"><h2 className="font-heading font-semibold">{t.pages.revenueCases.filedCases}</h2>{cases.length ? cases.map((item) => <CaseCard key={item.id} application={item} officer />) : <EmptyState icon={Scale} title={t.pages.revenueCases.queueEmptyTitle} description={t.pages.revenueCases.queueEmptyBody} />}</section>
    </>}
  </div>;
}
