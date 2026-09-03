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
  Landmark,
  Loader2,
  MapPin,
  MessageSquareWarning,
  Plus,
  Search,
} from "lucide-react";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useRole,
  useParcels,
  useIssueAcquisitionNotice,
  useFileAcquisitionObjection,
  useServiceApplications,
  useServiceApplicationDecision,
} from "@/hooks/queries";
import type { ServiceApplication } from "@/lib/types";

type AcquisitionDetails = {
  purpose?: string;
  awardAmount?: number;
  objectionText?: string;
};

const CLOSED_STATUSES = new Set(["approved", "rejected"]);

/** Built per locale — every message here is read by whoever is issuing. */
function makeNoticeSchema(t: Dictionary) {
  const pages: any = t.pages;
  return z
    .object({
      parcelId: z.string().min(1, pages.acquisition?.errors?.parcelRequired || "Required"),
      purpose: z.string().min(1, pages.acquisition?.errors?.purposeRequired || "Required"),
      awardAmount: z.string(),
    })
    .refine((d) => Number(d.awardAmount) > 0, {
      message: pages.acquisition?.errors?.awardAmountRequired || "Required",
      path: ["awardAmount"],
    });
}

type NoticeFormValues = z.infer<ReturnType<typeof makeNoticeSchema>>;

export default function AcquisitionPage() {
  const role = useRole();
  return role === "citizen" ? <CitizenAcquisition /> : <OfficerAcquisition />;
}

// --- Citizen -----------------------------------------------------------------

