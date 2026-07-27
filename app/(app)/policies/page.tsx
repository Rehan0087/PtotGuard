"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
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

function makeSchema(t: Dictionary) {
  return z.object({
    mutationFeeBdt: z.number().int().min(0, t.common.required),
    objectionWindowDays: z.number().int().min(1, t.common.required),
    fraudScoreThreshold: z.number().min(0).max(1, t.common.required),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export default function PoliciesPage() {
  const t = useT();
  const schema = makeSchema(t);
  const { data: policies, isLoading } = usePolicies();
  const updatePolicies = useUpdatePolicies();
  const [saved, setSaved] = useState(false);

  const { control, handleSubmit } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: { mutationFeeBdt: 0, objectionWindowDays: 1, fraudScoreThreshold: 0 },
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
          description={t.pages.policies.description}
        />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
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
        description={t.pages.policies.description}
      />

      {saved && (
        <Alert className="border-green-500/50 bg-green-50 text-green-900 dark:bg-green-950/50 dark:text-green-100">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{t.pages.policies.saved}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">
                {t.pages.policies.mutationFee}
              </label>
              <p className="text-xs text-muted-foreground">{t.pages.policies.mutationFeeHint}</p>
              <div className="mt-2 flex items-center gap-2">
                <Controller
                  name="mutationFeeBdt"
                  control={control}
                  render={({ field }) => (
                    <Input
                      type="number"
                      inputMode="numeric"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      className="w-24"
                    />
                  )}
                />
                <span className="text-sm text-muted-foreground">BDT</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">
                {t.pages.policies.objectionWindow}
              </label>
              <p className="text-xs text-muted-foreground">{t.pages.policies.objectionWindowHint}</p>
              <div className="mt-2 flex items-center gap-2">
                <Controller
                  name="objectionWindowDays"
                  control={control}
                  render={({ field }) => (
                    <Input
                      type="number"
                      inputMode="numeric"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      className="w-24"
                    />
                  )}
                />
                <span className="text-sm text-muted-foreground">{t.pages.policies.days}</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">
                {t.pages.policies.fraudThreshold}
              </label>
              <p className="text-xs text-muted-foreground">{t.pages.policies.fraudThresholdHint}</p>
              <div className="mt-2">
                <Controller
                  name="fraudScoreThreshold"
                  control={control}
                  render={({ field }) => (
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      className="w-32"
                    />
                  )}
                />
              </div>
            </div>
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
