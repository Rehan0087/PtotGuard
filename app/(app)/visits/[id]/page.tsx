"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Calendar,
  Crosshair,
  Image as ImageIcon,
  MapPin,
  Navigation,
  Ruler,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { SurveyCorners } from "@/components/survey-corners";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useFieldReport,
  useAddFieldReportMedia,
  useUpdateFieldReport,
} from "@/hooks/queries";
import { filingReview, type FilingBlocker } from "@plotguard/rules";
import { formatCoord } from "@/lib/format";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import type { Dictionary } from "@/lib/i18n";
import type { GeoPoint } from "@/lib/types";

/** Codes from the gate, worded per locale. See lib/field-capture.ts. */
function blockerText(t: Dictionary, b: FilingBlocker): string {
  const w = t.pages.capture.blocker;
  switch (b.code) {
    case "not-actionable":
      return w.notActionable;
    case "need-gps":
      return w.needGps(b.have, b.need);
    case "need-photos":
      return w.needPhotos(b.have, b.need);
    case "need-notes":
      return w.needNotes;
  }
}

/**
 * Device GPS when the browser will give it, otherwise a point jittered around the
 * parcel centroid. The mock has no way to be standing in a field, and a capture
 * screen with no capture is not reviewable — so the fallback is labelled rather
 * than hidden.
 */
function readPosition(
  near: GeoPoint | undefined,
): Promise<{ lat: number; lng: number; accuracyMeters: number; simulated: boolean }> {
  const simulate = () => {
    const base = near ?? { lat: 23.5494, lng: 90.9895 };
    return {
      lat: base.lat + (Math.random() - 0.5) * 0.0016,
      lng: base.lng + (Math.random() - 0.5) * 0.0016,
      accuracyMeters: Math.round((2 + Math.random() * 4) * 10) / 10,
      simulated: true,
    };
  };

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(simulate());
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: Math.round(pos.coords.accuracy * 10) / 10,
          simulated: false,
        }),
      () => resolve(simulate()),
      { timeout: 4000, enableHighAccuracy: true },
    );
  });
}

