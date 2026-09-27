"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Check, Landmark, Loader2, MapPin, Plus, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useAcceptAcquisition,
  useDecideAcquisitionAppeal,
  useFileAcquisitionAppeal,
  useIssueAcquisitionNotice,
  useParcels,
  useRole,
  useServiceApplications,
  useSubmitAcquisitionFieldReview,
  useUsers,
} from "@/hooks/queries";
import type {
  AcquisitionAppealDecision,
  AcquisitionAppealOutcome,
  AcquisitionDetails,
  ServiceApplication,
} from "@/lib/types";

export default function AcquisitionPage() {
  const role = useRole();
  if (role === "citizen") return <CitizenAcquisition />;
  if (role === "field-agent") return <FieldAgentAcquisition />;
  return <OfficerAcquisition />;
}

function CaseHeading({ application }: { application: ServiceApplication }) {
  const f = useFmt();
  const s = useStatusMeta();
  const details = application.details as AcquisitionDetails;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/applications/${application.id}`} className="hover:underline">
            <IdChip>{application.applicationNo}</IdChip>
          </Link>
          <span className="text-sm font-medium">{details.purpose}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {f.date(application.submittedAt ?? application.createdAt)}
          {details.awardAmount ? ` · ${f.money({ amount: details.awardAmount, currency: "BDT" })}` : ""}
        </div>
      </div>
      <StatusMetaBadge meta={s.serviceApplication[application.status]} />
    </div>
  );
}

function ParcelLink({ id }: { id?: string }) {
  const t = useT();
  return id ? (
    <Link href={`/parcels/${id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
      {t.pages.landTax.viewParcel}
    </Link>
  ) : null;
}

function AppealForm({ application, onDone }: { application: ServiceApplication; onDone: () => void }) {
  const t = useT();
  const details = application.details as AcquisitionDetails;
  const appeal = useFileAcquisitionAppeal(application.id);
  const [outcome, setOutcome] = useState<AcquisitionAppealOutcome>("withdraw");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const valid = reason.trim() && (outcome === "withdraw" || Number(amount) > (details.awardAmount ?? 0));

  function submit() {
    appeal.mutate(
      { outcome, reason: reason.trim(), requestedAmount: outcome === "increase-compensation" ? Number(amount) : undefined },
      {
        onSuccess: () => { toast.success(t.pages.acquisition.appealFiledTitle); onDone(); },
        onError: () => toast.error(t.pages.acquisition.failedTitle),
      },
    );
  }

  return (
    <div className="space-y-3 rounded-lg bg-muted/40 p-3">
      <Select value={outcome} onValueChange={(value) => setOutcome(value as AcquisitionAppealOutcome)}>
        <SelectTrigger className="w-full">
          <SelectValue>
            {outcome === "withdraw"
              ? t.pages.acquisition.appealWithdraw
              : t.pages.acquisition.appealIncrease}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="withdraw">{t.pages.acquisition.appealWithdraw}</SelectItem>
          <SelectItem value="increase-compensation">{t.pages.acquisition.appealIncrease}</SelectItem>
        </SelectContent>
      </Select>
      {outcome === "increase-compensation" ? (
        <Input type="number" min={(details.awardAmount ?? 0) + 1} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={t.pages.acquisition.requestedAmount} />
      ) : null}
      <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t.pages.acquisition.appealReason} />
      <div className="flex gap-2">
        <Button size="sm" disabled={!valid || appeal.isPending} onClick={submit}>
          {appeal.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldAlert className="size-3.5" />}
          {t.pages.acquisition.submitAppeal}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>{t.common.cancel}</Button>
      </div>
    </div>
  );
}

function CitizenCase({ application }: { application: ServiceApplication }) {
  const t = useT();
  const f = useFmt();
  const details = application.details as AcquisitionDetails;
  const accept = useAcceptAcquisition(application.id);
  const [appealing, setAppealing] = useState(false);
  const actionable = details.stage === "citizen-decision" && application.status === "under-review";

  return (
    <Card className="gap-4 px-5">
      <CaseHeading application={application} />
      {details.fieldReview ? (
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <div className="font-medium">{t.pages.acquisition.fieldReviewComplete}</div>
          <p className="mt-1 text-muted-foreground">{details.fieldReview.notes}</p>
          {details.awardAmount ? <p className="mt-2 font-semibold text-primary">{t.pages.acquisition.compensationOffer}: {f.money({ amount: details.awardAmount, currency: "BDT" })}</p> : null}
        </div>
      ) : <p className="text-sm text-muted-foreground">{t.pages.acquisition.awaitingFieldReview}</p>}
      {details.appeal ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <div className="font-medium">{t.pages.acquisition.appealPending}</div>
          <p className="mt-1 text-muted-foreground">{details.appeal.reason}</p>
        </div>
      ) : null}
      {details.stage === "completed" ? <div className="rounded-lg bg-primary/10 p-3 text-sm text-primary">{t.pages.acquisition.stateOwnedComplete}</div> : null}
      {details.stage === "withdrawn" ? <div className="rounded-lg bg-muted/40 p-3 text-sm">{t.pages.acquisition.withdrawnLabel}</div> : null}
      {actionable ? appealing ? (
        <AppealForm application={application} onDone={() => setAppealing(false)} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={accept.isPending} onClick={() => accept.mutate(undefined, { onSuccess: () => toast.success(t.pages.acquisition.completedTitle), onError: () => toast.error(t.pages.acquisition.failedTitle) })}>
            {accept.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {t.pages.acquisition.acceptOffer}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAppealing(true)}><ShieldAlert className="size-3.5" />{t.pages.acquisition.appeal}</Button>
        </div>
      ) : null}
      <div className="border-t pt-3"><ParcelLink id={application.parcelId} /></div>
    </Card>
  );
}

