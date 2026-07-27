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
  Ruler,
  Users,
  GitBranch,
  Construction,
  ShieldAlert,
  Route,
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
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import type { Dictionary } from "@/lib/i18n";
import { useParcels, useFileDispute, useSession } from "@/hooks/queries";
import type { DisputeType } from "@/lib/types";

/** Icon and order per dispute kind; the name and blurb come from the dictionary. */
const DISPUTE_TYPES: { value: DisputeType; icon: LucideIcon }[] = [
  { value: "boundary", icon: Ruler },
  { value: "ownership", icon: Users },
  { value: "inheritance", icon: GitBranch },
  { value: "encroachment", icon: Construction },
  { value: "fraud", icon: ShieldAlert },
  { value: "easement", icon: Route },
];

const PRIORITIES = ["low", "medium", "high"] as const;

/** Built per locale — every message here is read by the person filing. */
function makeSchema(t: Dictionary) {
  return z.object({
    parcelId: z.string().min(1, t.pages.newDispute.errors.parcelRequired),
    parcelDagNo: z.string(),
    type: z.enum(["boundary", "ownership", "inheritance", "encroachment", "fraud", "easement"]),
    priority: z.enum(["low", "medium", "high"]),
    description: z
      .string()
      .min(20, t.pages.newDispute.errors.descriptionShort)
      .max(1000, t.pages.newDispute.errors.descriptionLong),
    respondentName: z.string().max(120),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

const STEP_KEYS = ["parcel", "details", "review"] as const;
const STEP_FIELDS: (keyof FormValues)[][] = [["parcelId"], ["type", "priority", "description"], []];

export default function NewDisputePage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const schema = useMemo(() => makeSchema(t), [t]);
  const router = useRouter();
  const [step, setStep] = useState(0);
  const parcelsQ = useParcels({ owner: "me", pageSize: 100 });
  const parcels = parcelsQ.data?.items ?? [];
  const fileDispute = useFileDispute();
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
      parcelDagNo: "",
      type: "boundary",
      priority: "medium",
      description: "",
      respondentName: "",
    },
  });

  // useWatch (vs watch()) keeps the component React-Compiler friendly.
  const parcelId = useWatch({ control, name: "parcelId" });
  const type = useWatch({ control, name: "type" });
  const priority = useWatch({ control, name: "priority" });
  const description = useWatch({ control, name: "description" });
  const respondentName = useWatch({ control, name: "respondentName" });

  const selectedParcel = parcels.find((p) => p.id === parcelId);

  async function next() {
    const ok = await trigger(STEP_FIELDS[step]);
    if (ok) setStep((current) => Math.min(current + 1, STEP_KEYS.length - 1));
  }

  function onSubmit(values: FormValues) {
    fileDispute.mutate(
      {
        parcelId: values.parcelId,
        parcelDagNo: values.parcelDagNo,
        type: values.type as never,
        priority: values.priority as never,
        description: values.description,
        respondentName: values.respondentName || undefined,
      },
      {
        onSuccess: (dispute) => {
          toast.success(t.pages.newDispute.filedTitle, {
            description: t.pages.newDispute.filedBody(dispute.caseNumber),
          });
          router.push(`/disputes/${dispute.id}`);
        },
        onError: () =>
          toast.error(t.pages.newDispute.failedTitle, {
            description: t.pages.newDispute.failedBody,
          }),
      },
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.pages.newDispute.title}
        description={t.pages.newDispute.description}
      />

      {/* Stepper */}
      <ol className="flex items-center gap-1 text-sm">
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
              {t.pages.newDispute.steps[key]}
            </span>
            {i < STEP_KEYS.length - 1 ? <span className="mx-2 h-px w-6 bg-border" /> : null}
          </li>
        ))}
      </ol>

      {/* Deliberately not a <form>: in a multi-step wizard, only the explicit
          "File dispute" button should ever submit — never Enter or step nav. */}
      <div className="space-y-6">
        {/* Step 0 — Parcel */}
        {step === 0 ? (
          <section className="space-y-3">
            <h2 className="font-heading text-base font-semibold text-foreground">
              {t.pages.newDispute.whichParcel}
            </h2>
            {parcelsQ.isLoading ? (
              <div className="grid gap-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : parcels.length === 0 ? (
              <EmptyState icon={MapPin} title={t.pages.newDispute.noParcels} />
            ) : (
              <div className="grid gap-2">
                {parcels.map((p) => {
                  const active = parcelId === p.id;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        setValue("parcelId", p.id, { shouldValidate: true });
                        setValue("parcelDagNo", p.dagNo);
                      }}
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

        {/* Step 1 — Details */}
        {step === 1 ? (
          <section className="space-y-5">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                {t.pages.newDispute.typeOfDispute}
              </span>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DISPUTE_TYPES.map((option) => {
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
                              {t.domain.disputeType[option.value]}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {t.pages.newDispute.blurbs[option.value]}
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
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                {t.pages.newDispute.priority}
              </span>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => field.onChange(p)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                          field.value === p
                            ? "bg-card text-foreground ring-1 ring-foreground/10"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t.status.priority[p]}
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>

            <div>
              <label htmlFor="desc" className="mb-1.5 block text-sm font-medium text-foreground">
                {t.pages.newDispute.whatHappened}
              </label>
              <Textarea
                id="desc"
                rows={5}
                placeholder={t.pages.newDispute.descriptionPlaceholder}
                {...register("description")}
              />
              {errors.description ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="size-4" />
                  {errors.description.message}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="respondent" className="mb-1.5 block text-sm font-medium text-foreground">
                {t.pages.newDispute.otherParty}{" "}
                <span className="text-muted-foreground">({t.common.optional})</span>
              </label>
              <Input
                id="respondent"
                placeholder={t.pages.newDispute.otherPartyPlaceholder}
                {...register("respondentName")}
              />
            </div>
          </section>
        ) : null}

        {/* Step 2 — Review */}
        {step === 2 ? (
          <section className="space-y-3">
            <h2 className="font-heading text-base font-semibold text-foreground">
              {t.pages.newDispute.reviewAndSubmit}
            </h2>
            <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              <Row label={t.pages.newDispute.rowParcel}>
                {selectedParcel ? (
                  <span className="flex items-center gap-1.5">
                    <IdChip icon={MapPin}>{selectedParcel.dagNo}</IdChip>
                    <span className="text-foreground">{selectedParcel.title}</span>
                  </span>
                ) : (
                  t.common.notAvailable
                )}
              </Row>
              <Row label={t.pages.newDispute.rowType}>{t.domain.disputeType[type]}</Row>
              <Row label={t.pages.newDispute.rowPriority}>
                <StatusMetaBadge meta={s.priority[priority]} dot={false} />
              </Row>
              <Row label={t.pages.newDispute.rowOtherParty}>
                {respondentName || t.pages.newDispute.notSpecified}
              </Row>
              <Row label={t.pages.newDispute.rowDescription}>
                <span className="text-foreground">{description}</span>
              </Row>
            </dl>
            <p className="text-xs text-muted-foreground">
              {t.pages.newDispute.filedAs(session?.user.name ?? t.pages.newDispute.you)}
            </p>
          </section>
        ) : null}

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => (step === 0 ? router.push("/disputes") : setStep((s) => s - 1))}
          >
            <ArrowLeft className="size-4" />
            {step === 0 ? t.common.cancel : t.common.back}
          </Button>
          {step < STEP_KEYS.length - 1 ? (
            <Button type="button" onClick={next}>
              {t.pages.newDispute.continue}
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit(onSubmit)} disabled={fileDispute.isPending}>
              <Send className="size-4" />
              {fileDispute.isPending ? t.pages.newDispute.filing : t.pages.newDispute.file}
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
