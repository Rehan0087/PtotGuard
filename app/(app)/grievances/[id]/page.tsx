"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, ShieldAlert, UserX, ServerCrash, Star, CheckCircle2 } from "lucide-react";
import { useGrievance, useRateGrievance, useResolveGrievance } from "@/hooks/queries";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { useStatusMeta } from "@/lib/i18n/status";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n/provider";
import { useFmt } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { GrievanceCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/queries";

const CATEGORY_ICONS: Record<GrievanceCategory, React.ElementType> = {
  technical: ServerCrash,
  delay: Clock,
  "staff-conduct": UserX,
  corruption: ShieldAlert,
};

export default function GrievanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const t = useT();
  const f = useFmt();
  const role = useRole();
  const s = useStatusMeta();
  const { data, isLoading } = useGrievance(id);
  const rateGrievance = useRateGrievance(id);
  const resolveGrievance = useResolveGrievance(id);

  const [rating, setRating] = useState(0);
  const [resolutionNote, setResolutionNote] = useState("");

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 pb-24">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const { grievance, timeline } = data;
  const Icon = CATEGORY_ICONS[grievance.category];
  const categoryKey = grievance.category === "staff-conduct" ? "staffConduct" : grievance.category;
  const categoryLabel = t.pages.grievances.category[categoryKey as keyof Dictionary["pages"]["grievances"]["category"]];
  const isResolved = grievance.status === "resolved" || grievance.status === "dismissed";

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-24">
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="mt-1 shrink-0 rounded-full"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 space-y-4">
          <PageHeader eyebrow={categoryLabel} title={grievance.caseNumber} />
          <div className="flex flex-wrap items-center gap-3">
            <StatusMetaBadge meta={s.grievance[grievance.status]} />
            <div className="text-sm text-muted-foreground">
              Filed {f.date(grievance.createdAt)}
            </div>
          </div>
        </div>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Icon className="size-5 text-red-600" />
          Complaint Details
        </h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {grievance.description}
        </p>
      </Card>

      {isResolved && grievance.resolutionNote && (
        <Card className="border-green-200 bg-green-50 p-6 dark:border-green-900/50 dark:bg-green-950/20">
          <h3 className="font-semibold mb-2 flex items-center gap-2 text-green-800 dark:text-green-300">
            <CheckCircle2 className="size-5" />
            Resolution
          </h3>
          <p className="whitespace-pre-wrap text-sm text-green-900 dark:text-green-200">
            {grievance.resolutionNote}
          </p>
        </Card>
      )}

      {role === "citizen" && isResolved && !grievance.satisfactionRating && (
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold">{t.pages.grievances.ratingDescription}</h3>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className="transition-transform hover:scale-110 focus:outline-none"
              >
                <Star
                  className={cn(
                    "size-8",
                    rating >= star
                      ? "fill-yellow-400 text-yellow-400"
                      : "fill-muted text-muted-foreground/30 hover:text-yellow-400/50"
                  )}
                />
              </button>
            ))}
          </div>
          <Button
            disabled={!rating || rateGrievance.isPending}
            onClick={() => rateGrievance.mutate({ rating })}
          >
            Submit rating
          </Button>
        </Card>
      )}

      {role !== "citizen" && !isResolved && (
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold">Resolve Complaint</h3>
          <Textarea
            placeholder="Explain how this issue was resolved or why it was dismissed..."
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            className="min-h-[100px]"
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              disabled={!resolutionNote || resolveGrievance.isPending}
              onClick={() => resolveGrievance.mutate({ resolutionNote, dismissed: true })}
            >
              Dismiss
            </Button>
            <Button
              disabled={!resolutionNote || resolveGrievance.isPending}
              onClick={() => resolveGrievance.mutate({ resolutionNote })}
            >
              Mark Resolved
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Timeline</h3>
        <div className="relative space-y-4 pl-4 before:absolute before:inset-y-2 before:left-[7px] before:w-px before:bg-border">
          {timeline.map((event) => (
            <div key={event.id} className="relative flex gap-4">
              <div className="absolute -left-5 mt-1.5 size-2.5 rounded-full bg-primary ring-4 ring-background" />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-sm">{event.title}</div>
                {event.description && (
                  <div className="text-sm text-muted-foreground">
                    {event.description}
                  </div>
                )}
                <time className="text-xs text-muted-foreground block pt-1">
                  {f.dateTime(event.at)}
                </time>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
