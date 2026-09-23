"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { toast } from "sonner";
import {
  Ban,
  Check,
  CreditCard,
  Home,
  Loader2,
  Plus,
  Smartphone,
  Sprout,
  X,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import type { Dictionary } from "@/lib/i18n";
import {
  useRole,
  usePolicies,
  useApplyLeaseSettlement,
  useServiceApplications,
  useServiceApplicationDecision,
  useKhasLandPlots,
} from "@/hooks/queries";
import type { PaymentMethod, ServiceApplication, KhasLandPlot } from "@/lib/types";
import { KhasLandMap } from "@/components/khas-land-map";
import { PaymentConfirmationDialog } from "@/components/payment-confirmation-dialog";

type LandUse = "agricultural" | "non-agricultural";

const LAND_USES: { value: LandUse; icon: LucideIcon }[] = [
  { value: "agricultural", icon: Sprout },
  { value: "non-agricultural", icon: Home },
];

const PAYMENT_METHODS: { value: PaymentMethod; icon: LucideIcon }[] = [
  { value: "bkash", icon: Smartphone },
  { value: "nagad", icon: Smartphone },
  { value: "card", icon: CreditCard },
];

/** Built per locale — every message here is read by whoever is filing. */
function makeSchema(t: Dictionary) {
  return z
    .object({
      landUse: z.enum(["agricultural", "non-agricultural"]),
      locationDescription: z
        .string()
        .min(1, t.pages.leaseSettlement.errors.locationDescriptionRequired),
      areaDecimals: z.string(),
      termYears: z.string(),
      purpose: z.string().min(1, t.pages.leaseSettlement.errors.purposeRequired),
      paymentMethod: z.enum(["bkash", "nagad", "card"]),
    })
    .refine((d) => Number(d.areaDecimals) > 0, {
      message: t.pages.leaseSettlement.errors.areaRequired,
      path: ["areaDecimals"],
    })
    .refine((d) => Number(d.termYears) > 0, {
      message: t.pages.leaseSettlement.errors.termRequired,
      path: ["termYears"],
    });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export default function LeaseSettlementPage() {
  const role = useRole();
  return role === "citizen" ? <CitizenLeaseSettlement /> : <OfficerLeaseSettlement />;
}

// --- Citizen -----------------------------------------------------------------

function ApplyForm({ onDone, prefilledPlot }: { onDone: () => void, prefilledPlot?: KhasLandPlot }) {
  const t = useT();
  const f = useFmt();
  const schema = useMemo(() => makeSchema(t), [t]);
  const { data: policy } = usePolicies();
  const apply = useApplyLeaseSettlement();

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      landUse: prefilledPlot ? (prefilledPlot.landUse === "agricultural" ? "agricultural" : "non-agricultural") : "agricultural",
      locationDescription: prefilledPlot ? `${prefilledPlot.mouza}, ${prefilledPlot.upazila} (Dag No: ${prefilledPlot.dagNo})` : "",
      areaDecimals: prefilledPlot ? String(prefilledPlot.areaDecimals) : "",
      termYears: "",
      purpose: "",
      paymentMethod: "bkash",
    },
  });

  // useWatch (vs watch()) keeps the component React-Compiler friendly.
  const landUse = useWatch({ control, name: "landUse" });
  const paymentMethod = useWatch({ control, name: "paymentMethod" });

  const fee = policy
    ? {
        amount: policy.leaseSettlementApplicationFeeBdt ?? 20,
        currency: "BDT" as const,
      }
    : null;

  function onSubmit(values: FormValues) {
    apply.mutate(
      {
        landUse: values.landUse,
        locationDescription: values.locationDescription,
        areaDecimals: Number(values.areaDecimals),
        termYears: Number(values.termYears),
        purpose: values.purpose,
        paymentMethod: values.paymentMethod,
        khasPlotId: prefilledPlot?.id,
      },
      {
        onSuccess: (application) => {
          toast.success(t.pages.leaseSettlement.appliedTitle, {
            description: t.pages.leaseSettlement.appliedBody(application.applicationNo),
          });
          onDone();
        },
        onError: () =>
          toast.error(t.pages.leaseSettlement.failedTitle, {
            description: t.pages.leaseSettlement.failedBody,
          }),
      },
    );
  }

  return (
    <Card className="gap-4 px-5">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {LAND_USES.map((option) => {
            const Icon = option.icon;
            const active = landUse === option.value;
            return (
              <button
                type="button"
                key={option.value}
                onClick={() => setValue("landUse", option.value, { shouldValidate: true })}
                className={cn(
                  "flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors",
                  active ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/50",
                )}
              >
                <Icon
                  className={cn("mt-0.5 size-4 shrink-0", active ? "text-marker" : "text-muted-foreground")}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {t.pages.leaseSettlement.landUse[
                      option.value === "agricultural" ? "agricultural" : "nonAgricultural"
                    ]}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t.pages.leaseSettlement.landUse[
                      option.value === "agricultural" ? "agriculturalBlurb" : "nonAgriculturalBlurb"
                    ]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div>
          <label
            htmlFor="locationDescription"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            {t.pages.leaseSettlement.locationDescriptionLabel}
          </label>
          <Textarea
            id="locationDescription"
            rows={2}
            placeholder={t.pages.leaseSettlement.locationDescriptionPlaceholder}
            {...register("locationDescription")}
          />
          {errors.locationDescription ? (
            <p className="mt-1.5 text-sm text-destructive">{errors.locationDescription.message}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="areaDecimals" className="mb-1.5 block text-sm font-medium text-foreground">
              {t.pages.leaseSettlement.areaLabel}
            </label>
            <Input id="areaDecimals" type="number" min={1} step={1} {...register("areaDecimals")} />
            {errors.areaDecimals ? (
              <p className="mt-1.5 text-sm text-destructive">{errors.areaDecimals.message}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="termYears" className="mb-1.5 block text-sm font-medium text-foreground">
              {t.pages.leaseSettlement.termLabel}
            </label>
            <Input id="termYears" type="number" min={1} max={99} step={1} {...register("termYears")} />
            {errors.termYears ? (
              <p className="mt-1.5 text-sm text-destructive">{errors.termYears.message}</p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="purpose" className="mb-1.5 block text-sm font-medium text-foreground">
            {t.pages.leaseSettlement.purposeLabel}
          </label>
          <Textarea
            id="purpose"
            rows={2}
            placeholder={t.pages.leaseSettlement.purposePlaceholder}
            {...register("purpose")}
          />
          {errors.purpose ? (
            <p className="mt-1.5 text-sm text-destructive">{errors.purpose.message}</p>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t.pages.leaseSettlement.feeLabel}</span>
            <span className="tabular font-heading text-lg font-semibold text-foreground">
              {fee ? f.money(fee) : "—"}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {PAYMENT_METHODS.map((option) => {
              const Icon = option.icon;
              const active = paymentMethod === option.value;
              return (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => setValue("paymentMethod", option.value)}
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
                    {t.pages.leaseSettlement.paymentMethods[option.value]}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{t.pages.leaseSettlement.paymentNote}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={apply.isPending}>
            {apply.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {fee ? t.pages.leaseSettlement.confirmPay(f.money(fee)) : t.pages.leaseSettlement.pay}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={apply.isPending}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MyLeaseSettlementCard({ application }: { application: ServiceApplication }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const [busy, setBusy] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const details = application.details as {
    landUse?: LandUse;
    locationDescription?: string;
    areaDecimals?: number;
    termYears?: number;
    leaseFeeAmount?: number;
    leaseFeePaidAt?: string;
    leaseExpiresAt?: string;
  };
  const isAgricultural = details.landUse === "agricultural";

  async function handlePayLease(method: PaymentMethod) {
    setBusy(true);
    try {
      const res = await fetch(`/api/lease-settlement/${application.id}/pay-lease`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: method }),
      });
      if (!res.ok) throw new Error("Failed to pay lease");
      toast.success("Lease fee paid successfully");
      setPaymentDialogOpen(false);
      window.location.reload();
    } catch (e) {
      toast.error("Payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRenewLease() {
    setBusy(true);
    try {
      const res = await fetch(`/api/lease-settlement/${application.id}/renew`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to renew lease");
      toast.success("Lease renewed for 1 year");
      window.location.reload();
    } catch (e) {
      toast.error("Renewal failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-3 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/applications/${application.id}`} className="hover:underline">
                <IdChip>{application.applicationNo}</IdChip>
              </Link>
            <span className="text-sm text-muted-foreground">
              {t.pages.leaseSettlement.landUse[isAgricultural ? "agricultural" : "nonAgricultural"]}
            </span>
          </div>
          {details.locationDescription ? (
            <p className="truncate text-xs text-muted-foreground">{details.locationDescription}</p>
          ) : null}
          <div className="text-xs text-muted-foreground">
            {f.date(application.submittedAt ?? application.createdAt)}
            {application.feeAmount != null ? (
              <>
                {" · "}
                <span className="tabular">{f.money({ amount: application.feeAmount, currency: "BDT" })} (Application Fee)</span>
              </>
            ) : null}
          </div>
          {details.leaseExpiresAt && (
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-1">
              Active until: {f.date(details.leaseExpiresAt)}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusMetaBadge meta={s.serviceApplication[application.status]} />
          {application.status === "approved" && !details.leaseFeePaidAt && details.leaseFeeAmount && (
            <Button size="sm" onClick={() => setPaymentDialogOpen(true)} disabled={busy}>
              Pay Lease Fee ({f.money({ amount: details.leaseFeeAmount, currency: "BDT" })})
            </Button>
          )}
          {details.leaseFeePaidAt && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setReceiptOpen(true)}>
                <FileText className="mr-2 size-3" />
                View Receipt
              </Button>
              <Button size="sm" variant="outline" onClick={handleRenewLease} disabled={busy}>
                {busy && <Loader2 className="mr-2 size-3 animate-spin" />}
                Renew Lease
              </Button>
            </div>
          )}
        </div>
      </div>

      {details.leaseFeeAmount && (
        <PaymentConfirmationDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          amount={f.money({ amount: details.leaseFeeAmount, currency: "BDT" })}
          defaultMethod="bkash"
          busy={busy}
          onConfirm={handlePayLease}
        />
      )}

      {details.leaseFeePaidAt && (
        <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Lease Payment Receipt</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Application No:</span>
                <span className="font-medium">{application.applicationNo}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Payment Date:</span>
                <span className="font-medium">{f.date(details.leaseFeePaidAt)}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Amount Paid:</span>
                <span className="font-medium">{f.money({ amount: details.leaseFeeAmount ?? 0, currency: "BDT" })}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Valid Until:</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {details.leaseExpiresAt ? f.date(details.leaseExpiresAt) : "N/A"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground text-center pt-2">
                This is a system generated receipt and does not require a physical signature. It serves as validation for one year of land lease.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function NewApplicationFlow({ onDone }: { onDone: () => void }) {
  const t = useT();
  const { data } = useKhasLandPlots({ status: "available" });
  const [selectedPlot, setSelectedPlot] = useState<KhasLandPlot | undefined>();
  const [showForm, setShowForm] = useState(false);
  const plots = data?.items ?? [];

  if (showForm) {
    return (
      <div className="space-y-4">
        {selectedPlot ? (
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
            <div className="text-sm">
              <span className="font-medium">Selected Plot:</span> {selectedPlot.dagNo} ({selectedPlot.mouza}, {selectedPlot.upazila}) — {selectedPlot.areaDecimals} decimals
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
              Back to Map
            </Button>
          </div>
        ) : null}
        <ApplyForm onDone={onDone} prefilledPlot={selectedPlot} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="text-sm text-muted-foreground font-medium flex justify-between items-center">
          <span>Select an available plot from the map or list, or skip to apply manually:</span>
          <Button variant="secondary" size="sm" onClick={() => {
            setSelectedPlot(undefined);
            setShowForm(true);
          }}>
            Skip Map Selection
          </Button>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <KhasLandMap plots={plots} selectedId={selectedPlot?.id} onSelect={setSelectedPlot} className="h-96" />
          </div>
          
          <div className="flex flex-col gap-2 overflow-y-auto max-h-96 pr-1">
            <div className="text-sm font-medium mb-1">Available Plots</div>
            {plots.map((plot) => (
              <div 
                key={plot.id} 
                onClick={() => setSelectedPlot(plot)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedPlot?.id === plot.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
              >
                <div className="font-medium text-sm">Dag No: {plot.dagNo}</div>
                <div className="text-xs text-muted-foreground">{plot.mouza}, {plot.upazila}</div>
                <div className="text-xs text-muted-foreground mt-1 capitalize">{plot.areaDecimals} decimals • {plot.landUse}</div>
                
                {selectedPlot?.id === plot.id && (
                  <Button size="sm" className="w-full mt-3" onClick={() => setShowForm(true)}>
                    Apply for this Plot
                  </Button>
                )}
              </div>
            ))}
            
            {plots.length === 0 && (
              <div className="text-sm text-muted-foreground italic p-4 text-center border rounded-lg border-dashed">
                No plots currently available.
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function CitizenLeaseSettlement() {
  const t = useT();
  const [applying, setApplying] = useState(false);
  const { data, isLoading } = useServiceApplications({
    scope: "mine",
    serviceType: "lease-settlement",
    pageSize: 50,
  });
  const applications = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.leaseSettlement}
        description={t.pages.leaseSettlement.description}
      >
        {applying ? null : (
          <Button size="sm" onClick={() => setApplying(true)}>
            <Plus className="size-4" />
            {t.pages.leaseSettlement.newRequest}
          </Button>
        )}
      </PageHeader>

      {applying ? <NewApplicationFlow onDone={() => setApplying(false)} /> : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        applying ? null : (
          <EmptyState
            icon={Sprout}
            title={t.pages.leaseSettlement.emptyTitle}
            description={t.pages.leaseSettlement.emptyBody}
          >
            <Button onClick={() => setApplying(true)}>
              <Plus className="size-4 mr-2" />
              {t.pages.leaseSettlement.newRequest}
            </Button>
          </EmptyState>
        )
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground">
            {t.pages.leaseSettlement.myRequestsLabel}
          </div>
          {applications.map((a) => (
            <MyLeaseSettlementCard key={a.id} application={a} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Officer -------------------------------------------------------------

const CLOSED_STATUSES = new Set(["approved", "rejected", "withdrawn"]);

function QueueCard({ application }: { application: ServiceApplication }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const decision = useServiceApplicationDecision(application.id);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const details = application.details as {
    landUse?: LandUse;
    locationDescription?: string;
    areaDecimals?: number;
    termYears?: number;
    purpose?: string;
  };
  const isAgricultural = details.landUse === "agricultural";
  const decided = CLOSED_STATUSES.has(application.status);

  function submit(choice: "approve" | "reject") {
    setBusy(choice);
    decision.mutate(choice, {
      onSuccess: () => {
        setBusy(null);
        toast.success(
          choice === "approve"
            ? t.pages.leaseSettlement.approvedTitle
            : t.pages.leaseSettlement.rejectedTitle,
        );
      },
      onError: () => setBusy(null),
    });
  }

  return (
    <Card className="gap-3 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/applications/${application.id}`} className="hover:underline">
                <IdChip>{application.applicationNo}</IdChip>
              </Link>
            <span className="text-sm font-medium text-foreground">
              {t.pages.leaseSettlement.landUse[isAgricultural ? "agricultural" : "nonAgricultural"]}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {f.date(application.submittedAt ?? application.createdAt)}
            {application.feeAmount != null ? (
              <>
                {" · "}
                <span className="tabular">{f.money({ amount: application.feeAmount, currency: "BDT" })}</span>
              </>
            ) : null}
          </div>
        </div>
        <StatusMetaBadge meta={s.serviceApplication[application.status]} />
      </div>

      <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
        {details.locationDescription ? (
          <div className="text-foreground">{details.locationDescription}</div>
        ) : null}
        {details.areaDecimals != null || details.termYears != null ? (
          <div className="text-muted-foreground">
            {details.areaDecimals != null
              ? `${t.pages.leaseSettlement.areaLabel}: ${details.areaDecimals}`
              : null}
            {details.areaDecimals != null && details.termYears != null ? " · " : null}
            {details.termYears != null
              ? `${t.pages.leaseSettlement.termLabel}: ${details.termYears}`
              : null}
          </div>
        ) : null}
        {details.purpose ? <p className="text-pretty text-muted-foreground">{details.purpose}</p> : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        {decided ? (
          <span className="text-sm text-muted-foreground">{t.pages.leaseSettlement.closed}</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={decision.isPending} onClick={() => submit("approve")}>
              {busy === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {t.pages.leaseSettlement.approve}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={decision.isPending}
              onClick={() => submit("reject")}
            >
              {busy === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
              {t.pages.leaseSettlement.reject}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function OfficerLeaseSettlement() {
  const t = useT();
  const { data, isLoading } = useServiceApplications({
    serviceType: "lease-settlement",
    pageSize: 50,
  });
  const applications = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.landOffice}
        title={t.nav.leaseSettlement}
        description={t.pages.leaseSettlement.queueTitle}
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          icon={X}
          title={t.pages.leaseSettlement.queueEmptyTitle}
          description={t.pages.leaseSettlement.queueEmptyBody}
        />
      ) : (
        <div className="space-y-3">
          {applications.map((a) => (
            <QueueCard key={a.id} application={a} />
          ))}
        </div>
      )}
    </div>
  );
}