function CitizenAcquisition() {
  const t = useT();
  const query = useServiceApplications({ scope: "mine", serviceType: "acquisition", pageSize: 50 });
  const applications = query.data?.items ?? [];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.nav.portals.citizen} title={t.nav.acquisition} description={t.pages.acquisition.description} />
      <CaseList loading={query.isLoading} applications={applications} emptyTitle={t.pages.acquisition.emptyTitle} emptyBody={t.pages.acquisition.emptyBody} render={(application) => <CitizenCase key={application.id} application={application} />} />
    </div>
  );
}

function FieldReviewCard({ application }: { application: ServiceApplication }) {
  const t = useT();
  const review = useSubmitAcquisitionFieldReview(application.id);
  const details = application.details as AcquisitionDetails;
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const pending = details.stage === "field-review" && application.status === "field-investigation";
  return (
    <Card className="gap-4 px-5">
      <CaseHeading application={application} />
      {pending ? (
        <div className="space-y-3">
          <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t.pages.acquisition.fieldReviewNotes} />
          <Input className="max-w-xs" type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={t.pages.acquisition.awardAmountLabel} />
          <Button size="sm" disabled={!notes.trim() || Number(amount) <= 0 || review.isPending} onClick={() => review.mutate({ awardAmount: Number(amount), reviewNotes: notes.trim() }, { onSuccess: () => toast.success(t.pages.acquisition.reviewSubmittedTitle), onError: () => toast.error(t.pages.acquisition.failedTitle) })}>
            {review.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {t.pages.acquisition.submitReview}
          </Button>
        </div>
      ) : <p className="text-sm text-muted-foreground">{t.pages.acquisition.reviewSubmittedTitle}</p>}
      <div className="border-t pt-3"><ParcelLink id={application.parcelId} /></div>
    </Card>
  );
}

function FieldAgentAcquisition() {
  const t = useT();
  const query = useServiceApplications({ scope: "assigned", serviceType: "acquisition", pageSize: 50 });
  const applications = query.data?.items ?? [];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.nav.portals.fieldSurvey} title={t.nav.acquisition} description={t.pages.acquisition.fieldAgentDescription} />
      <CaseList loading={query.isLoading} applications={applications} emptyTitle={t.pages.acquisition.noAssignedReviews} emptyBody={t.pages.acquisition.noAssignedReviewsBody} render={(application) => <FieldReviewCard key={application.id} application={application} />} />
    </div>
  );
}

function IssueRequestForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const issue = useIssueAcquisitionNotice();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query);
  const parcelsQ = useParcels({ q: debounced, pageSize: 6 });
  const agentsQ = useUsers({ role: "field-agent", pageSize: 50 });
  const [parcelId, setParcelId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [agentId, setAgentId] = useState("");
  const selected = parcelsQ.data?.items.find((parcel) => parcel.id === parcelId);
  const agents = (agentsQ.data?.items ?? []).filter((agent) => agent.status === "active");
  return (
    <Card className="gap-4 px-5">
      <div className="space-y-2">
        <label className="text-sm font-medium">{t.pages.acquisition.parcelSearchLabel}</label>
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={selected ? `${selected.dagNo} · ${selected.title}` : query} onChange={(event) => { setParcelId(""); setQuery(event.target.value); }} placeholder={t.pages.acquisition.parcelSearchPlaceholder} /></div>
        {debounced && !parcelId ? <div className="grid gap-1.5">{(parcelsQ.data?.items ?? []).map((parcel) => <button type="button" key={parcel.id} onClick={() => { setParcelId(parcel.id); setQuery(""); }} className="flex items-center gap-2 rounded-lg border p-2 text-left text-sm hover:bg-muted/50"><IdChip icon={MapPin}>{parcel.dagNo}</IdChip><span>{parcel.title}</span></button>)}</div> : null}
      </div>
      <Textarea rows={2} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder={t.pages.acquisition.purposePlaceholder} />
      <Select value={agentId} onValueChange={(value) => setAgentId(value ?? "")}>
        <SelectTrigger className="w-full"><SelectValue placeholder={t.pages.acquisition.selectFieldAgent} /></SelectTrigger>
        <SelectContent>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name} · {agent.title ?? t.roles[agent.role]}</SelectItem>)}</SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button size="sm" disabled={!parcelId || !purpose.trim() || !agentId || issue.isPending} onClick={() => issue.mutate({ parcelId, purpose: purpose.trim(), assignedFieldAgentId: agentId }, { onSuccess: (application) => { toast.success(t.pages.acquisition.issuedTitle, { description: t.pages.acquisition.issuedBody(application.applicationNo) }); onDone(); }, onError: () => toast.error(t.pages.acquisition.failedTitle) })}>
          {issue.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}{t.pages.acquisition.createAndAssign}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>{t.common.cancel}</Button>
      </div>
    </Card>
  );
}

