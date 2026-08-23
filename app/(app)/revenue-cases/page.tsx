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
  CalendarClock,
  Check,
  CreditCard,
  FileStack,
  Gavel,
  Loader2,
  MapPin,
  Plus,
  Scale,
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
  useFileRevenueCase,
  useScheduleHearing,
  useServiceApplications,
  useServiceApplicationDecision,
} from "@/hooks/queries";
import type { PaymentMethod, ServiceApplication } from "@/lib/types";

type CaseType = "miscellaneous" | "appeal";

const CASE_TYPES: { value: CaseType; icon: LucideIcon }[] = [
  { value: "miscellaneous", icon: FileStack },
  { value: "appeal", icon: Gavel },
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
      parcelId: z.string().min(1, t.pages.revenueCases.errors.parcelRequired),
      caseType: z.enum(["miscellaneous", "appeal"]),
      grounds: z.string().min(1, t.pages.revenueCases.errors.groundsRequired),
      againstReference: z.string().optional(),
      paymentMethod: z.enum(["bkash", "nagad", "card"]),
    })
    .refine((d) => d.caseType !== "appeal" || Boolean(d.againstReference?.trim()), {
      message: t.pages.revenueCases.errors.againstReferenceRequired,
      path: ["againstReference"],
    });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export default function RevenueCasesPage() {
  const role = useRole();
  return role === "citizen" ? <CitizenRevenueCases /> : <OfficerRevenueCases />;
}

// --- Citizen -----------------------------------------------------------------

function FileCaseForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const f = useFmt();
  const schema = useMemo(() => makeSchema(t), [t]);
  const parcelsQ = useParcels({ owner: "me", pageSize: 100 });
  const parcels = parcelsQ.data?.items ?? [];
  const { data: policy } = usePolicies();
  const file = useFileRevenueCase();

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
      caseType: "miscellaneous",
      grounds: "",
      againstReference: "",
      paymentMethod: "bkash",
    },
  });

  // useWatch (vs watch()) keeps the component React-Compiler friendly.
  const parcelId = useWatch({ control, name: "parcelId" });
  const caseType = useWatch({ control, name: "caseType" });
  const paymentMethod = useWatch({ control, name: "paymentMethod" });

  const fee = policy ? { amount: policy.revenueCaseFilingFeeBdt, currency: "BDT" as const } : null;

  function onSubmit(values: FormValues) {
    file.mutate(
      {
        parcelId: values.parcelId,
        caseType: values.caseType,
        grounds: values.grounds,
        againstReference: values.caseType === "appeal" ? values.againstReference : undefined,
        paymentMethod: values.paymentMethod,
      },
      {
        onSuccess: (application) => {
          toast.success(t.pages.revenueCases.filedTitle, {
            description: t.pages.revenueCases.filedBody(application.applicationNo),
          });
          onDone();
        },
        onError: () =>
          toast.error(t.pages.revenueCases.failedTitle, {
            description: t.pages.revenueCases.failedBody,
          }),
      },
    );
  }

  return (
    <Card className="gap-4 px-5">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {CASE_TYPES.map((option) => {
            const Icon = option.icon;
            const active = caseType === option.value;
            return (
              <button
                type="button"
                key={option.value}
                onClick={() => setValue("caseType", option.value, { shouldValidate: true })}
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
                    {t.pages.revenueCases.caseType[option.value]}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t.pages.revenueCases.caseType[option.value === "miscellaneous" ? "miscellaneousBlurb" : "appealBlurb"]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            {t.pages.revenueCases.parcelLabel}
          </label>
          {parcelsQ.isLoading ? (
            <Skeleton className="h-11 rounded-lg" />
          ) : parcels.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.pages.revenueCases.parcelPlaceholder}</p>
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

        {caseType === "appeal" ? (
          <div>
            <label
              htmlFor="againstReference"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              {t.pages.revenueCases.againstReferenceLabel}
            </label>
            <Input
              id="againstReference"
              placeholder={t.pages.revenueCases.againstReferencePlaceholder}
              {...register("againstReference")}
            />
            {errors.againstReference ? (
              <p className="mt-1.5 text-sm text-destructive">{errors.againstReference.message}</p>
            ) : null}
          </div>
        ) : null}

        <div>
          <label htmlFor="grounds" className="mb-1.5 block text-sm font-medium text-foreground">
            {t.pages.revenueCases.groundsLabel}
          </label>
          <Textarea
            id="grounds"
            rows={4}
            placeholder={t.pages.revenueCases.groundsPlaceholder}
            {...register("grounds")}
          />
          {errors.grounds ? (
            <p className="mt-1.5 text-sm text-destructive">{errors.grounds.message}</p>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t.pages.revenueCases.feeLabel}</span>
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
                    {t.pages.revenueCases.paymentMethods[option.value]}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{t.pages.revenueCases.paymentNote}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={file.isPending}>
            {file.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {fee ? t.pages.revenueCases.confirmPay(f.money(fee)) : t.pages.revenueCases.pay}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={file.isPending}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

type CaseDetails = {
  caseType?: CaseType;
  grounds?: string;
  againstReference?: string;
  hearingAt?: string;
};

function MyRevenueCaseCard({ application }: { application: ServiceApplication }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const details = application.details as CaseDetails;
  const isAppeal = details.caseType === "appeal";

  return (
    <Card className="gap-3 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip>{application.applicationNo}</IdChip>
            <span className="text-sm text-muted-foreground">
              {t.pages.revenueCases.caseType[isAppeal ? "appeal" : "miscellaneous"]}
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
          {details.hearingAt ? (
            <div className="text-xs text-disputed">
              {t.pages.revenueCases.hearingAtLabel(f.dateTime(details.hearingAt))}
            </div>
          ) : null}
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

function CitizenRevenueCases() {
  const t = useT();
  const [filing, setFiling] = useState(false);
  const { data, isLoading } = useServiceApplications({
    scope: "mine",
    serviceType: "revenue-case",
    pageSize: 50,
  });
  const applications = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.revenueCases}
        description={t.pages.revenueCases.description}
      >
        {filing ? null : (
          <Button size="sm" onClick={() => setFiling(true)}>
            <Plus className="size-4" />
            {t.pages.revenueCases.newCase}
          </Button>
        )}
      </PageHeader>

      {filing ? <FileCaseForm onDone={() => setFiling(false)} /> : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        filing ? null : (
          <EmptyState
            icon={Scale}
            title={t.pages.revenueCases.emptyTitle}
            description={t.pages.revenueCases.emptyBody}
          />
        )
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground">{t.pages.revenueCases.myCasesLabel}</div>
          {applications.map((a) => (
            <MyRevenueCaseCard key={a.id} application={a} />
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
  const scheduleHearing = useScheduleHearing(application.id);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState("");
  const details = application.details as CaseDetails;
  const isAppeal = details.caseType === "appeal";
  const decided = CLOSED_STATUSES.has(application.status);

  function submit(choice: "approve" | "reject") {
    setBusy(choice);
    decision.mutate(choice, {
      onSuccess: () => {
        setBusy(null);
        toast.success(
          choice === "approve" ? t.pages.revenueCases.approvedTitle : t.pages.revenueCases.rejectedTitle,
        );
      },
      onError: () => setBusy(null),
    });
  }

  function confirmSchedule() {
    if (!when) return;
    scheduleHearing.mutate(new Date(when).toISOString(), {
      onSuccess: () => setScheduling(false),
    });
  }

  return (
    <Card className="gap-3 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip>{application.applicationNo}</IdChip>
            <span className="text-sm font-medium text-foreground">
              {t.pages.revenueCases.caseType[isAppeal ? "appeal" : "miscellaneous"]}
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
          {details.hearingAt ? (
            <div className="text-xs text-disputed">
              {t.pages.revenueCases.hearingAtLabel(f.dateTime(details.hearingAt))}
            </div>
          ) : null}
        </div>
        <StatusMetaBadge meta={s.serviceApplication[application.status]} />
      </div>

      <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
        {isAppeal && details.againstReference ? (
          <div>
            <span className="text-muted-foreground">{t.pages.revenueCases.againstReferenceLabel} </span>
            <span className="text-foreground">{details.againstReference}</span>
          </div>
        ) : null}
        {details.grounds ? <p className="text-pretty text-foreground">{details.grounds}</p> : null}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        {decided ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t.pages.revenueCases.closed}</span>
            {application.parcelId ? (
              <Link
                href={`/parcels/${application.parcelId}`}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                {t.pages.landTax.viewParcel}
              </Link>
            ) : null}
          </div>
        ) : scheduling ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label htmlFor={`when-${application.id}`} className="block text-xs text-muted-foreground">
                {t.pages.revenueCases.hearingDateLabel}
              </label>
              <Input
                id={`when-${application.id}`}
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="w-56"
              />
            </div>
            <Button size="sm" disabled={!when || scheduleHearing.isPending} onClick={confirmSchedule}>
              {scheduleHearing.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t.pages.revenueCases.confirmScheduleHearing}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setScheduling(false)}>
              {t.common.cancel}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={decision.isPending} onClick={() => submit("approve")}>
              {busy === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {t.pages.revenueCases.approve}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={decision.isPending}
              onClick={() => submit("reject")}
            >
              {busy === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
              {t.pages.revenueCases.reject}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => setScheduling(true)}
            >
              <CalendarClock className="size-3.5" />
              {t.pages.revenueCases.scheduleHearing}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function OfficerRevenueCases() {
  const t = useT();
  const { data, isLoading } = useServiceApplications({ serviceType: "revenue-case", pageSize: 50 });
  const applications = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.landOffice}
        title={t.nav.revenueCases}
        description={t.pages.revenueCases.queueTitle}
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
          title={t.pages.revenueCases.queueEmptyTitle}
          description={t.pages.revenueCases.queueEmptyBody}
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
