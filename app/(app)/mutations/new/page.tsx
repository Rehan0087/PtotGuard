"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { toast } from "sonner";
import {
  Check,
  ArrowLeft,
  ArrowRight,
  Send,
  MapPin,
  Banknote,
  GitBranch,
  Gift,
  Rows3,
  FileEdit,
  Smartphone,
  CreditCard,
  AlertCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { ParcelBoundary } from "@/components/parcel-boundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import type { Dictionary } from "@/lib/i18n";
import { useParcels, useCreateMutation, useSession, usePolicies } from "@/hooks/queries";
import type { MutationType, PaymentMethod } from "@/lib/types";

/** Icon and order per transfer kind; the name and blurb come from the dictionary. */
const MUTATION_TYPES: { value: MutationType; icon: LucideIcon }[] = [
  { value: "sale", icon: Banknote },
  { value: "inheritance", icon: GitBranch },
  { value: "gift", icon: Gift },
  { value: "partition", icon: Rows3 },
  { value: "correction", icon: FileEdit },
];

const PAYMENT_METHODS: { value: PaymentMethod; icon: LucideIcon }[] = [
  { value: "bkash", icon: Smartphone },
  { value: "nagad", icon: Smartphone },
  { value: "card", icon: CreditCard },
];

/** Built per locale — every message here is read by the person filing. */
function makeSchema(t: Dictionary) {
  return z.object({
    parcelId: z.string().min(1, t.pages.newMutation.errors.parcelRequired),
    type: z.enum(["sale", "inheritance", "gift", "partition", "correction"]),
    toOwnerName: z.string().min(1, t.pages.newMutation.errors.toOwnerRequired).max(120),
    deedNumber: z.string().max(60),
    deedDate: z.string(),
    paymentMethod: z.enum(["bkash", "nagad", "card"]),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

const STEP_KEYS = ["parcel", "transfer", "payment", "review"] as const;
const STEP_FIELDS: (keyof FormValues)[][] = [
  ["parcelId"],
  ["type", "toOwnerName"],
  ["paymentMethod"],
  [],
];

export default function NewMutationPage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const schema = useMemo(() => makeSchema(t), [t]);
  const router = useRouter();
  const [step, setStep] = useState(0);
  const parcelsQ = useParcels({ owner: "me", pageSize: 100 });
  const parcels = parcelsQ.data?.items ?? [];
  const { data: policy } = usePolicies();
  const createMutation = useCreateMutation();
  const { data: session } = useSession();

  const {
    control,
    register,
    handleSubmit,
    trigger,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      parcelId: "",
      type: "sale",
      toOwnerName: "",
      deedNumber: "",
      deedDate: "",
      paymentMethod: "bkash",
    },
  });

  // useWatch (vs watch()) keeps the component React-Compiler friendly.
  const parcelId = useWatch({ control, name: "parcelId" });
  const type = useWatch({ control, name: "type" });
  const toOwnerName = useWatch({ control, name: "toOwnerName" });
  const deedNumber = useWatch({ control, name: "deedNumber" });
  const deedDate = useWatch({ control, name: "deedDate" });
  const paymentMethod = useWatch({ control, name: "paymentMethod" });

  const selectedParcel = parcels.find((p) => p.id === parcelId);
  const fee = policy ? { amount: policy.mutationFeeBdt, currency: "BDT" as const } : null;

  async function next() {
    const ok = await trigger(STEP_FIELDS[step]);
    if (ok) setStep((current) => Math.min(current + 1, STEP_KEYS.length - 1));
  }

  function onSubmit(values: FormValues) {
    createMutation.mutate(
      {
        parcelId: values.parcelId,
        type: values.type as never,
        toOwnerName: values.toOwnerName,
        deedNumber: values.deedNumber || undefined,
        deedDate: values.deedDate || undefined,
        paymentMethod: values.paymentMethod as never,
      },
      {
        onSuccess: (mutation) => {
          toast.success(t.pages.newMutation.filedTitle, {
            description: t.pages.newMutation.filedBody(mutation.mutationNumber),
          });
          router.push("/mutations");
        },
        onError: () =>
          toast.error(t.pages.newMutation.failedTitle, {
            description: t.pages.newMutation.failedBody,
          }),
      },
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.pages.newMutation.title}
        description={t.pages.newMutation.description}
      />

      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {STEP_KEYS.map((key, i) => (
          <li key={key} className="flex items-center gap-1">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                i < step
                  ? "bg-primary text-primary-foreground"
                  : i === step
                    ? "bg-marker text-marker-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-3.5" /> : f.number(i + 1)}
            </span>
            <span className={cn(i === step ? "font-medium text-foreground" : "text-muted-foreground")}>
              {t.pages.newMutation.steps[key]}
            </span>
            {i < STEP_KEYS.length - 1 ? <span className="mx-2 h-px w-6 bg-border" /> : null}
          </li>
        ))}
      </ol>

      {/* Deliberately not a <form>: in a multi-step wizard, only the explicit
          "File application" button should ever submit — never Enter or step nav. */}
      <div className="space-y-6">
        {/* Step 0 — Parcel */}
        {step === 0 ? (
          <section className="space-y-3">
            <h2 className="font-heading text-base font-semibold text-foreground">
              {t.pages.newMutation.whichParcel}
            </h2>
            {parcelsQ.isLoading ? (
              <div className="grid gap-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : parcels.length === 0 ? (
              <EmptyState icon={MapPin} title={t.pages.newMutation.noParcels} />
            ) : (
              <div className="grid gap-2">
                {parcels.map((p) => {
                  const active = parcelId === p.id;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setValue("parcelId", p.id, { shouldValidate: true })}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors",
                        active
                          ? "border-primary ring-1 ring-primary"
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-secondary/40 text-primary">
                        <ParcelBoundary boundary={p.boundary} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <IdChip icon={MapPin}>{p.dagNo}</IdChip>
                          <span className="tabular text-xs text-muted-foreground">#{p.khatianNo}</span>
                        </div>
                        <div className="mt-1 truncate text-sm font-medium text-foreground">{p.title}</div>
                      </div>
                      <StatusMetaBadge meta={s.registry[p.registryStatus]} />
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border",
                          active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                        )}
                      >
                        {active ? <Check className="size-3.5" /> : null}
                      </span>
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
          </section>
        ) : null}

        {/* Step 1 — Transfer details */}
        {step === 1 ? (
          <section className="space-y-5">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                {t.pages.newMutation.typeOfTransfer}
              </span>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {MUTATION_TYPES.map((option) => {
                      const Icon = option.icon;
                      const active = field.value === option.value;
                      return (
                        <button
                          type="button"
                          key={option.value}
                          onClick={() => field.onChange(option.value)}
                          className={cn(
                            "flex items-start gap-2.5 rounded-lg border bg-card p-3 text-left transition-colors",
                            active ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/50",
                          )}
                        >
                          <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-marker" : "text-muted-foreground")} />
                          <span>
                            <span className="block text-sm font-medium text-foreground">
                              {t.domain.mutationType[option.value]}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {t.pages.newMutation.blurbs[option.value]}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>

            <div>
              <label htmlFor="toOwner" className="mb-1.5 block text-sm font-medium text-foreground">
                {t.pages.newMutation.toOwnerLabel}
              </label>
              <Input
                id="toOwner"
                placeholder={t.pages.newMutation.toOwnerPlaceholder}
                {...register("toOwnerName")}
              />
              {errors.toOwnerName ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="size-4" />
                  {errors.toOwnerName.message}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="deedNumber" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t.pages.newMutation.deedNumberLabel}{" "}
                  <span className="text-muted-foreground">({t.common.optional})</span>
                </label>
                <Input
                  id="deedNumber"
                  placeholder={t.pages.newMutation.deedNumberPlaceholder}
                  {...register("deedNumber")}
                />
              </div>
              <div>
                <label htmlFor="deedDate" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t.pages.newMutation.deedDateLabel}{" "}
                  <span className="text-muted-foreground">({t.common.optional})</span>
                </label>
                <Input id="deedDate" type="date" {...register("deedDate")} />
              </div>
            </div>
          </section>
        ) : null}

        {/* Step 2 — Payment */}
        {step === 2 ? (
          <section className="space-y-5">
            <h2 className="font-heading text-base font-semibold text-foreground">
              {t.pages.newMutation.paymentTitle}
            </h2>
            {fee ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                <span className="text-sm text-muted-foreground">{t.pages.newMutation.feeLabel}</span>
                <span className="tabular text-sm font-semibold text-foreground">{f.money(fee)}</span>
              </div>
            ) : null}
            <div>
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                {t.pages.newMutation.paymentMethodLabel}
              </span>
              <Controller
                name="paymentMethod"
                control={control}
                render={({ field }) => (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {PAYMENT_METHODS.map((option) => {
                      const Icon = option.icon;
                      const active = field.value === option.value;
                      return (
                        <button
                          type="button"
                          key={option.value}
                          onClick={() => field.onChange(option.value)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border bg-card p-3 text-left transition-colors",
                            active ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/50",
                          )}
                        >
                          <Icon className={cn("size-4 shrink-0", active ? "text-marker" : "text-muted-foreground")} />
                          <span className="text-sm font-medium text-foreground">
                            {t.pages.newMutation.paymentMethods[option.value]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t.pages.newMutation.paymentNote}</p>
          </section>
        ) : null}

        {/* Step 3 — Review */}
        {step === 3 ? (
          <section className="space-y-3">
            <h2 className="font-heading text-base font-semibold text-foreground">
              {t.pages.newMutation.reviewAndSubmit}
            </h2>
            <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              <Row label={t.pages.newMutation.rowParcel}>
                {selectedParcel ? (
                  <span className="flex items-center gap-1.5">
                    <IdChip icon={MapPin}>{selectedParcel.dagNo}</IdChip>
                    <span className="text-foreground">{selectedParcel.title}</span>
                  </span>
                ) : (
                  t.common.notAvailable
                )}
              </Row>
              <Row label={t.pages.newMutation.rowType}>{t.domain.mutationType[type]}</Row>
              <Row label={t.pages.newMutation.rowToOwner}>{toOwnerName}</Row>
              <Row label={t.pages.newMutation.rowDeed}>
                {deedNumber || deedDate
                  ? [deedNumber, deedDate ? f.date(deedDate) : null].filter(Boolean).join(" · ")
                  : t.pages.newMutation.notSpecified}
              </Row>
              <Row label={t.pages.newMutation.rowPayment}>
                {t.pages.newMutation.paymentMethods[paymentMethod]}
                {fee ? ` · ${f.money(fee)}` : ""}
              </Row>
            </dl>
            <p className="text-xs text-muted-foreground">
              {t.pages.newMutation.filedAs(session?.user.name ?? t.pages.newMutation.you)}
            </p>
          </section>
        ) : null}

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => (step === 0 ? router.push("/mutations") : setStep((s) => s - 1))}
          >
            <ArrowLeft className="size-4" />
            {step === 0 ? t.common.cancel : t.common.back}
          </Button>
          {step < STEP_KEYS.length - 1 ? (
            <Button type="button" onClick={next}>
              {t.pages.newMutation.continue}
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit(onSubmit)} disabled={createMutation.isPending}>
              <Send className="size-4" />
              {createMutation.isPending ? t.pages.newMutation.filing : t.pages.newMutation.file}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
      <dt className="w-32 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="flex-1 text-sm">{children}</dd>
    </div>
  );
}
