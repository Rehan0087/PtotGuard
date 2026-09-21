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
  Search,
  UserRound,
  X,
  Info,
  FileText,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { ParcelBoundary } from "@/components/parcel-boundary";
import { UploadDocumentDialog } from "@/components/upload-document-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import type { Dictionary } from "@/lib/i18n";
import {
  useParcels,
  useCreateMutation,
  useSession,
  usePolicies,
  useSearchCitizens,
  useDocuments,
} from "@/hooks/queries";
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

/** Types that require a new owner picker */
const TYPES_WITH_RECIPIENT: MutationType[] = ["sale", "inheritance", "gift", "partition"];
/** Types that show deed number + deed date */
const TYPES_WITH_DEED: MutationType[] = ["sale", "gift"];

/** Built per locale — every message here is read by the person filing. */
function makeSchema(t: Dictionary) {
  return z
    .object({
      parcelId: z.string().min(1, t.pages.newMutation.errors.parcelRequired),
      type: z.enum(["sale", "inheritance", "gift", "partition", "correction"]),
      toOwnerId: z.string().optional().default(""),
      deedNumber: z.string().max(60).optional().default(""),
      deedDate: z.string().optional().default(""),
      documentIds: z.array(z.string()).optional().default([]),
      paymentMethod: z.enum(["bkash", "nagad", "card"]),
      correctionReason: z.string().optional().default(""),
      heirRelationship: z.string().optional().default(""),
      partitionNote: z.string().optional().default(""),
    })
    .superRefine((data, ctx) => {
      if (TYPES_WITH_RECIPIENT.includes(data.type as MutationType) && !data.toOwnerId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t.pages.newMutation.errors.toOwnerRequired,
          path: ["toOwnerId"],
        });
      }
      if (data.type === "correction" && !data.correctionReason?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t.pages.newMutation.errors.correctionReasonRequired,
          path: ["correctionReason"],
        });
      }
      if (data.type === "inheritance" && !data.heirRelationship?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t.pages.newMutation.errors.heirRelationshipRequired,
          path: ["heirRelationship"],
        });
      }
    });
}

type FormValues = z.input<ReturnType<typeof makeSchema>>;

const STEP_KEYS = ["parcel", "transfer", "payment", "review"] as const;