function ObjectionForm({ applicationId, onDone }: { applicationId: string; onDone: () => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const fileObjection = useFileAcquisitionObjection(applicationId);

  function submit() {
    if (!text.trim()) return;
    fileObjection.mutate(text.trim(), {
      onSuccess: () => {
        toast.success(t.pages.acquisition.objectionFiledTitle);
        onDone();
      },
      onError: () => toast.error(t.pages.acquisition.objectionFailedTitle),
    });
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground">
        {t.pages.acquisition.objectionLabel}
      </label>
      <Textarea
        rows={3}
        placeholder={t.pages.acquisition.objectionPlaceholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!text.trim() || fileObjection.isPending} onClick={submit}>
          {fileObjection.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {t.pages.acquisition.fileObjection}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  );
}

function MyNoticeCard({ application }: { application: ServiceApplication }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const [objecting, setObjecting] = useState(false);
  const details = application.details as AcquisitionDetails;
  const canObject = application.status === "under-review" && !details.objectionText;

  return (
    <Card className="gap-3 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip>{application.applicationNo}</IdChip>
            {details.purpose ? (
              <span className="text-sm text-muted-foreground">{details.purpose}</span>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {f.date(application.submittedAt ?? application.createdAt)}
            {details.awardAmount != null ? (
              <>
                {" · "}
                <span className="tabular">
                  {f.money({ amount: details.awardAmount, currency: "BDT" })}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <StatusMetaBadge meta={s.serviceApplication[application.status]} />
      </div>

      {application.status === "approved" ? (
        <div className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
          {t.pages.acquisition.awardedLabel}
          {details.awardAmount != null
            ? `: ${f.money({ amount: details.awardAmount, currency: "BDT" })}`
            : ""}
        </div>
      ) : application.status === "rejected" ? (
        <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
          {t.pages.acquisition.withdrawnLabel}
        </div>
      ) : null}

      {details.objectionText ? (
        <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MessageSquareWarning className="size-3.5" />
            {t.pages.acquisition.yourObjectionLabel}
          </div>
          <p className="text-pretty text-foreground">{details.objectionText}</p>
        </div>
      ) : canObject ? (
        objecting ? (
          <ObjectionForm applicationId={application.id} onDone={() => setObjecting(false)} />
        ) : (
          <Button size="sm" variant="outline" onClick={() => setObjecting(true)}>
            <MessageSquareWarning className="size-3.5" />
            {t.pages.acquisition.fileObjection}
          </Button>
        )
      ) : null}

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

function CitizenAcquisition() {
  const t = useT();
  const { data, isLoading } = useServiceApplications({
    scope: "mine",
    serviceType: "acquisition",
    pageSize: 50,
  });
  const applications = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.acquisition}
        description={t.pages.acquisition.description}
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={t.pages.acquisition.emptyTitle}
          description={t.pages.acquisition.emptyBody}
        />
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground">
            {t.pages.acquisition.myNoticesLabel}
          </div>
          {applications.map((a) => (
            <MyNoticeCard key={a.id} application={a} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Officer -------------------------------------------------------------

function IssueNoticeForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const schema = useMemo(() => makeNoticeSchema(t), [t]);
  const issue = useIssueAcquisitionNotice();
  const [parcelQuery, setParcelQuery] = useState("");
  const debouncedQuery = useDebouncedValue(parcelQuery);
  const parcelsQ = useParcels({ q: debouncedQuery, pageSize: 6 });
  const parcels = debouncedQuery ? (parcelsQ.data?.items ?? []) : [];

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<NoticeFormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: { parcelId: "", purpose: "", awardAmount: "" },
  });

  const parcelId = useWatch({ control, name: "parcelId" });
  const selectedParcel = parcels.find((p) => p.id === parcelId);

  function onSubmit(values: NoticeFormValues) {
    issue.mutate(
      { parcelId: values.parcelId, purpose: values.purpose, awardAmount: Number(values.awardAmount) },
      {
        onSuccess: (application) => {
          toast.success(t.pages.acquisition.issuedTitle, {
            description: t.pages.acquisition.issuedBody(application.applicationNo),
          });
          onDone();
        },
        onError: () =>
          toast.error(t.pages.acquisition.failedTitle, {
            description: t.pages.acquisition.failedBody,
          }),
      },
    );
  }

  return (
    <Card className="gap-4 px-5">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            {t.pages.acquisition.parcelSearchLabel}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={selectedParcel ? `${selectedParcel.dagNo} · ${selectedParcel.title}` : parcelQuery}
              onChange={(e) => {
                setValue("parcelId", "", { shouldValidate: true });
                setParcelQuery(e.target.value);
              }}
              placeholder={t.pages.acquisition.parcelSearchPlaceholder}
              className="pl-9"
            />
          </div>
          {debouncedQuery && !parcelId ? (
            <div className="grid gap-1.5">
              {parcelsQ.isLoading ? (
                <Skeleton className="h-11 rounded-lg" />
              ) : parcels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t.pages.acquisition.parcelSearchEmpty}
                </p>
              ) : (
                parcels.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => {
                      setValue("parcelId", p.id, { shouldValidate: true });
                      setParcelQuery("");
                    }}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                  >
                    <IdChip icon={MapPin}>{p.dagNo}</IdChip>
                    <span className="truncate text-muted-foreground">{p.title}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
          {errors.parcelId ? (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="size-4" />
              {errors.parcelId.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="purpose" className="mb-1.5 block text-sm font-medium text-foreground">
            {t.pages.acquisition.purposeLabel}
          </label>
          <Textarea
            id="purpose"
            rows={2}
            placeholder={t.pages.acquisition.purposePlaceholder}
            {...register("purpose")}
          />
          {errors.purpose ? (
            <p className="mt-1.5 text-sm text-destructive">{errors.purpose.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="awardAmount" className="mb-1.5 block text-sm font-medium text-foreground">
            {t.pages.acquisition.awardAmountLabel}
          </label>
          <Input
            id="awardAmount"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            className="w-40"
            {...register("awardAmount")}
          />
          {errors.awardAmount ? (
            <p className="mt-1.5 text-sm text-destructive">{errors.awardAmount.message}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={issue.isPending}>
            {issue.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t.pages.acquisition.issue}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={issue.isPending}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function OfficerNoticeCard({ application }: { application: ServiceApplication }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const decision = useServiceApplicationDecision(application.id);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const details = application.details as AcquisitionDetails;
  const decided = CLOSED_STATUSES.has(application.status);

  function submit(choice: "approve" | "reject") {
    setBusy(choice);
    decision.mutate(choice, {
      onSuccess: () => {
        setBusy(null);
        toast.success(
          choice === "approve" ? t.pages.acquisition.approvedTitle : t.pages.acquisition.rejectedTitle,
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
            {details.purpose ? (
              <span className="text-sm font-medium text-foreground">{details.purpose}</span>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {f.date(application.submittedAt ?? application.createdAt)}
            {details.awardAmount != null ? (
              <>
                {" · "}
                <span className="tabular">
                  {f.money({ amount: details.awardAmount, currency: "BDT" })}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <StatusMetaBadge meta={s.serviceApplication[application.status]} />
      </div>

      {details.objectionText ? (
        <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MessageSquareWarning className="size-3.5" />
            {t.pages.acquisition.objectionLabel}
          </div>
          <p className="text-pretty text-foreground">{details.objectionText}</p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        {decided ? (
          <>
            <span className="text-sm text-muted-foreground">{t.pages.acquisition.closed}</span>
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
              {t.pages.acquisition.approve}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={decision.isPending}
              onClick={() => submit("reject")}
            >
              {busy === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
              {t.pages.acquisition.reject}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function OfficerAcquisition() {
  const t = useT();
  const [issuing, setIssuing] = useState(false);
  const { data, isLoading } = useServiceApplications({ serviceType: "acquisition", pageSize: 50 });
  const applications = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.landOffice}
        title={t.nav.acquisition}
        description={t.pages.acquisition.officerDescription}
      >
        {issuing ? null : (
          <Button size="sm" onClick={() => setIssuing(true)}>
            <Plus className="size-4" />
            {t.pages.acquisition.newNotice}
          </Button>
        )}
      </PageHeader>

      {issuing ? <IssueNoticeForm onDone={() => setIssuing(false)} /> : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        issuing ? null : (
          <EmptyState
            icon={Landmark}
            title={t.pages.acquisition.queueEmptyTitle}
            description={t.pages.acquisition.queueEmptyBody}
          />
        )
      ) : (
        <div className="space-y-3">
          {applications.map((a) => (
            <OfficerNoticeCard key={a.id} application={a} />
          ))}
        </div>
      )}
    </div>
  );
}
