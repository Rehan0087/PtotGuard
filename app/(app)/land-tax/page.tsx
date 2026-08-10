"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  MapPin,
  Smartphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";
import { useLandTaxHoldings, usePayLandTax } from "@/hooks/queries";
import type { ExemptionReason } from "@plotguard/rules";
import type { LandTaxHolding, PaymentMethod } from "@/lib/types";

const PAYMENT_METHODS: { value: PaymentMethod; icon: LucideIcon }[] = [
  { value: "bkash", icon: Smartphone },
  { value: "nagad", icon: Smartphone },
  { value: "card", icon: CreditCard },
];

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
  const [method, setMethod] = useState<PaymentMethod>("bkash");

  const { assessment } = holding;
  const bdt = (amount: number) => f.money({ amount, currency: "BDT" });
  const settled = assessment.total <= 0 && !assessment.exemption;

  function submit() {
    pay.mutate(
      { parcelId: holding.parcelId, paymentMethod: method },
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
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  {PAYMENT_METHODS.map((option) => {
                    const Icon = option.icon;
                    const active = method === option.value;
                    return (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => setMethod(option.value)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border bg-card p-2.5 text-left transition-colors",
                          active
                            ? "border-primary ring-1 ring-primary"
                            : "border-border hover:bg-muted/50",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            active ? "text-marker" : "text-muted-foreground",
                          )}
                        />
                        <span className="text-sm font-medium text-foreground">
                          {t.pages.landTax.paymentMethods[option.value]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">{t.pages.landTax.paymentNote}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" disabled={pay.isPending} onClick={submit}>
                    {pay.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {t.pages.landTax.confirmPay(bdt(assessment.total))}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pay.isPending}
                    onClick={() => setPaying(false)}
                  >
                    {t.common.cancel}
                  </Button>
                </div>
              </div>
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

export default function LandTaxPage() {
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
