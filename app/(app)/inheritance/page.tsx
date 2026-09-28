"use client";

import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { AlertCircle, ArrowLeft, ArrowRight, Check, MapPin, Minus, Plus, Scale } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SurveyCorners } from "@/components/survey-corners";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";
import { useCalculateInheritance, useParcels, useSession } from "@/hooks/queries";
import type { HeirRelation } from "@/lib/types";

const HEIRS = [
  { key: "husband", max: 1 },
  { key: "wife", max: 4 },
  { key: "son", max: 20 },
  { key: "daughter", max: 20 },
  { key: "father", max: 1 },
  { key: "mother", max: 1 },
] as const;

function makeSchema(t: Dictionary) {
  return z
    .object({
      method: z.literal("faraiz"),
      husband: z.number().int().min(0).max(1),
      wife: z.number().int().min(0).max(4),
      son: z.number().int().min(0).max(20),
      daughter: z.number().int().min(0).max(20),
      father: z.number().int().min(0).max(1),
      mother: z.number().int().min(0).max(1),
    })
    .refine((d) => !(d.husband > 0 && d.wife > 0), {
      message: t.pages.inheritance.errors.spouseBoth,
      path: ["wife"],
    })
    .refine((d) => d.husband + d.wife + d.son + d.daughter + d.father + d.mother > 0, {
      message: t.pages.inheritance.errors.noHeirs,
      path: ["method"],
    });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

function Stepper({ label, hint, value, onChange, max }: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  max: number;
}) {
  const t = useT();
  const f = useFmt();
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon-sm" disabled={value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))} aria-label={t.pages.inheritance.decrease(label)}>
          <Minus />
        </Button>
        <span className="w-7 text-center text-sm font-medium tabular-nums">{f.number(value)}</span>
        <Button type="button" variant="outline" size="icon-sm" disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))} aria-label={t.pages.inheritance.increase(label)}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}

