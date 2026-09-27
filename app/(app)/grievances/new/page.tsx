"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Clock,
  ServerCrash,
  UserX,
  ShieldAlert,
  Info,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";
import { useFileGrievance } from "@/hooks/queries";
import type { GrievanceCategory } from "@/lib/types";

const CATEGORY_ICONS: Record<GrievanceCategory, React.ElementType> = {
  technical: ServerCrash,
  delay: Clock,
  "staff-conduct": UserX,
  corruption: ShieldAlert,
};

function makeSchema(t: Dictionary) {
  return z.object({
    category: z.enum(["technical", "delay", "staff-conduct", "corruption"], {
      message: t.pages.grievances.categoryRequired,
    }),
    description: z
      .string()
      .min(20, t.pages.grievances.descriptionTooShort)
      .max(2000, t.pages.grievances.descriptionTooLong),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export default function NewGrievancePage() {
  const t = useT();
  const schema = useMemo(() => makeSchema(t), [t]);
  const router = useRouter();
  
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      description: "",
    },
  });

  const selectedCategory = useWatch({ control, name: "category" });
  const fileGrievance = useFileGrievance();

  const onSubmit = async (data: FormValues) => {
    try {
      const created = await fileGrievance.mutateAsync(data);
      toast.success(t.pages.grievances.submittedTitle, {
        description: t.pages.grievances.submittedBody(created.caseNumber),
      });
      router.push(`/grievances/${created.id}`);
    } catch {
      toast.error(t.pages.grievances.submissionFailed, {
        description: t.pages.grievances.submissionFailedBody,
      });
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="shrink-0 rounded-full"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <PageHeader
          eyebrow={t.nav.grievances}
          title={t.pages.grievances.file}
        />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <div className="space-y-4">
          <label className="text-sm font-medium">{t.pages.grievances.selectCategory}</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(["technical", "delay", "staff-conduct", "corruption"] as GrievanceCategory[]).map(
              (cat) => {
                const Icon = CATEGORY_ICONS[cat];
                const key = cat === "staff-conduct" ? "staffConduct" : cat;
                const title = t.pages.grievances.category[key as keyof Dictionary["pages"]["grievances"]["category"]];
                const blurb = t.pages.grievances.categoryBlurb[key as keyof Dictionary["pages"]["grievances"]["categoryBlurb"]];
                const isSelected = selectedCategory === cat;

                return (
                  <Controller
                    key={cat}
                    name="category"
                    control={control}
                    render={({ field }) => (
                      <button
                        type="button"
                        onClick={() => field.onChange(cat)}
                        className={cn(
                          "flex items-start gap-4 rounded-xl border p-4 text-left transition-all",
                          isSelected
                            ? "border-red-600 bg-red-50 dark:border-red-500 dark:bg-red-950/20"
                            : "hover:bg-muted/50"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                            isSelected
                              ? "bg-red-600 text-white"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          <Icon className="size-5" />
                        </div>
                        <div>
                          <div className="font-medium">{title}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{blurb}</div>
                        </div>
                      </button>
                    )}
                  />
                );
              }
            )}
          </div>
          {errors.category && (
            <p className="text-sm font-medium text-destructive">{errors.category.message}</p>
          )}

          {selectedCategory && (
            <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
              <Info className="mt-0.5 size-4 shrink-0" />
              <p>
                {t.pages.grievances.routingNotice}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <label className="text-sm font-medium">{t.pages.grievances.descriptionLabel}</label>
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <Textarea
                {...field}
                className="min-h-[150px] resize-none"
                placeholder={t.pages.grievances.descriptionPlaceholder}
              />
            )}
          />
          {errors.description && (
            <p className="text-sm font-medium text-destructive">{errors.description.message}</p>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={fileGrievance.isPending} className="w-full sm:w-auto">
            {fileGrievance.isPending ? (
              t.pages.grievances.submitting
            ) : (
              <>
                <Send className="mr-2 size-4" />
                {t.pages.grievances.submitComplaint}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
