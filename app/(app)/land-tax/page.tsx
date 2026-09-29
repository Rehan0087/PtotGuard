"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  MapPin,
  ReceiptText,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentConfirmationDialog } from "@/components/payment-confirmation-dialog";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";
import {
  useNotifyLandTax,
  useLandTaxCollection,
  useLandTaxHoldings,
  usePayLandTax,
  useRole,
} from "@/hooks/queries";
import type { ExemptionReason } from "@plotguard/rules";
import type {
  LandTaxCollectionHolding,
  LandTaxCollectionStatus,
  LandTaxHolding,
  PaymentMethod,
} from "@/lib/types";

/** The rule states why nothing is owed as a code; the wording is the screen's job. */
function exemptionText(reason: ExemptionReason, t: Dictionary, f: ReturnType<typeof useFmt>): string {
  return reason.code === "smallholder-agricultural"
    ? t.pages.landTax.exempt.smallholder(f.number(reason.thresholdDecimals))
    : t.pages.landTax.exempt.zeroRated(t.domain.landUse[reason.landUse]);
}

function HoldingCard({ holding }: { holding: LandTaxHolding }) {
  const t = useT();
  const f = useFmt();
  const pay = usePayLandTax();
  const [paying, setPaying] = useState(false);

  const { assessment } = holding;
  const bdt = (amount: number) => f.money({ amount, currency: "BDT" });
  const settled = assessment.total <= 0 && !assessment.exemption;

  function submit(paymentMethod: PaymentMethod) {
    pay.mutate(
      { parcelId: holding.parcelId, paymentMethod },
      {
        onSuccess: (application) => {
          setPaying(false);
          toast.success(t.pages.landTax.paidTitle, {
            description: t.pages.landTax.paidBody(
              holding.dagNo,
              application.transactionId ?? "",
            ),
          });
        },
        onError: () =>
          toast.error(t.pages.landTax.failedTitle, {
            description: t.pages.landTax.failedBody,
          }),
      },
    );
  }

  return (
    <Card className="gap-4 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip icon={MapPin}>{holding.dagNo}</IdChip>
            <span className="tabular text-xs text-muted-foreground">#{holding.khatianNo}</span>
          </div>
          <div className="font-heading text-sm font-semibold text-foreground">{holding.title}</div>
          <div className="text-xs text-muted-foreground">
            {t.domain.landUse[holding.landUse]} ·{" "}
            {t.pages.landTax.decimals(f.digits(String(Math.round(assessment.decimals * 100) / 100)))}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">
            {t.pages.landTax.yearLabel(f.digits(String(holding.assessmentYear)))}
          </div>
          <div className="tabular font-heading text-lg font-semibold text-foreground">
            {bdt(assessment.total)}
          </div>
        </div>
      </div>

      {assessment.exemption ? (
        <div className="flex items-start gap-2 rounded-lg bg-verified-soft/60 px-3 py-2 text-sm text-verified">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>{exemptionText(assessment.exemption, t, f)}</span>
        </div>
      ) : settled ? (
        <div className="flex items-center gap-2 rounded-lg bg-verified-soft/60 px-3 py-2 text-sm text-verified">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{t.pages.landTax.settled(f.digits(String(holding.paidThroughYear ?? "")))}</span>
        </div>
      ) : (
        <>
          {/* The itemised ledger — a bill nobody can check is a bill nobody trusts. */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-1.5 font-medium">{t.pages.landTax.colYear}</th>
                <th className="pb-1.5 text-right font-medium">{t.pages.landTax.colAssessed}</th>
                <th className="pb-1.5 text-right font-medium">{t.pages.landTax.colSurcharge}</th>
                <th className="pb-1.5 text-right font-medium">{t.pages.landTax.colDue}</th>
              </tr>
            </thead>
            <tbody>
              {assessment.years.map((y) => (
                <tr key={y.year} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 tabular">
                    {f.digits(String(y.year))}
                    {y.isArrear ? (
                      <span className="ml-1.5 rounded bg-pending-soft px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-pending">
                        {t.pages.landTax.arrear}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-right tabular text-muted-foreground">
                    {bdt(y.assessed)}
                  </td>
                  <td className="py-1.5 text-right tabular text-muted-foreground">
                    {y.surcharge > 0 ? bdt(y.surcharge) : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular font-medium text-foreground">
                    {bdt(y.due)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {assessment.arrears > 0 ? (
            <div className="flex items-start gap-2 rounded-lg bg-pending-soft/60 px-3 py-2 text-sm text-pending">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{t.pages.landTax.arrearsNotice(bdt(assessment.arrears))}</span>
            </div>
          ) : null}

          <div className="border-t border-border pt-3">
            {paying ? (
              <PaymentConfirmationDialog
                open
                amount={bdt(assessment.total)}
                defaultMethod="bkash"
                busy={pay.isPending}
                onOpenChange={(open) => {
                  if (!open && !pay.isPending) setPaying(false);
                }}
                onConfirm={submit}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setPaying(true)}>
                  <Banknote className="size-3.5" />
                  {t.pages.landTax.pay}
                </Button>
                <Link
                  href={`/parcels/${holding.parcelId}`}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "ml-auto text-muted-foreground",
                  )}
                >
                  {t.pages.landTax.viewParcel}
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function CitizenLandTax() {
  const t = useT();
  const f = useFmt();
  const { data: holdings, isLoading } = useLandTaxHoldings();

  const list = holdings ?? [];
  const totalDue = list.reduce((sum, h) => sum + h.assessment.total, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.landTax}
        description={t.pages.landTax.description}
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title={t.pages.landTax.emptyTitle}
          description={t.pages.landTax.emptyBody}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">
              {t.pages.landTax.totalDueLabel(f.number(list.length))}
            </span>
            <span className="tabular font-heading text-xl font-semibold text-foreground">
              {f.money({ amount: totalDue, currency: "BDT" })}
            </span>
          </div>
          <div className="space-y-3">
            {list.map((h) => (
              <HoldingCard key={h.parcelId} holding={h} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const collectionStatusClasses: Record<LandTaxCollectionStatus, string> = {
  due: "border-pending/25 bg-pending-soft text-pending",
  paid: "border-verified/25 bg-verified-soft text-verified",
  exempt: "border-border bg-muted text-muted-foreground",
};

function CollectionRow({ holding }: { holding: LandTaxCollectionHolding }) {
  const t = useT();
  const f = useFmt();
  const notify = useNotifyLandTax();
  const labels = t.pages.landTax.officer;

  function sendReminder() {
    notify.mutate(
      { parcelId: holding.parcelId },
      {
        onSuccess: () => {
          toast.success(labels.reminderSentTitle, {
            description: labels.reminderSentBody(holding.ownerName, holding.dagNo),
          });
        },
        onError: () => toast.error(labels.reminderFailedTitle, { description: labels.reminderFailedBody }),
      },
    );
  }

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-4 py-3">
        <Link href={`/records/${holding.parcelId}`} className="font-medium text-foreground hover:text-primary">
          {holding.dagNo}
        </Link>
        <div className="text-xs text-muted-foreground">{holding.khatianNo}</div>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-foreground">{holding.ownerName}</div>
        <div className="text-xs text-muted-foreground">{holding.title}</div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {t.domain.landUse[holding.landUse]}
        <div className="text-xs">{f.area(holding.area)}</div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {holding.paidThroughYear === null ? "—" : f.digits(String(holding.paidThroughYear))}
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className={collectionStatusClasses[holding.status]}>
          {labels.status[holding.status]}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right tabular font-medium">
        {f.money({ amount: holding.assessment.total, currency: "BDT" })}
      </td>
      <td className="px-4 py-3 text-right">
        {holding.status === "due" ? (
          <Button size="sm" disabled={notify.isPending} onClick={sendReminder}>{labels.sendReminder}</Button>
        ) : null}
      </td>
    </tr>
  );
}

function OfficerTaxCollection() {
  const t = useT();
  const f = useFmt();
  const labels = t.pages.landTax.officer;
  const { data, isLoading } = useLandTaxCollection();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LandTaxCollectionStatus | "all">("all");
  const holdings = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (data?.holdings ?? []).filter((holding) =>
      (status === "all" || holding.status === status)
      && (!needle || [holding.dagNo, holding.khatianNo, holding.ownerName, holding.title]
        .some((value) => value.toLocaleLowerCase().includes(needle))),
    );
  }, [data?.holdings, query, status]);

  const summary = data?.summary;
  const cards = [
    [labels.assessed, summary?.assessed ?? 0],
    [labels.collected, summary?.collected ?? 0],
    [labels.outstanding, summary?.outstanding ?? 0],
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.landOffice}
        title={t.nav.taxCollection}
        description={labels.description}
      />

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {cards.map(([label, amount]) => (
              <Card key={label} className="gap-1 px-5 py-4">
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="tabular font-heading text-2xl font-semibold">
                  {f.money({ amount, currency: "BDT" })}
                </div>
              </Card>
            ))}
          </div>

          <Card className="gap-0 overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div>
                <h2 className="font-heading font-semibold">{labels.holdings}</h2>
                <p className="text-xs text-muted-foreground">
                  {labels.year(f.digits(String(data?.assessmentYear ?? "")))}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-64 max-w-full">
                  <Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={labels.searchPlaceholder}
                    className="pl-8"
                  />
                </div>
                {(["all", "due", "paid", "exempt"] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={status === value ? "default" : "outline"}
                    onClick={() => setStatus(value)}
                  >
                    {value === "all" ? labels.all : labels.status[value]}
                  </Button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">{labels.colPlot}</th>
                    <th className="px-4 py-2 font-medium">{labels.colOwner}</th>
                    <th className="px-4 py-2 font-medium">{labels.colUseArea}</th>
                    <th className="px-4 py-2 font-medium">{labels.colPaidThrough}</th>
                    <th className="px-4 py-2 font-medium">{labels.colStatus}</th>
                    <th className="px-4 py-2 text-right font-medium">{labels.colAmount}</th>
                    <th className="px-4 py-2 text-right font-medium">{labels.colAction}</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => <CollectionRow key={holding.parcelId} holding={holding} />)}
                </tbody>
              </table>
              {holdings.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">{labels.noHoldings}</div>
              ) : null}
            </div>
          </Card>

          <Card className="gap-0 overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-border p-4">
              <ReceiptText className="size-4 text-primary" />
              <h2 className="font-heading font-semibold">{labels.receipts}</h2>
            </div>
            {data && data.payments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">{labels.colReceipt}</th>
                      <th className="px-4 py-2 font-medium">{labels.colDate}</th>
                      <th className="px-4 py-2 font-medium">{labels.colOwner}</th>
                      <th className="px-4 py-2 font-medium">{labels.colPlot}</th>
                      <th className="px-4 py-2 font-medium">{labels.colMethod}</th>
                      <th className="px-4 py-2 text-right font-medium">{labels.colAmount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3 font-medium">{payment.applicationNo}</td>
                        <td className="px-4 py-3 text-muted-foreground">{f.date(payment.paidAt)}</td>
                        <td className="px-4 py-3">{payment.ownerName}</td>
                        <td className="px-4 py-3">{payment.dagNo}</td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">{payment.paymentMethod}</td>
                        <td className="px-4 py-3 text-right tabular font-medium">
                          {f.money({ amount: payment.amount, currency: "BDT" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">{labels.noReceipts}</div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default function LandTaxPage() {
  return useRole() === "land-office" ? <OfficerTaxCollection /> : <CitizenLandTax />;
}