/** Fields to validate per step — type-specific fields validated at step 1. */
function stepFields(type: MutationType): (keyof FormValues)[][] {
  const transferFields: (keyof FormValues)[] = ["type"];
  if (TYPES_WITH_RECIPIENT.includes(type)) transferFields.push("toOwnerId");
  if (type === "correction") transferFields.push("correctionReason");
  if (type === "inheritance") transferFields.push("heirRelationship");
  return [["parcelId"], transferFields, ["paymentMethod"], []];
}

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
  const [uploadOpen, setUploadOpen] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    trigger,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      parcelId: "",
      type: "sale",
      toOwnerId: "",
      deedNumber: "",
      deedDate: "",
      documentIds: [],
      paymentMethod: "bkash",
      correctionReason: "",
      heirRelationship: "",
      partitionNote: "",
    },
  });

  // useWatch (vs watch()) keeps the component React-Compiler friendly.
  const parcelId = useWatch({ control, name: "parcelId" });
  const type = useWatch({ control, name: "type" }) as MutationType;
  const toOwnerId = useWatch({ control, name: "toOwnerId" });
  const deedNumber = useWatch({ control, name: "deedNumber" });
  const deedDate = useWatch({ control, name: "deedDate" });
  const documentIds = useWatch({ control, name: "documentIds" }) || [];
  const paymentMethod = useWatch({ control, name: "paymentMethod" });
  const correctionReason = useWatch({ control, name: "correctionReason" });
  const heirRelationship = useWatch({ control, name: "heirRelationship" });
  const partitionNote = useWatch({ control, name: "partitionNote" });

  const docsQ = useDocuments({ parcelId: parcelId || "none", pageSize: 100 });
  const documents = docsQ.data?.items ?? [];

  // Display-only — the form only ever submits toOwnerId, but the picked
  // name is what the review step and a "change" chip need to show.
  const [toOwnerName, setToOwnerName] = useState("");

  const needsRecipient = TYPES_WITH_RECIPIENT.includes(type);
  const needsDeed = TYPES_WITH_DEED.includes(type);
  const isCorrection = type === "correction";
  const isInheritance = type === "inheritance";
  const isPartition = type === "partition";

  const selectedParcel = parcels.find((p) => p.id === parcelId);
  const fee = policy ? { amount: policy.mutationFeeBdt, currency: "BDT" as const } : null;

  async function next() {
    const fields = stepFields(type)[step];
    const ok = await trigger(fields as (keyof FormValues)[]);
    if (ok) setStep((current) => Math.min(current + 1, STEP_KEYS.length - 1));
  }

  function onSubmit(values: FormValues) {
    const metadata: Record<string, unknown> = {};
    if (values.correctionReason) metadata.correctionReason = values.correctionReason;
    if (values.heirRelationship) metadata.heirRelationship = values.heirRelationship;
    if (values.partitionNote) metadata.partitionNote = values.partitionNote;

    createMutation.mutate(
      {
        parcelId: values.parcelId,
        type: values.type as never,
        // Correction: no toOwnerId sent — backend self-assigns to current owner
        ...(isCorrection ? {} : { toOwnerId: values.toOwnerId }),
        deedNumber: values.deedNumber || undefined,
        deedDate: values.deedDate || undefined,
        documentIds: values.documentIds,
        paymentMethod: values.paymentMethod as never,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      } as never,
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

        {/* Step 1 — Transfer details (type-aware) */}
        {step === 1 ? (
          <section className="space-y-5">
            {/* Transfer type selector */}
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
                          onClick={() => {
                            field.onChange(option.value);
                            // Reset type-specific fields when type changes
                            setValue("toOwnerId", "");
                            setValue("correctionReason", "");
                            setValue("heirRelationship", "");
                            setValue("partitionNote", "");
                            setToOwnerName("");
                          }}
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

            {/* ── CORRECTION: No owner picker; show correction reason ── */}
            {isCorrection ? (
              <div className="space-y-3">
                {/* Info banner */}
                <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <span>{t.pages.newMutation.correctionNote}</span>
                </div>
                {/* Correction reason textarea */}
                <div>
                  <label htmlFor="correctionReason" className="mb-1.5 block text-sm font-medium text-foreground">
                    {t.pages.newMutation.correctionReasonLabel}
                  </label>
                  <textarea
                    id="correctionReason"
                    rows={4}
                    placeholder={t.pages.newMutation.correctionReasonPlaceholder}
                    className={cn(
                      "w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      errors.correctionReason && "border-destructive ring-destructive/20",
                    )}
                    {...register("correctionReason")}
                  />
                  {errors.correctionReason ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-sm text-destructive">
                      <AlertCircle className="size-4" />
                      {errors.correctionReason.message}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* ── ALL OTHER TYPES: New owner picker ── */}
            {needsRecipient ? (
              <div className="space-y-3">
                <RecipientPicker
                  label={t.pages.newMutation.toOwnerLabel}
                  hint={
                    isInheritance
                      ? t.pages.newMutation.heirNote
                      : isPartition
                        ? t.pages.newMutation.partitionRecipientNote
                        : t.pages.newMutation.toOwnerHint
                  }
                  toOwnerId={toOwnerId ?? ""}
                  toOwnerName={toOwnerName}
                  error={errors.toOwnerId?.message}
                  onPick={(id, name) => {
                    setValue("toOwnerId", id, { shouldValidate: true });
                    setToOwnerName(name);
                  }}
                  onClear={() => {
                    setValue("toOwnerId", "", { shouldValidate: true });
                    setToOwnerName("");
                  }}
                />

                {/* Inheritance: heir relationship field */}
                {isInheritance ? (
                  <div>
                    <label htmlFor="heirRelationship" className="mb-1.5 block text-sm font-medium text-foreground">
                      {t.pages.newMutation.heirRelationshipLabel}
                    </label>
                    <Input
                      id="heirRelationship"
                      placeholder={t.pages.newMutation.heirRelationshipPlaceholder}
                      className={cn(errors.heirRelationship && "border-destructive")}
                      {...register("heirRelationship")}
                    />
                    {errors.heirRelationship ? (
                      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-destructive">
                        <AlertCircle className="size-4" />
                        {errors.heirRelationship.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* Partition: partition note field */}
                {isPartition ? (
                  <div>
                    <label htmlFor="partitionNote" className="mb-1.5 block text-sm font-medium text-foreground">
                      {t.pages.newMutation.partitionNoteLabel}{" "}
                      <span className="text-muted-foreground">({t.common.optional})</span>
                    </label>
                    <textarea
                      id="partitionNote"
                      rows={3}
                      placeholder={t.pages.newMutation.partitionNotePlaceholder}
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      {...register("partitionNote")}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* ── SALE / GIFT: Deed fields ── */}
            {needsDeed ? (
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
            ) : null}

            {/* ── DOCUMENTS ── */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-foreground">
                  Supporting Documents <span className="text-muted-foreground">({t.common.optional})</span>
                </label>
                <Button type="button" variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
                  <Upload className="mr-1.5 size-4" />
                  Upload New
                </Button>
              </div>
              <div className="space-y-2">
                {docsQ.isLoading ? (
                  <Skeleton className="h-14 w-full rounded-lg" />
                ) : documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No documents found for this parcel. Upload a document to attach it.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {documents.map((doc) => {
                      const isSelected = documentIds.includes(doc.id);
                      return (
                        <label
                          key={doc.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 transition-colors",
                            isSelected ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/50",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={isSelected}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...documentIds, doc.id]
                                : documentIds.filter((id) => id !== doc.id);
                              setValue("documentIds", next, { shouldValidate: true });
                            }}
                          />
                          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-md text-primary", isSelected ? "bg-primary/10" : "bg-secondary")}>
                            <FileText className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">{doc.fileName}</div>
                            <div className="text-xs text-muted-foreground">{t.domain.documentType[doc.type]}</div>
                          </div>
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-sm border",
                              isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                            )}
                          >
                            {isSelected ? <Check className="size-3.5" /> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
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

              {/* Type-specific review rows */}
              {isCorrection ? (
                <Row label={t.pages.newMutation.rowCurrentOwner}>
                  <span className="text-muted-foreground">{selectedParcel?.ownerName ?? t.common.notAvailable}</span>
                </Row>
              ) : (
                <Row label={t.pages.newMutation.rowToOwner}>{toOwnerName || t.pages.newMutation.notSpecified}</Row>
              )}

              {isInheritance && heirRelationship ? (
                <Row label={t.pages.newMutation.rowHeirRelationship}>{heirRelationship}</Row>
              ) : null}

              {isPartition && partitionNote ? (
                <Row label={t.pages.newMutation.rowPartitionNote}>{partitionNote}</Row>
              ) : null}

              {isCorrection && correctionReason ? (
                <Row label={t.pages.newMutation.rowCorrectionReason}>
                  <span className="text-pretty text-sm">{correctionReason}</span>
                </Row>
              ) : null}

              {needsDeed ? (
                <Row label={t.pages.newMutation.rowDeed}>
                  {deedNumber || deedDate
                    ? [deedNumber, deedDate ? f.date(deedDate) : null].filter(Boolean).join(" · ")
                    : t.pages.newMutation.notSpecified}
                </Row>
              ) : null}

              <Row label="Documents">
                {documentIds.length > 0
                  ? `${documentIds.length} document(s) attached`
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

      <UploadDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}

/**
 * Finds the new owner by email or phone rather than a typed name — the only
 * way an approved transfer can actually move Parcel.ownerId anywhere real.
 * See useSearchCitizens's own note on the minimum-length guard.
 */
function RecipientPicker({
  label,
  hint,
  toOwnerId,
  toOwnerName,
  error,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  toOwnerId: string;
  toOwnerName: string;
  error?: string;
  onPick: (id: string, name: string) => void;
  onClear: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const { data: results, isFetching } = useSearchCitizens(query);

  if (toOwnerId) {
    return (
      <div>
        <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-2.5 rounded-lg border border-primary bg-card p-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <UserRound className="size-4" />
          </span>
          <span className="flex-1 text-sm font-medium text-foreground">{toOwnerName}</span>
          <Button type="button" size="xs" variant="ghost" onClick={onClear}>
            <X className="size-3.5" />
            {t.pages.newMutation.changeRecipient}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="toOwner" className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="toOwner"
          className="pl-8"
          placeholder={t.pages.newMutation.toOwnerPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>

      {query.trim().length >= 4 ? (
        <div className="mt-2 space-y-1.5">
          {isFetching ? (
            <Skeleton className="h-11 rounded-lg" />
          ) : results && results.length > 0 ? (
            results.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => onPick(r.id, r.name)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card p-2.5 text-left transition-colors hover:bg-muted/50"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                  <UserRound className="size-3.5" />
                </span>
                <span className="text-sm font-medium text-foreground">{r.name}</span>
              </button>
            ))
          ) : (
            <p className="text-pretty text-sm text-muted-foreground">
              {t.pages.newMutation.toOwnerNoMatch}
            </p>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-4" />
          {error}
        </p>
      ) : null}
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