function AppealDecision({ application }: { application: ServiceApplication }) {
  const t = useT();
  const details = application.details as AcquisitionDetails;
  const decide = useDecideAcquisitionAppeal(application.id);
  const [decision, setDecision] = useState<AcquisitionAppealDecision>("withdraw");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const valid = decision !== "increase-compensation" || Number(amount) > (details.awardAmount ?? 0);
  return (
    <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="text-sm font-medium">{t.pages.acquisition.appealPending}</div>
      <p className="text-sm text-muted-foreground">{details.appeal?.reason}</p>
      <Select value={decision} onValueChange={(value) => setDecision(value as AcquisitionAppealDecision)}>
        <SelectTrigger className="w-full min-w-0">
          <SelectValue>
            {decision === "withdraw"
              ? t.pages.acquisition.decisionWithdraw
              : decision === "increase-compensation"
                ? t.pages.acquisition.decisionIncrease
                : t.pages.acquisition.decisionProceed}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="withdraw">{t.pages.acquisition.decisionWithdraw}</SelectItem>
          <SelectItem value="increase-compensation">{t.pages.acquisition.decisionIncrease}</SelectItem>
          <SelectItem value="proceed">{t.pages.acquisition.decisionProceed}</SelectItem>
        </SelectContent>
      </Select>
      {decision === "increase-compensation" ? <Input type="number" min={(details.awardAmount ?? 0) + 1} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={t.pages.acquisition.newAmount} /> : null}
      <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t.pages.acquisition.decisionNote} />
      <Button size="sm" disabled={!valid || decide.isPending} onClick={() => decide.mutate({ decision, awardAmount: decision === "increase-compensation" ? Number(amount) : undefined, note: note.trim() || undefined }, { onSuccess: () => toast.success(t.pages.acquisition.decisionSaved), onError: () => toast.error(t.pages.acquisition.failedTitle) })}>{decide.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}{t.pages.acquisition.saveDecision}</Button>
    </div>
  );
}

function OfficerCase({ application }: { application: ServiceApplication }) {
  const t = useT();
  const details = application.details as AcquisitionDetails;
  return (
    <Card className="gap-4 px-5">
      <CaseHeading application={application} />
      {details.stage === "field-review" ? <p className="text-sm text-muted-foreground">{t.pages.acquisition.awaitingFieldReview}</p> : null}
      {details.fieldReview ? <div className="rounded-lg bg-muted/40 p-3 text-sm"><div className="font-medium">{t.pages.acquisition.fieldReviewComplete}</div><p className="mt-1 text-muted-foreground">{details.fieldReview.notes}</p></div> : null}
      {details.stage === "appeal-review" ? <AppealDecision application={application} /> : null}
      {details.stage === "completed" ? <div className="rounded-lg bg-primary/10 p-3 text-sm text-primary">{t.pages.acquisition.stateOwnedComplete}</div> : null}
      {details.stage === "withdrawn" ? <div className="rounded-lg bg-muted/40 p-3 text-sm">{t.pages.acquisition.withdrawnLabel}</div> : null}
      <div className="border-t pt-3"><ParcelLink id={application.parcelId} /></div>
    </Card>
  );
}

function OfficerAcquisition() {
  const t = useT();
  const [creating, setCreating] = useState(false);
  const query = useServiceApplications({ serviceType: "acquisition", pageSize: 50 });
  const applications = query.data?.items ?? [];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.nav.portals.landOffice} title={t.nav.acquisition} description={t.pages.acquisition.officerDescription}>{!creating ? <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" />{t.pages.acquisition.newRequest}</Button> : null}</PageHeader>
      {creating ? <IssueRequestForm onDone={() => setCreating(false)} /> : null}
      <CaseList loading={query.isLoading} applications={applications} emptyTitle={t.pages.acquisition.queueEmptyTitle} emptyBody={t.pages.acquisition.queueEmptyBody} render={(application) => <OfficerCase key={application.id} application={application} />} />
    </div>
  );
}

function CaseList({ loading, applications, emptyTitle, emptyBody, render }: { loading: boolean; applications: ServiceApplication[]; emptyTitle: string; emptyBody: string; render: (application: ServiceApplication) => ReactNode }) {
  if (loading) return <div className="space-y-3">{[0, 1].map((item) => <Skeleton key={item} className="h-36 rounded-xl" />)}</div>;
  if (!applications.length) return <EmptyState icon={Landmark} title={emptyTitle} description={emptyBody} />;
  return <div className="space-y-3">{applications.map(render)}</div>;
}
