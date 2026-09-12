"use client";

import Link from "next/link";
import { MapPin, Navigation, Camera, Ruler, Calendar, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { SurveyCorners } from "@/components/survey-corners";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAcceptFieldReport, useAssignedFieldReports } from "@/hooks/queries";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import { toast } from "sonner";

export default function VisitsPage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const { data, isLoading, isError, refetch } = useAssignedFieldReports();
  const acceptCase = useAcceptFieldReport();
  const visits = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.fieldSurvey}
        title={t.nav.assignedVisits}
        description={t.pages.visits.description}
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>{t.pages.visits.loadFailedTitle}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{t.pages.visits.loadFailedBody}</p>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              {t.common.retry}
            </Button>
          </AlertDescription>
        </Alert>
      ) : visits.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={t.pages.visits.emptyTitle}
          description={t.pages.visits.emptyBody}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visits.map((v) => {
            const actionable =
              v.status === "assigned" ||
              v.status === "accepted" ||
              v.status === "en-route" ||
              v.status === "in-progress";
            return (
              <Card key={v.id} className="relative gap-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <IdChip icon={MapPin}>{v.parcelDagNo}</IdChip>
                    <span className="text-sm font-medium text-foreground">
                      {t.domain.surveyPurpose[v.purpose]}
                    </span>
                  </div>
                  <StatusMetaBadge meta={s.fieldReport[v.status]} />
                </div>

                <div className="grid gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    {f.dateTime(v.scheduledFor)}
                  </span>
                  {v.addressHint ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Navigation className="size-3.5" />
                      {v.addressHint}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" />{" "}
                      {t.pages.visits.gpsCount(v.gpsCaptures.length)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Camera className="size-3.5" />{" "}
                      {t.pages.visits.photoCount(v.photos.length)}
                    </span>
                  </span>
                </div>

                {v.status === "assigned" ? (
                  <Button
                    size="sm"
                    className="w-fit"
                    disabled={acceptCase.isPending}
                    onClick={() =>
                      acceptCase.mutate(v.id, {
                        onSuccess: () => toast.success(t.pages.visits.caseAccepted),
                        onError: () => toast.error(t.common.somethingWentWrong),
                      })
                    }
                  >
                    <Ruler className="size-3.5" />
                    {acceptCase.isPending
                      ? t.pages.visits.acceptingCase
                      : t.pages.visits.acceptCase}
                    <ArrowRight className="size-3.5" />
                  </Button>
                ) : actionable ? (
                  <Button
                    size="sm"
                    className="w-fit"
                    nativeButton={false}
                    render={<Link href={`/field/${v.id}`} />}
                  >
                    <Ruler className="size-3.5" />
                    {t.pages.visits.openCapture}
                    <ArrowRight className="size-3.5" />
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t.pages.visits.submitted(
                      v.submittedAt ? f.dateTime(v.submittedAt) : t.common.notAvailable,
                    )}
                  </p>
                )}
                <SurveyCorners />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
