"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, MapPin, Navigation, Search } from "lucide-react";
import type { FieldReportStatus } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { SurveyCorners } from "@/components/survey-corners";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssignedFieldReports } from "@/hooks/queries";
import {
  filterAssignedFieldReports,
  type FieldReportStatusFilter,
} from "@/lib/field-search";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";

const FIELD_REPORT_STATUSES: FieldReportStatus[] = [
  "assigned",
  "accepted",
  "en-route",
  "in-progress",
  "completed",
  "cancelled",
];

export default function FieldSearchPage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FieldReportStatusFilter>("all");
  const { data, isLoading, isError, refetch } = useAssignedFieldReports();
  const results = useMemo(
    () => filterAssignedFieldReports(data ?? [], query, status, t.domain.surveyPurpose),
    [data, query, status, t.domain.surveyPurpose],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.fieldSurvey}
        title={t.shell.searchRecords}
        description={t.pages.fieldSearch.description}
      />

      <Card className="gap-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.pages.fieldSearch.placeholder}
              aria-label={t.shell.searchRecords}
              className="pl-8"
            />
          </div>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as FieldReportStatusFilter)}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label={t.pages.fieldSearch.statusLabel}>
              <SelectValue>
                {status === "all" ? t.common.all : s.fieldReport[status].label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.all}</SelectItem>
              {FIELD_REPORT_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {s.fieldReport[value].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!isLoading && !isError ? (
          <p className="text-xs text-muted-foreground">
            {t.pages.fieldSearch.resultCount(results.length)}
          </p>
        ) : null}
      </Card>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
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
      ) : results.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t.pages.fieldSearch.emptyTitle}
          description={t.pages.fieldSearch.emptyBody}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {results.map((report) => (
            <Card key={report.id} className="relative gap-3 px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <IdChip icon={MapPin}>{report.parcelDagNo}</IdChip>
                  <span className="text-sm font-medium text-foreground">
                    {t.domain.surveyPurpose[report.purpose]}
                  </span>
                </div>
                <StatusMetaBadge meta={s.fieldReport[report.status]} />
              </div>

              <div className="grid gap-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {f.dateTime(report.scheduledFor)}
                </span>
                {report.addressHint ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Navigation className="size-3.5" />
                    {report.addressHint}
                  </span>
                ) : null}
              </div>

              <Button
                size="sm"
                className="w-fit"
                nativeButton={false}
                render={<Link href={`/field/${report.id}`} />}
              >
                {t.pages.fieldSearch.openCase}
                <ArrowRight className="size-3.5" />
              </Button>
              <SurveyCorners />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