export default function CapturePage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useFieldReport(id);
  const addMedia = useAddFieldReportMedia(id);
  const updateReport = useUpdateFieldReport(id);

  const [pointLabel, setPointLabel] = useState("");
  const [caption, setCaption] = useState("");
  const [notes, setNotes] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState icon={Ruler} title={t.pages.capture.notFound}>
        <Link href="/visits" className="text-sm text-primary hover:underline">
          {t.pages.capture.backToVisits}
        </Link>
      </EmptyState>
    );
  }

  const { report, parcel } = data;
  // Seed from the saved report once, then the field owns it.
  const draftNotes = notes ?? report.notes ?? "";
  const review = filingReview(report, draftNotes);
  const closed = report.status === "completed" || report.status === "cancelled";

  const capturePoint = async () => {
    const pos = await readPosition(parcel?.centroid);
    await addMedia.mutateAsync({
      gps: {
        lat: pos.lat,
        lng: pos.lng,
        accuracyMeters: pos.accuracyMeters,
        label:
          pointLabel.trim() ||
          (pos.simulated ? t.pages.capture.simulatedPoint : undefined),
      },
    });
    setPointLabel("");
  };

  const addPhoto = async () => {
    await addMedia.mutateAsync({
      photo: { url: "", caption: caption.trim() || undefined },
    });
    setCaption("");
  };

  const file = async () => {
    await updateReport.mutateAsync({ status: "completed", notes: draftNotes });
    toast.success(t.pages.capture.filed);
  };

  return (
    <div className="space-y-6">
      <Link
        href="/visits"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t.pages.capture.backToVisits}
      </Link>

      <PageHeader
        eyebrow={<IdChip icon={MapPin}>{report.parcelDagNo}</IdChip>}
        title={t.domain.surveyPurpose[report.purpose]}
        description={parcel?.title}
      >
        <StatusMetaBadge meta={s.fieldReport[report.status]} />
      </PageHeader>

      <div className="grid gap-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="size-3.5" />
          {t.pages.capture.scheduled(f.dateTime(report.scheduledFor))}
        </span>
        {report.addressHint ? (
          <span className="inline-flex items-center gap-1.5">
            <Navigation className="size-3.5" />
            {report.addressHint}
          </span>
        ) : null}
      </div>

      {/* Status ladder — an agent marks progress as they travel. */}
      {!closed ? (
        <div className="flex flex-wrap gap-2">
          {report.status === "assigned" ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={updateReport.isPending}
              onClick={() => updateReport.mutate({ status: "en-route" })}
            >
              <Navigation className="size-3.5" />
              {t.pages.capture.markEnRoute}
            </Button>
          ) : null}
          {report.status === "assigned" || report.status === "en-route" ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={updateReport.isPending}
              onClick={() => updateReport.mutate({ status: "in-progress" })}
            >
              <MapPin className="size-3.5" />
              {t.pages.capture.markOnSite}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* GPS ------------------------------------------------------------ */}
        <Card className="relative gap-4 px-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <Crosshair className="size-4 text-marker" />
              {t.pages.capture.gpsPoints}
            </h2>
            <span className="tabular text-xs text-muted-foreground">
              {/* "2 of 0" reads as a shortfall it isn't — show the bare count
                  when this purpose asks for none. */}
              {review.gpsNeed > 0
                ? t.pages.capture.required(review.gpsHave, review.gpsNeed)
                : f.number(review.gpsHave)}
            </span>
          </div>

          {report.gpsCaptures.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t.pages.capture.noGps}</p>
          ) : (
            <ul className="space-y-1.5">
              {report.gpsCaptures.map((g) => (
                <li
                  key={g.id}
                  className="rounded-md bg-secondary/40 px-3 py-2 text-xs"
                >
                  <div className="font-medium text-foreground">
                    {g.label ?? t.common.notAvailable}
                  </div>
                  <div className="tabular text-muted-foreground">
                    {formatCoord(g.point.lat, g.point.lng)} ·{" "}
                    {t.pages.capture.accuracy(g.accuracyMeters)}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!closed ? (
            <div className="space-y-2">
              <Label htmlFor="point-label" className="text-xs">
                {t.pages.capture.pointLabel}
              </Label>
              <Input
                id="point-label"
                value={pointLabel}
                onChange={(e) => setPointLabel(e.target.value)}
                placeholder={t.pages.capture.pointLabelHint}
              />
              <Button
                size="sm"
                className="w-fit"
                disabled={addMedia.isPending}
                onClick={capturePoint}
              >
                <Crosshair className="size-3.5" />
                {addMedia.isPending ? t.pages.capture.capturing : t.pages.capture.capturePoint}
              </Button>
            </div>
          ) : null}
          <SurveyCorners />
        </Card>

        {/* Photos ---------------------------------------------------------- */}
        <Card className="gap-4 px-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <Camera className="size-4 text-marker" />
              {t.pages.capture.photos}
            </h2>
            <span className="tabular text-xs text-muted-foreground">
              {review.photosNeed > 0
                ? t.pages.capture.required(review.photosHave, review.photosNeed)
                : f.number(review.photosHave)}
            </span>
          </div>

          {report.photos.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t.pages.capture.noPhotos}</p>
          ) : (
            <ul className="space-y-1.5">
              {report.photos.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2.5 rounded-md bg-secondary/40 px-3 py-2 text-xs"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded bg-muted text-muted-foreground">
                    <ImageIcon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">
                      {p.caption ?? t.pages.capture.photoPlaceholder}
                    </span>
                    <span className="block text-muted-foreground">
                      {f.dateTime(p.capturedAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!closed ? (
            <div className="space-y-2">
              <Label htmlFor="caption" className="text-xs">
                {t.pages.capture.photoCaption}
              </Label>
              <Input
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t.pages.capture.photoCaptionHint}
              />
              <Button
                size="sm"
                variant="secondary"
                className="w-fit"
                disabled={addMedia.isPending}
                onClick={addPhoto}
              >
                <Camera className="size-3.5" />
                {t.pages.capture.addPhoto}
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      {!closed ? (
        <p className="text-xs text-muted-foreground">{t.pages.capture.simulatedNote}</p>
      ) : null}

      {/* Findings + filing ------------------------------------------------- */}
      <Card className="gap-3 px-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">{t.pages.capture.notes}</h2>
          <p className="text-xs text-muted-foreground">{t.pages.capture.notesHint}</p>
        </div>

        {closed ? (
          <p className="rounded-md bg-secondary/50 px-3 py-2 text-sm text-secondary-foreground">
            {report.notes ?? t.common.notAvailable}
          </p>
        ) : (
          <Textarea
            value={draftNotes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.pages.capture.notesPlaceholder}
            rows={5}
          />
        )}

        {!closed ? (
          <>
            {review.blockers.length > 0 ? (
              <Alert>
                <AlertDescription>
                  <span className="font-medium">{t.pages.capture.needsBefore}</span>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {review.blockers.map((b) => (
                      <li key={b.code}>{blockerText(t, b)}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            <Button
              className="w-fit"
              disabled={!review.canFile || updateReport.isPending}
              onClick={file}
            >
              <Send className="size-3.5" />
              {updateReport.isPending ? t.pages.capture.filing : t.pages.capture.fileReport}
            </Button>
          </>
        ) : report.submittedAt ? (
          <p className="text-xs text-muted-foreground">
            {t.pages.visits.submitted(f.dateTime(report.submittedAt))}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
