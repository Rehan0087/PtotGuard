"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertCircle,
  Ban,
  Check,
  CreditCard,
  FileCheck,
  FileEdit,
  Loader2,
  MapPin,
  Plus,
  Smartphone,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
  useParcels,
  usePolicies,
  useApplyLandAdmin,
  useServiceApplications,
  useServiceApplicationDecision,
} from "@/hooks/queries";
import type { PaymentMethod, ServiceApplication } from "@/lib/types";

type RequestType = "certified-copy" | "correction";
type CorrectionType = "name" | "area" | "other";

const REQUEST_TYPES: { value: RequestType; icon: LucideIcon }[] = [
  { value: "certified-copy", icon: FileCheck },
  { value: "correction", icon: FileEdit },
];

const CORRECTION_TYPES: CorrectionType[] = ["name", "area", "other"];

const PAYMENT_METHODS: { value: PaymentMethod; icon: LucideIcon }[] = [
  { value: "bkash", icon: Smartphone },
  { value: "nagad", icon: Smartphone },
  { value: "card", icon: CreditCard },
];

/** Built per locale — every message here is read by whoever is filing. */
function makeSchema(t: Dictionary) {
  return z
    .object({
      parcelId: z.string().min(1, t.pages.landAdmin.errors.parcelRequired),
      requestType: z.enum(["certified-copy", "correction"]),
      correctionType: z.string().optional(),
      currentValue: z.string().optional(),
      correctedValue: z.string().optional(),
      reason: z.string().optional(),
      paymentMethod: z.enum(["bkash", "nagad", "card"]),
    })
    .refine((d) => d.requestType !== "correction" || Boolean(d.correctionType), {
      message: t.pages.landAdmin.errors.correctionTypeRequired,
      path: ["correctionType"],
    })
    .refine((d) => d.requestType !== "correction" || Boolean(d.currentValue?.trim()), {
      message: t.pages.landAdmin.errors.currentValueRequired,
      path: ["currentValue"],
    })
    .refine((d) => d.requestType !== "correction" || Boolean(d.correctedValue?.trim()), {
      message: t.pages.landAdmin.errors.correctedValueRequired,
      path: ["correctedValue"],
    })
    .refine((d) => d.requestType !== "correction" || Boolean(d.reason?.trim()), {
      message: t.pages.landAdmin.errors.reasonRequired,
      path: ["reason"],
    });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export default function LandAdminPage() {
  const role = useRole();
  return role === "citizen" ? <CitizenLandAdmin /> : <OfficerLandAdmin />;
}

// --- Citizen -----------------------------------------------------------------

function ApplyForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const f = useFmt();
  const schema = useMemo(() => makeSchema(t), [t]);
  const parcelsQ = useParcels({ owner: "me", pageSize: 100 });
  const parcels = parcelsQ.data?.items ?? [];
  const { data: policy } = usePolicies();
  const apply = useApplyLandAdmin();

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      parcelId: "",
      requestType: "certified-copy",
      correctionType: "",
      currentValue: "",
      correctedValue: "",
      reason: "",
      paymentMethod: "bkash",
    },
  });

  // useWatch (vs watch()) keeps the component React-Compiler friendly.
  const parcelId = useWatch({ control, name: "parcelId" });
  const requestType = useWatch({ control, name: "requestType" });
  const correctionType = useWatch({ control, name: "correctionType" });
  const paymentMethod = useWatch({ control, name: "paymentMethod" });

  const fee = policy
    ? {
        amount:
          requestType === "certified-copy"
            ? policy.landAdminCertifiedCopyFeeBdt
            : policy.landAdminCorrectionFeeBdt,
        currency: "BDT" as const,
      }
    : null;

  function onSubmit(values: FormValues) {
    apply.mutate(
      {
        parcelId: values.parcelId,
        requestType: values.requestType,
        correctionType: values.requestType === "correction" ? values.correctionType : undefined,
        currentValue: values.requestType === "correction" ? values.currentValue : undefined,
        correctedValue: values.requestType === "correction" ? values.correctedValue : undefined,
        reason: values.requestType === "correction" ? values.reason : undefined,
        paymentMethod: values.paymentMethod,
      },
      {
        onSuccess: (application) => {
          toast.success(t.pages.landAdmin.appliedTitle, {
            description: t.pages.landAdmin.appliedBody(application.applicationNo),
          });
          onDone();
        },
        onError: () =>
          toast.error(t.pages.landAdmin.failedTitle, {
            description: t.pages.landAdmin.failedBody,
          }),
      },
    );
  }

  return (
    <Card className="gap-4 px-5">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {REQUEST_TYPES.map((option) => {
            const Icon = option.icon;
            const active = requestType === option.value;
            return (
              <button
                type="button"
                key={option.value}
                onClick={() => setValue("requestType", option.value, { shouldValidate: true })}
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
                    {t.pages.landAdmin.requestType[
                      option.value === "certified-copy" ? "certifiedCopy" : "correction"
                    ]}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t.pages.landAdmin.requestType[
                      option.value === "certified-copy" ? "certifiedCopyBlurb" : "correctionBlurb"
                    ]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            {t.pages.landAdmin.parcelLabel}
          </label>
          {parcelsQ.isLoading ? (
            <Skeleton className="h-11 rounded-lg" />
          ) : parcels.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.pages.landAdmin.parcelPlaceholder}</p>
          ) : (
            <div className="grid gap-1.5">
              {parcels.map((p) => {
                const active = parcelId === p.id;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setValue("parcelId", p.id, { shouldValidate: true })}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors",
                      active
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <IdChip icon={MapPin}>{p.dagNo}</IdChip>
                    <span className="truncate text-muted-foreground">{p.title}</span>
                    {active ? <Check className="ml-auto size-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          )}
          {errors.parcelId ? (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="size-4" />
              {errors.parcelId.message}
            </p>
          ) : null}
        </div>

        {requestType === "correction" ? (
          <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                {t.pages.landAdmin.correctionTypeLabel}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CORRECTION_TYPES.map((ct) => (
                  <button
                    type="button"
                    key={ct}
                    onClick={() => setValue("correctionType", ct, { shouldValidate: true })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      correctionType === ct
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {t.pages.landAdmin.correctionType[ct]}
                  </button>
                ))}
              </div>
              {errors.correctionType ? (
                <p className="text-sm text-destructive">{errors.correctionType.message}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="currentValue" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t.pages.landAdmin.currentValueLabel}
                </label>
                <Input id="currentValue" {...register("currentValue")} />
                {errors.currentValue ? (
                  <p className="mt-1.5 text-sm text-destructive">{errors.currentValue.message}</p>
                ) : null}
              </div>
              <div>
                <label
                  htmlFor="correctedValue"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  {t.pages.landAdmin.correctedValueLabel}
                </label>
                <Input id="correctedValue" {...register("correctedValue")} />
                {errors.correctedValue ? (
                  <p className="mt-1.5 text-sm text-destructive">{errors.correctedValue.message}</p>
                ) : null}
              </div>
            </div>

            <div>
              <label htmlFor="reason" className="mb-1.5 block text-sm font-medium text-foreground">
                {t.pages.landAdmin.reasonLabel}
              </label>
              <Textarea
                id="reason"
                rows={3}
                placeholder={t.pages.landAdmin.reasonPlaceholder}
                {...register("reason")}
              />
              {errors.reason ? (
                <p className="mt-1.5 text-sm text-destructive">{errors.reason.message}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t.pages.landAdmin.feeLabel}</span>
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
                    {t.pages.landAdmin.paymentMethods[option.value]}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{t.pages.landAdmin.paymentNote}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={apply.isPending}>
            {apply.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {fee ? t.pages.landAdmin.confirmPay(f.money(fee)) : t.pages.landAdmin.pay}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={apply.isPending}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MyLandAdminCard({ application }: { application: ServiceApplication }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const details = application.details as {
    requestType?: RequestType;
    correctionType?: CorrectionType;
  };
  const isCorrection = details.requestType === "correction";

  return (
    <Card className="gap-3 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip>{application.applicationNo}</IdChip>
            <span className="text-sm text-muted-foreground">
              {t.pages.landAdmin.requestType[isCorrection ? "correction" : "certifiedCopy"]}
              {isCorrection && details.correctionType
                ? ` · ${t.pages.landAdmin.correctionType[details.correctionType]}`
                : ""}
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
      {application.parcelId ? (
        <div className="border-t border-border pt-3">
          <Link
            href={`/parcels/${application.parcelId}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}
          >
            {t.pages.landTax.viewParcel}
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

function CitizenLandAdmin() {
  const t = useT();
  const [applying, setApplying] = useState(false);
  const { data, isLoading } = useServiceApplications({
    scope: "mine",
    serviceType: "land-admin",
    pageSize: 50,
  });
  const applications = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.landAdmin}
        description={t.pages.landAdmin.description}
      >
        {applying ? null : (
          <Button size="sm" onClick={() => setApplying(true)}>
            <Plus className="size-4" />
            {t.pages.landAdmin.newRequest}
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
            icon={FileCheck}
            title={t.pages.landAdmin.emptyTitle}
            description={t.pages.landAdmin.emptyBody}
          />
        )
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground">{t.pages.landAdmin.myRequestsLabel}</div>
          {applications.map((a) => (
            <MyLandAdminCard key={a.id} application={a} />
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
    requestType?: RequestType;
    correctionType?: CorrectionType;
    currentValue?: string;
    correctedValue?: string;
    reason?: string;
  };
  const isCorrection = details.requestType === "correction";
  const decided = CLOSED_STATUSES.has(application.status);

  function submit(choice: "approve" | "reject") {
    setBusy(choice);
    decision.mutate(choice, {
      onSuccess: () => {
        setBusy(null);
        toast.success(
          choice === "approve" ? t.pages.landAdmin.approvedTitle : t.pages.landAdmin.rejectedTitle,
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
              {t.pages.landAdmin.requestType[isCorrection ? "correction" : "certifiedCopy"]}
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

      {isCorrection ? (
        <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
          {details.correctionType ? (
            <div>
              <span className="text-muted-foreground">{t.pages.landAdmin.correctionTypeLabel} </span>
              <span className="text-foreground">{t.pages.landAdmin.correctionType[details.correctionType]}</span>
            </div>
          ) : null}
          {details.currentValue || details.correctedValue ? (
            <div className="text-foreground">
              {details.currentValue} → {details.correctedValue}
            </div>
          ) : null}
          {details.reason ? <p className="text-pretty text-muted-foreground">{details.reason}</p> : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        {decided ? (
          <>
            <span className="text-sm text-muted-foreground">{t.pages.landAdmin.closed}</span>
            {application.parcelId ? (
              <Link
                href={`/parcels/${application.parcelId}`}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                {t.pages.landTax.viewParcel}
              </Link>
            ) : null}
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={decision.isPending} onClick={() => submit("approve")}>
              {busy === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {t.pages.landAdmin.approve}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={decision.isPending}
              onClick={() => submit("reject")}
            >
              {busy === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
              {t.pages.landAdmin.reject}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function OfficerLandAdmin() {
  const t = useT();
  const { data, isLoading } = useServiceApplications({ serviceType: "land-admin", pageSize: 50 });
  const applications = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.landOffice}
        title={t.nav.landAdmin}
        description={t.pages.landAdmin.queueTitle}
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
          title={t.pages.landAdmin.queueEmptyTitle}
          description={t.pages.landAdmin.queueEmptyBody}
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
