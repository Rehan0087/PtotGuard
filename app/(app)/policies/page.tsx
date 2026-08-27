"use client";

import { useState } from "react";
import { useForm, Controller, type Control, type FieldPath } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePolicies, useUpdatePolicies } from "@/hooks/queries";
import { useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";
import type { LandUse } from "@/lib/types";

const LAND_USES: LandUse[] = ["agricultural", "residential", "commercial", "industrial", "mixed", "vacant"];

function makeSchema(t: Dictionary) {
  const landUseRate = z.object(
    Object.fromEntries(LAND_USES.map((u) => [u, z.number().min(0, t.common.required)])) as Record<
      (typeof LAND_USES)[number],
      z.ZodNumber
    >,
  );
  return z.object({
    mutationFeeBdt: z.number().int().min(0, t.common.required),
    objectionWindowDays: z.number().int().min(1, t.common.required),
    fraudScoreThreshold: z.number().min(0).max(1, t.common.required),
    landTaxRatePerDecimalBdt: landUseRate,
    landTaxAgriculturalExemptionDecimals: z.number().int().min(0, t.common.required),
    landTaxArrearSurchargePercent: z.number().min(0).max(100, t.common.required),
    landTaxMaxArrearYears: z.number().int().min(0, t.common.required),
    landAdminCertifiedCopyFeeBdt: z.number().int().min(0, t.common.required),
    landAdminCorrectionFeeBdt: z.number().int().min(0, t.common.required),
    revenueCaseFilingFeeBdt: z.number().int().min(0, t.common.required),
    leaseSettlementAgriculturalFeeBdt: z.number().int().min(0, t.common.required),
    leaseSettlementNonAgriculturalFeeBdt: z.number().int().min(0, t.common.required),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

/** One labelled BDT/number input, bound to a (possibly nested) form field. */
function NumberField({
  control,
  name,
  label,
  hint,
  suffix,
  step,
  className,
}: {
  control: Control<FormValues>;
  name: FieldPath<FormValues>;
  label: string;
  hint?: string;
  suffix?: string;
  step?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-sm font-medium text-foreground">{label}</label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <Controller
          name={name}
          control={control}
          render={({ field }) => (
            <Input
              type="number"
              inputMode={step ? "decimal" : "numeric"}
              step={step}
              value={field.value as number}
              onChange={(e) => field.onChange(Number(e.target.value))}
              className="w-28"
            />
          )}
        />
        {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
    </div>
  );
}

export default function PoliciesPage() {
  const t = useT();
  const p = t.pages.policies;
  const schema = makeSchema(t);
  const { data: policies, isLoading } = usePolicies();
  const updatePolicies = useUpdatePolicies();
  const [saved, setSaved] = useState(false);

  const { control, handleSubmit } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      mutationFeeBdt: 0,
      objectionWindowDays: 1,
      fraudScoreThreshold: 0,
      landTaxRatePerDecimalBdt: Object.fromEntries(LAND_USES.map((u) => [u, 0])) as Record<
        (typeof LAND_USES)[number],
        number
      >,
      landTaxAgriculturalExemptionDecimals: 0,
      landTaxArrearSurchargePercent: 0,
      landTaxMaxArrearYears: 0,
      landAdminCertifiedCopyFeeBdt: 0,
      landAdminCorrectionFeeBdt: 0,
      revenueCaseFilingFeeBdt: 0,
      leaseSettlementAgriculturalFeeBdt: 0,
      leaseSettlementNonAgriculturalFeeBdt: 0,
    },
    values: policies,
  });

  const onSubmit = async (data: FormValues) => {
    await updatePolicies.mutateAsync(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.nav.portals.administration}
          title={t.nav.policies}
          description={p.description}
        />
        <div className="space-y-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.administration}
        title={t.nav.policies}
        description={p.description}
      />

      {saved && (
        <Alert className="border-green-500/50 bg-green-50 text-green-900 dark:bg-green-950/50 dark:text-green-100">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{p.saved}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        <Card className="gap-4 p-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">{p.mutationSection}</h2>
          <div className="space-y-4">
            <NumberField control={control} name="mutationFeeBdt" label={p.mutationFee} hint={p.mutationFeeHint} suffix="BDT" />
            <NumberField
              control={control}
              name="objectionWindowDays"
              label={p.objectionWindow}
              hint={p.objectionWindowHint}
              suffix={p.days}
            />
          </div>
        </Card>

        <Card className="gap-4 p-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">{p.fraudSection}</h2>
          <NumberField
            control={control}
            name="fraudScoreThreshold"
            label={p.fraudThreshold}
            hint={p.fraudThresholdHint}
            step="0.01"
          />
        </Card>

        <Card className="gap-4 p-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">{p.landTaxSection}</h2>
          <div>
            <label className="text-sm font-medium text-foreground">{p.landTaxRateLabel}</label>
            <p className="text-xs text-muted-foreground">{p.landTaxRateHint}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {LAND_USES.map((use) => (
                <div key={use} className="flex items-center gap-2">
                  <Controller
                    name={`landTaxRatePerDecimalBdt.${use}`}
                    control={control}
                    render={({ field }) => (
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={field.value as number}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="w-20"
                      />
                    )}
                  />
                  <span className="text-sm text-muted-foreground">{t.domain.landUse[use]}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              control={control}
              name="landTaxAgriculturalExemptionDecimals"
              label={p.landTaxExemption}
              hint={p.landTaxExemptionHint}
            />
            <NumberField
              control={control}
              name="landTaxArrearSurchargePercent"
              label={p.landTaxSurcharge}
              hint={p.landTaxSurchargeHint}
              suffix="%"
              step="0.1"
            />
            <NumberField
              control={control}
              name="landTaxMaxArrearYears"
              label={p.landTaxMaxArrearYears}
              hint={p.landTaxMaxArrearYearsHint}
              suffix={p.years}
            />
          </div>
        </Card>

        <Card className="gap-4 p-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">{p.landAdminSection}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              control={control}
              name="landAdminCertifiedCopyFeeBdt"
              label={p.landAdminCertifiedCopyFee}
              suffix="BDT"
            />
            <NumberField
              control={control}
              name="landAdminCorrectionFeeBdt"
              label={p.landAdminCorrectionFee}
              suffix="BDT"
            />
          </div>
        </Card>

        <Card className="gap-4 p-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">{p.revenueCaseSection}</h2>
          <NumberField
            control={control}
            name="revenueCaseFilingFeeBdt"
            label={p.revenueCaseFilingFee}
            hint={p.revenueCaseFilingFeeHint}
            suffix="BDT"
          />
        </Card>

        <Card className="gap-4 p-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">{p.leaseSettlementSection}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              control={control}
              name="leaseSettlementAgriculturalFeeBdt"
              label={p.leaseSettlementAgriculturalFee}
              suffix="BDT"
            />
            <NumberField
              control={control}
              name="leaseSettlementNonAgriculturalFeeBdt"
              label={p.leaseSettlementNonAgriculturalFee}
              suffix="BDT"
            />
          </div>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={updatePolicies.isPending}>
          {updatePolicies.isPending ? t.common.saving : t.common.save}
        </Button>
      </div>
    </form>
  );
}
