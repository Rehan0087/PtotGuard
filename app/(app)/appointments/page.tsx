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
  Loader2,
  MapPin,
  Plus,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { JurisdictionName, useJurisdictionName } from "@/components/jurisdiction-name";
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
  useJurisdictions,
  useBookAppointment,
  useRescheduleAppointment,
  useServiceApplications,
  useServiceApplicationDecision,
} from "@/hooks/queries";
import type { ServiceApplication } from "@/lib/types";

type AppointmentDetails = {
  officeJurisdictionId?: string;
  purpose?: string;
  preferredAt?: string;
  confirmedAt?: string;
};

const CLOSED_STATUSES = new Set(["approved", "rejected"]);

/** Built per locale — every message here is read by whoever is booking. */
function makeSchema(t: Dictionary) {
  return z.object({
    officeJurisdictionId: z.string().min(1, t.pages.appointments.errors.officeRequired),
    purpose: z.string().min(1, t.pages.appointments.errors.purposeRequired),
    preferredAt: z.string().min(1, t.pages.appointments.errors.preferredAtRequired),
    parcelId: z.string().optional(),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export default function AppointmentsPage() {
  const role = useRole();
  return role === "citizen" ? <CitizenAppointments /> : <OfficerAppointments />;
}

// --- Citizen -----------------------------------------------------------------

function BookForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const schema = useMemo(() => makeSchema(t), [t]);
  const { data: jurisdictions = [] } = useJurisdictions();
  const offices = jurisdictions.filter((j) => j.level === "upazila");
  const parcelsQ = useParcels({ owner: "me", pageSize: 100 });
  const parcels = parcelsQ.data?.items ?? [];
  const book = useBookAppointment();

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: { officeJurisdictionId: "", purpose: "", preferredAt: "", parcelId: "" },
  });

  const officeJurisdictionId = useWatch({ control, name: "officeJurisdictionId" });
  const parcelId = useWatch({ control, name: "parcelId" });

  function onSubmit(values: FormValues) {
    book.mutate(
      {
        officeJurisdictionId: values.officeJurisdictionId,
        purpose: values.purpose,
        preferredAt: new Date(values.preferredAt).toISOString(),
        parcelId: values.parcelId || undefined,
      },
      {
        onSuccess: (application) => {
          toast.success(t.pages.appointments.bookedTitle, {
            description: t.pages.appointments.bookedBody(application.applicationNo),
          });
          onDone();
        },
        onError: () =>
          toast.error(t.pages.appointments.failedTitle, {
            description: t.pages.appointments.failedBody,
          }),
      },
    );
  }

  return (
    <Card className="gap-4 px-5">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            {t.pages.appointments.officeLabel}
          </label>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {offices.map((office) => {
              const active = officeJurisdictionId === office.id;
              return (
                <button
                  type="button"
                  key={office.id}
                  onClick={() => setValue("officeJurisdictionId", office.id, { shouldValidate: true })}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors",
                    active ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/50",
                  )}
                >
                  <JurisdictionName jurisdiction={office} className="text-foreground" />
                  {active ? <Check className="ml-auto size-4 shrink-0 text-primary" /> : null}
                </button>
              );
            })}
          </div>
          {errors.officeJurisdictionId ? (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="size-4" />
              {errors.officeJurisdictionId.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="purpose" className="mb-1.5 block text-sm font-medium text-foreground">
            {t.pages.appointments.purposeLabel}
          </label>
          <Textarea
            id="purpose"
            rows={3}
            placeholder={t.pages.appointments.purposePlaceholder}
            {...register("purpose")}
          />
          {errors.purpose ? (
            <p className="mt-1.5 text-sm text-destructive">{errors.purpose.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="preferredAt" className="mb-1.5 block text-sm font-medium text-foreground">
            {t.pages.appointments.preferredAtLabel}
          </label>
          <Input id="preferredAt" type="datetime-local" className="w-64" {...register("preferredAt")} />
          {errors.preferredAt ? (
            <p className="mt-1.5 text-sm text-destructive">{errors.preferredAt.message}</p>
          ) : null}
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <label className="block text-sm font-medium text-foreground">
            {t.pages.appointments.parcelLabel}
          </label>
          <p className="text-xs text-muted-foreground">{t.pages.appointments.parcelOptionalHint}</p>
          {parcelsQ.isLoading ? (
            <Skeleton className="h-11 rounded-lg" />
          ) : (
            <div className="grid gap-1.5">
              <button
                type="button"
                onClick={() => setValue("parcelId", "")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm text-muted-foreground transition-colors",
                  !parcelId ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/50",
                )}
              >
                {t.pages.appointments.parcelNone}
              </button>
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
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={book.isPending}>
            {book.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t.pages.appointments.book}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={book.isPending}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MyAppointmentCard({ application }: { application: ServiceApplication }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const jName = useJurisdictionName();
  const { data: jurisdictions = [] } = useJurisdictions();
  const details = application.details as AppointmentDetails;
  const office = jurisdictions.find((j) => j.id === details.officeJurisdictionId);
  const decided = CLOSED_STATUSES.has(application.status);

  const timeLabel = decided
    ? application.status === "approved"
      ? t.pages.appointments.confirmedLabel(f.dateTime(details.confirmedAt ?? details.preferredAt ?? ""))
      : t.pages.appointments.declinedLabel
    : details.confirmedAt
      ? t.pages.appointments.proposedLabel(f.dateTime(details.confirmedAt))
      : t.pages.appointments.requestedLabel(f.dateTime(details.preferredAt ?? ""));

  return (
    <Card className="gap-3 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip>{application.applicationNo}</IdChip>
            {office ? <span className="text-sm text-muted-foreground">{jName(office)}</span> : null}
          </div>
          {details.purpose ? <p className="text-pretty text-sm text-foreground">{details.purpose}</p> : null}
          <div className="text-xs text-muted-foreground">{timeLabel}</div>
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

function CitizenAppointments() {
  const t = useT();
  const [booking, setBooking] = useState(false);
  const { data, isLoading } = useServiceApplications({
    scope: "mine",
    serviceType: "appointment",
    pageSize: 50,
  });
  const applications = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.appointments}
        description={t.pages.appointments.description}
      >
        {booking ? null : (
          <Button size="sm" onClick={() => setBooking(true)}>
            <Plus className="size-4" />
            {t.pages.appointments.newAppointment}
          </Button>
        )}
      </PageHeader>

      {booking ? <BookForm onDone={() => setBooking(false)} /> : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        booking ? null : (
          <EmptyState
            icon={CalendarClock}
            title={t.pages.appointments.emptyTitle}
            description={t.pages.appointments.emptyBody}
          />
        )
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-medium text-foreground">{t.pages.appointments.myAppointmentsLabel}</div>
          {applications.map((a) => (
            <MyAppointmentCard key={a.id} application={a} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Officer -------------------------------------------------------------

function QueueCard({ application }: { application: ServiceApplication }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const jName = useJurisdictionName();
  const { data: jurisdictions = [] } = useJurisdictions();
  const decision = useServiceApplicationDecision(application.id);
  const reschedule = useRescheduleAppointment(application.id);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [when, setWhen] = useState("");
  const details = application.details as AppointmentDetails;
  const office = jurisdictions.find((j) => j.id === details.officeJurisdictionId);
  const decided = CLOSED_STATUSES.has(application.status);

  const timeLabel = decided
    ? application.status === "approved"
      ? t.pages.appointments.confirmedLabel(f.dateTime(details.confirmedAt ?? details.preferredAt ?? ""))
      : t.pages.appointments.declinedLabel
    : details.confirmedAt
      ? t.pages.appointments.proposedLabel(f.dateTime(details.confirmedAt))
      : t.pages.appointments.requestedLabel(f.dateTime(details.preferredAt ?? ""));

  function submit(choice: "approve" | "reject") {
    setBusy(choice);
    decision.mutate(choice, {
      onSuccess: () => {
        setBusy(null);
        toast.success(
          choice === "approve" ? t.pages.appointments.confirmedTitle : t.pages.appointments.declinedTitle,
        );
      },
      onError: () => setBusy(null),
    });
  }

  function confirmReschedule() {
    if (!when) return;
    reschedule.mutate(new Date(when).toISOString(), {
      onSuccess: () => setRescheduling(false),
    });
  }

  return (
    <Card className="gap-3 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip>{application.applicationNo}</IdChip>
            {office ? <span className="text-sm font-medium text-foreground">{jName(office)}</span> : null}
          </div>
          {details.purpose ? <p className="text-pretty text-sm text-foreground">{details.purpose}</p> : null}
          <div className="text-xs text-muted-foreground">{timeLabel}</div>
        </div>
        <StatusMetaBadge meta={s.serviceApplication[application.status]} />
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        {decided ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t.pages.appointments.closed}</span>
            {application.parcelId ? (
              <Link
                href={`/parcels/${application.parcelId}`}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                {t.pages.landTax.viewParcel}
              </Link>
            ) : null}
          </div>
        ) : rescheduling ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label htmlFor={`when-${application.id}`} className="block text-xs text-muted-foreground">
                {t.pages.appointments.rescheduleDateLabel}
              </label>
              <Input
                id={`when-${application.id}`}
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="w-56"
              />
            </div>
            <Button size="sm" disabled={!when || reschedule.isPending} onClick={confirmReschedule}>
              {reschedule.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t.pages.appointments.confirmReschedule}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRescheduling(false)}>
              {t.common.cancel}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={decision.isPending} onClick={() => submit("approve")}>
              {busy === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {t.pages.appointments.confirm}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={decision.isPending}
              onClick={() => submit("reject")}
            >
              {busy === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
              {t.pages.appointments.decline}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => setRescheduling(true)}
            >
              <CalendarClock className="size-3.5" />
              {t.pages.appointments.reschedule}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function OfficerAppointments() {
  const t = useT();
  const { data, isLoading } = useServiceApplications({ serviceType: "appointment", pageSize: 50 });
  const applications = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.landOffice}
        title={t.nav.appointments}
        description={t.pages.appointments.officerDescription}
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
          title={t.pages.appointments.queueEmptyTitle}
          description={t.pages.appointments.queueEmptyBody}
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
