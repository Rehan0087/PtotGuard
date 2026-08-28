"use client";

import Link from "next/link";
import { CreditCard, Receipt, Smartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useMutations, useServiceApplications } from "@/hooks/queries";
import type { Money } from "@/lib/types";

type ServiceKey = "mutation" | "land-tax" | "land-admin" | "revenue-case" | "lease-settlement";

interface PaymentEntry {
  id: string;
  service: ServiceKey;
  reference: string;
  amount: Money;
  paymentMethod: string;
  paidAt: string;
  parcelId?: string;
}

const PAYMENT_METHOD_ICON: Record<string, LucideIcon> = {
  bkash: Smartphone,
  nagad: Smartphone,
  card: CreditCard,
};

/** Not every fee-bearing service is parcel-bound — lease-settlement's khas
 * land isn't owned yet, so it has nothing to link to. */
const SERVICE_HREF: Partial<Record<ServiceKey, string>> = {
  "land-tax": "/land-tax",
  "land-admin": "/land-admin",
  "revenue-case": "/revenue-cases",
};

function EntryRow({ entry }: { entry: PaymentEntry }) {
  const t = useT();
  const f = useFmt();
  const MethodIcon = PAYMENT_METHOD_ICON[entry.paymentMethod] ?? CreditCard;
  const href = entry.parcelId ? `/parcels/${entry.parcelId}` : SERVICE_HREF[entry.service];

  return (
    <Card className="gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <IdChip>{entry.reference}</IdChip>
          <span className="text-sm text-muted-foreground">{t.pages.payments.serviceLabel[entry.service]}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <MethodIcon className="size-3.5" />
          {t.pages.payments.paymentMethods[entry.paymentMethod as "bkash" | "nagad" | "card"] ?? entry.paymentMethod}
          <span aria-hidden>·</span>
          {f.date(entry.paidAt)}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="tabular font-heading text-base font-semibold text-foreground">
          {f.money(entry.amount)}
        </span>
        {href ? (
          <Link href={href} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            {t.pages.payments.viewRecord}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

export default function PaymentsPage() {
  const t = useT();
  const f = useFmt();
  const mutationsQ = useMutations({ scope: "mine", pageSize: 100 });
  const applicationsQ = useServiceApplications({ scope: "mine", pageSize: 100 });
  const isLoading = mutationsQ.isLoading || applicationsQ.isLoading;

  const fromMutations: PaymentEntry[] = (mutationsQ.data?.items ?? [])
    .filter((m) => m.paymentMethod && m.fee)
    .map((m) => ({
      id: m.id,
      service: "mutation" as const,
      reference: m.mutationNumber,
      // No exact paid-at is recorded on a mutation, but every filing here pays
      // in the same step it's requested — requestedAt is the true moment.
      amount: m.fee as Money,
      paymentMethod: m.paymentMethod as string,
      paidAt: m.requestedAt,
      parcelId: m.parcelId,
    }));

  const fromApplications: PaymentEntry[] = (applicationsQ.data?.items ?? [])
    .filter(
      (a): a is typeof a & { paidAt: string; feeAmount: number; paymentMethod: string } =>
        Boolean(a.paidAt && a.feeAmount != null && a.paymentMethod),
    )
    .filter((a) => a.serviceType !== "acquisition" && a.serviceType !== "info-bank-request")
    .map((a) => ({
      id: a.id,
      service: a.serviceType as ServiceKey,
      reference: a.applicationNo,
      amount: { amount: a.feeAmount, currency: "BDT" as const },
      paymentMethod: a.paymentMethod,
      paidAt: a.paidAt,
      parcelId: a.parcelId,
    }));

  const entries = [...fromMutations, ...fromApplications].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  const total = entries.reduce((sum, e) => sum + e.amount.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.nav.portals.citizen} title={t.nav.payments} description={t.pages.payments.description} />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon={Receipt} title={t.pages.payments.emptyTitle} description={t.pages.payments.emptyBody} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm text-muted-foreground">{t.pages.payments.totalPaidLabel}</span>
            <span className="tabular font-heading text-2xl font-semibold text-foreground">
              {f.money({ amount: total, currency: "BDT" })}
            </span>
            <span className="text-sm text-muted-foreground">
              · {t.pages.payments.countLabel(entries.length)}
            </span>
          </div>
          <div className="space-y-3">
            {entries.map((entry) => (
              <EntryRow key={`${entry.service}-${entry.id}`} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
