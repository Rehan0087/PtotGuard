"use client";

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
} from "@/hooks/queries";
import type { PaymentMethod, ServiceApplication } from "@/lib/types";

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

function ApplyForm({ onDone }: { onDone: () => void }) {
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
      landUse: "agricultural",
      locationDescription: "",
      areaDecimals: "",
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
        amount:
          landUse === "agricultural"
            ? policy.leaseSettlementAgriculturalFeeBdt
            : policy.leaseSettlementNonAgriculturalFeeBdt,
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
  const details = application.details as {
    landUse?: LandUse;
    locationDescription?: string;
    areaDecimals?: number;
    termYears?: number;
  };
  const isAgricultural = details.landUse === "agricultural";

  return (
    <Card className="gap-3 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip>{application.applicationNo}</IdChip>
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
                <span className="tabular">{f.money({ amount: application.feeAmount, currency: "BDT" })}</span>
              </>
            ) : null}
          </div>
        </div>
        <StatusMetaBadge meta={s.serviceApplication[application.status]} />
      </div>
    </Card>
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

      {applying ? <ApplyForm onDone={() => setApplying(false)} /> : null}

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
          />
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
            <IdChip>{application.applicationNo}</IdChip>
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