export default function InheritancePage() {
  const t = useT();
  const f = useFmt();
  const session = useSession();
  const parcels = useParcels({ owner: "me", pageSize: 100 });
  const calc = useCalculateInheritance();
  const [step, setStep] = useState<"land" | "heirs">("land");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const schema = useMemo(() => makeSchema(t), [t]);
  const { control, handleSubmit, resetField, formState: { errors } } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: { method: "faraiz", husband: 0, wife: 0, son: 0, daughter: 0, father: 0, mother: 0 },
  });

  const ownedParcels = parcels.data?.items ?? [];
  const selectedParcels = ownedParcels.filter((parcel) => selectedIds.includes(parcel.id));
  const selectedValue = selectedParcels.reduce((total, parcel) => total + (parcel.marketValue?.amount ?? 0), 0);
  const gender = session.data?.user.profileDetails?.gender?.toLowerCase();
  const visibleHeirs = HEIRS.filter((heir) => {
    if (gender === "female") return heir.key !== "wife";
    if (gender === "male") return heir.key !== "husband";
    return true;
  });

  function toggleParcel(parcelId: string) {
    setSelectedIds((current) => current.includes(parcelId)
      ? current.filter((id) => id !== parcelId)
      : [...current, parcelId]);
    calc.reset();
  }

  function continueToHeirs() {
    if (gender === "female") resetField("wife", { defaultValue: 0 });
    if (gender === "male") resetField("husband", { defaultValue: 0 });
    setStep("heirs");
  }

  function onSubmit(values: FormValues) {
    const heirs = visibleHeirs
      .map((heir) => ({ relation: heir.key as HeirRelation, count: values[heir.key] }))
      .filter((heir) => heir.count > 0);
    calc.mutate({ method: "faraiz", parcelIds: selectedIds, heirs });
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.nav.portals.citizen} title={t.pages.inheritance.title}
        description={t.pages.inheritance.description} />

      {step === "land" ? (
        <Card className="relative px-5">
          <SurveyCorners />
          <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-start">
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">{t.pages.inheritance.selectLandTitle}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.pages.inheritance.selectLandDescription}</p>
            </div>
            {ownedParcels.length > 0 ? (
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" variant="outline"
                  onClick={() => { setSelectedIds(ownedParcels.map((parcel) => parcel.id)); calc.reset(); }}>
                  {t.pages.inheritance.selectAll}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={selectedIds.length === 0}
                  onClick={() => { setSelectedIds([]); calc.reset(); }}>
                  {t.pages.inheritance.clearSelection}
                </Button>
              </div>
            ) : null}
          </div>

          {parcels.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-32 rounded-xl" />)}
            </div>
          ) : ownedParcels.length === 0 ? (
            <EmptyState icon={MapPin} title={t.pages.inheritance.noLandTitle}
              description={t.pages.inheritance.noLandDescription} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {ownedParcels.map((parcel) => {
                const selected = selectedIds.includes(parcel.id);
                return (
                  <button key={parcel.id} type="button" aria-pressed={selected} onClick={() => toggleParcel(parcel.id)}
                    className={cn(
                      "relative rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50",
                    )}>
                    <span className={cn(
                      "absolute right-3 top-3 flex size-5 items-center justify-center rounded-full border",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                    )}>
                      {selected ? <Check className="size-3.5" /> : null}
                    </span>
                    <div className="pr-8 font-heading font-semibold text-foreground">{parcel.title}</div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{t.pages.inheritance.dag}: {parcel.dagNo}</span>
                      <span>{t.pages.inheritance.khatian}: {parcel.khatianNo}</span>
                      <span>{f.area(parcel.area)}</span>
                      <span>{t.domain.landUse[parcel.landUse]}</span>
                    </div>
                    <div className="mt-3 border-t border-border pt-2 text-sm font-medium text-foreground">
                      {t.pages.inheritance.marketValue}: {parcel.marketValue ? f.money(parcel.marketValue) : t.common.notAvailable}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {ownedParcels.length > 0 ? (
            <div className="flex flex-col justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
              <div className="text-sm text-muted-foreground">
                {t.pages.inheritance.selectedLand(selectedIds.length)}
                {selectedIds.length > 0 ? (
                  <span className="ml-2 font-medium text-foreground">· {f.money({ amount: selectedValue, currency: "BDT" })}</span>
                ) : null}
              </div>
              <Button
                type="button"
                disabled={selectedIds.length === 0 || session.isLoading}
                onClick={continueToHeirs}
              >
                {t.pages.inheritance.continueToHeirs}<ArrowRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </Card>
      ) : (
        <>
          <Card className="relative px-5">
            <SurveyCorners />
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.pages.inheritance.selectedEstate}</div>
                <div className="mt-1 font-heading text-base font-semibold text-foreground">
                  {t.pages.inheritance.selectedLand(selectedIds.length)} · {f.money({ amount: selectedValue, currency: "BDT" })}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{selectedParcels.map((parcel) => parcel.dagNo).join(" · ")}</div>
              </div>
              <Button type="button" variant="outline" onClick={() => { calc.reset(); setStep("land"); }}>
                <ArrowLeft className="size-4" />{t.pages.inheritance.changeLand}
              </Button>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-5">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 lg:col-span-2">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-foreground">{t.pages.inheritance.survivingHeirs}</span>
                <div className="grid gap-2">
                  {visibleHeirs.map((heir) => (
                    <Controller key={heir.key} name={heir.key} control={control} render={({ field }) => (
                      <Stepper label={t.pages.inheritance.heirs[heir.key].label}
                        hint={t.pages.inheritance.heirs[heir.key].hint} value={field.value}
                        onChange={(value) => { field.onChange(value); calc.reset(); }} max={heir.max} />
                    )} />
                  ))}
                </div>
                {(errors.wife?.message || errors.method?.message) ? (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
                    <AlertCircle className="size-4" />{errors.wife?.message ?? errors.method?.message}
                  </p>
                ) : null}
              </div>

              <Button type="submit" disabled={calc.isPending || selectedIds.length === 0}>
                <Scale className="size-4" />{t.pages.inheritance.calculate}
              </Button>
              {calc.isError ? (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="size-4" />{t.pages.inheritance.calculateFailed}
                </p>
              ) : null}
            </form>

            <div className="lg:col-span-3">
              <Card className="relative min-h-full gap-4 px-5">
                <SurveyCorners />
                <div className="flex items-baseline justify-between">
                  <h2 className="font-heading text-base font-semibold text-foreground">{t.pages.inheritance.distribution}</h2>
                  {calc.data ? <span className="text-xs uppercase tracking-wide text-marker">{t.domain.successionMethod[calc.data.method]}</span> : null}
                </div>
                {calc.isPending ? (
                  <div className="space-y-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-12 rounded-lg" />)}</div>
                ) : calc.data ? (
                  <>
                    <ul className="space-y-2.5">
                      {calc.data.shares.map((share) => (
                        <li key={share.relation} className="space-y-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-medium text-foreground">
                              {t.domain.heirRelation[share.relation]}
                              {share.count > 1 ? <span className="text-muted-foreground">{t.pages.inheritance.times(share.count)}</span> : null}
                            </span>
                            <span className="flex items-baseline gap-2">
                              <span className="font-heading text-base font-semibold tabular-nums text-foreground">{f.digits(share.fraction)}</span>
                              {share.amount != null ? <span className="tabular text-xs text-muted-foreground">{f.money({ amount: share.amount, currency: "BDT" })}</span> : null}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(share.totalShare * 100)}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="border-t border-border pt-3">
                      {calc.data.notes.map((note) => <p key={note} className="text-xs text-muted-foreground">{t.pages.inheritance.notes[note]}</p>)}
                    </div>
                  </>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">{t.pages.inheritance.emptyResult}</p>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
