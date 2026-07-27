"use client";

import { useEffect, useMemo, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { Minus, Plus, Scale, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SurveyCorners } from "@/components/survey-corners";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";
import { useCalculateInheritance } from "@/hooks/queries";
import type { HeirRelation } from "@/lib/types";

/** Order and limits are the same everywhere; the words come from the dictionary. */
const HEIRS = [
  { key: "husband", max: 1 },
  { key: "wife", max: 4 },
  { key: "son", max: 20 },
  { key: "daughter", max: 20 },
  { key: "father", max: 1 },
  { key: "mother", max: 1 },
] as const;

/** Built per locale: the refine messages are shown to the reader. */
function makeSchema(t: Dictionary) {
  return z
    .object({
      method: z.enum(["faraiz", "hindu"]),
      // Kept as a string (parsed on submit) so form input == output type.
      estateValue: z.string(),
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

function Stepper({
  label,
  hint,
  value,
  onChange,
  max,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
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
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={t.pages.inheritance.decrease(label)}
        >
          <Minus />
        </Button>
        <span className="w-7 text-center text-sm font-medium tabular-nums">
          {f.number(value)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={t.pages.inheritance.increase(label)}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

export default function InheritancePage() {
  const t = useT();
  const f = useFmt();
  const calc = useCalculateInheritance();
  const schema = useMemo(() => makeSchema(t), [t]);
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      method: "faraiz",
      estateValue: "4800000",
      husband: 0,
      wife: 1,
      son: 2,
      daughter: 1,
      father: 0,
      mother: 0,
    },
  });

  function onSubmit(values: FormValues) {
    const heirs = HEIRS.map((h) => ({ relation: h.key as HeirRelation, count: values[h.key] })).filter(
      (h) => h.count > 0,
    );
    const estate = Number(values.estateValue.replace(/[^\d.]/g, "")) || 0;
    calc.mutate({
      method: values.method,
      estateValue: estate > 0 ? estate : undefined,
      heirs,
    });
  }

  // Show a worked example on first load so the screen lands populated.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    handleSubmit(onSubmit)();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = calc.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.pages.inheritance.title}
        description={t.pages.inheritance.description}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 lg:col-span-2">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              {t.pages.inheritance.successionLaw}
            </span>
            <Controller
              name="method"
              control={control}
              render={({ field }) => (
                <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
                  {(["faraiz", "hindu"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => field.onChange(m)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        field.value === m
                          ? "bg-card text-foreground ring-1 ring-foreground/10"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t.domain.successionMethod[m]}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          <div>
            <label htmlFor="estate" className="mb-1.5 block text-sm font-medium text-foreground">
              {t.pages.inheritance.estateValue}{" "}
              <span className="text-muted-foreground">({t.common.optional})</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {t.pages.inheritance.currencySymbol}
              </span>
              <Input id="estate" type="number" min={0} step={1000} className="pl-6" {...register("estateValue")} />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              {t.pages.inheritance.survivingHeirs}
            </span>
            <div className="grid gap-2">
              {HEIRS.map((h) => (
                <Controller
                  key={h.key}
                  name={h.key}
                  control={control}
                  render={({ field }) => (
                    <Stepper
                      label={t.pages.inheritance.heirs[h.key].label}
                      hint={t.pages.inheritance.heirs[h.key].hint}
                      value={field.value}
                      onChange={field.onChange}
                      max={h.max}
                    />
                  )}
                />
              ))}
            </div>
            {(errors.wife?.message || errors.method?.message) && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
                <AlertCircle className="size-4" />
                {errors.wife?.message ?? errors.method?.message}
              </p>
            )}
          </div>

          <Button type="submit" disabled={calc.isPending}>
            <Scale className="size-4" />
            {t.pages.inheritance.calculate}
          </Button>
        </form>

        {/* Result */}
        <div className="lg:col-span-3">
          <Card className="relative min-h-full gap-4 px-5">
            <SurveyCorners />
            <div className="flex items-baseline justify-between">
              <h2 className="font-heading text-base font-semibold text-foreground">
                {t.pages.inheritance.distribution}
              </h2>
              {result ? (
                <span className="text-xs uppercase tracking-wide text-marker">
                  {t.domain.successionMethod[result.method]}
                </span>
              ) : null}
            </div>

            {calc.isPending ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : result ? (
              <>
                <ul className="space-y-2.5">
                  {result.shares.map((s) => (
                    <li key={s.relation} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-foreground">
                          {t.domain.heirRelation[s.relation]}
                          {s.count > 1 ? (
                            <span className="text-muted-foreground">
                              {t.pages.inheritance.times(s.count)}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex items-baseline gap-2">
                          <span className="font-heading text-base font-semibold tabular-nums text-foreground">
                            {f.digits(s.fraction)}
                          </span>
                          {s.amount != null ? (
                            <span className="tabular text-xs text-muted-foreground">
                              {f.money({ amount: s.amount, currency: "BDT" })}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round(s.totalShare * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border pt-3">
                  {result.notes.map((note) => (
                    <p key={note} className="text-xs text-muted-foreground">
                      {t.pages.inheritance.notes[note]}
                    </p>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t.pages.inheritance.emptyResult}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
