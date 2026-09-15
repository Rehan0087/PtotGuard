"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Camera, Calendar, Crosshair, FileUp, Image as ImageIcon, MapPin, Navigation, Ruler, Send, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { SurveyCorners } from "@/components/survey-corners";
import { BoundaryWalkMap } from "@/components/boundary-walk-map";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useFieldReport, useAddFieldReportMedia, useAcceptFieldReport, useUpdateFieldReport, useFlagFieldReportDispute } from "@/hooks/queries";
import { useBoundaryWalk } from "@/hooks/use-boundary-walk";
import { filingReview, type FilingBlocker } from "@plotguard/rules";
import { formatCoord } from "@/lib/format";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import type { Dictionary } from "@/lib/i18n";
import { ApiError } from "@/lib/api-client";
import { GeolocationFailure } from "@/lib/field-offline/geolocation";
import { useSessionStore } from "@/store/session";

function blockerText(t: Dictionary, blocker: FilingBlocker): string {
  const wording = t.pages.capture.blocker;
  switch (blocker.code) {
    case "not-actionable": return wording.notActionable;
    case "need-gps": return wording.needGps(blocker.have, blocker.need);
    case "need-photos": return wording.needPhotos(blocker.have, blocker.need);
    case "need-notes": return wording.needNotes;
  }
}

export default function CapturePage() {
  const t = useT();
  const f = useFmt();
  const status = useStatusMeta();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useFieldReport(id);
  const storedAgentId = useSessionStore((state) => state.userId);
  const assignedAgentId = storedAgentId ?? data?.report.assignedAgentId ?? null;
  const walk = useBoundaryWalk(id, assignedAgentId, data);
  const addMedia = useAddFieldReportMedia(id);
  const acceptCase = useAcceptFieldReport();
  const updateReport = useUpdateFieldReport(id);
  const flagDispute = useFlagFieldReportDispute(id);
  const [caption, setCaption] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [disputeFound, setDisputeFound] = useState(false);
  const [disputeDescription, setDisputeDescription] = useState("");

  useEffect(() => {
    if (!storedAgentId && data?.report.assignedAgentId) {
      useSessionStore.setState({ userId: data.report.assignedAgentId });
    }
  }, [data?.report.assignedAgentId, storedAgentId]);

  if (isLoading && walk.restoring && !walk.data) return <div className="space-y-6"><Skeleton className="h-8 w-40" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (isError && !walk.data && !(error instanceof ApiError && error.status === 404)) {
    return <Alert variant="destructive"><AlertTitle>{t.common.somethingWentWrong}</AlertTitle><AlertDescription className="space-y-3"><p>{t.common.tryAgain}</p><Button size="sm" variant="outline" onClick={() => void refetch()}>{t.common.retry}</Button></AlertDescription></Alert>;
  }
  if (!walk.data) return <EmptyState icon={Ruler} title={t.pages.capture.notFound}><Link href="/field" className="text-sm text-primary hover:underline">{t.pages.capture.backToVisits}</Link></EmptyState>;

  const { report, parcel, survey } = walk.data;
  const draftNotes = notes ?? report.notes ?? "";
  const review = filingReview(report, draftNotes, { gpsCount: walk.points.length });
  const closed = report.status === "completed" || report.status === "cancelled";
  const active = report.status === "in-progress" && survey?.status === "in-progress";
  const locationMessage = (failure: unknown) => {
    if (!(failure instanceof GeolocationFailure)) return t.common.somethingWentWrong;
    if (failure.code === "denied") return t.pages.capture.permissionDenied;
    if (failure.code === "timeout") return t.pages.capture.gpsTimeout;
    return t.pages.capture.gpsUnavailable;
  };
  const begin = async () => {
    try { await walk.start(); toast.success(t.pages.capture.verificationStarted); }
    catch (failure) { toast.error(locationMessage(failure)); }
  };
  const resume = async () => {
    try { await walk.resume(); }
    catch (failure) { toast.error(locationMessage(failure)); }
  };
  const addPhoto = async () => {
    await addMedia.mutateAsync({ photo: { url: "", caption: caption.trim() || undefined } });
    setCaption("");
  };
  const addSketchMap = async (selected: File | undefined) => {
    if (!selected) return;
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(selected);
    });
    await addMedia.mutateAsync({ sketchMap: { url, fileName: selected.name } });
  };
  const file = async () => {
    try {
      await walk.complete(draftNotes);
      if (disputeFound) await flagDispute.mutateAsync(disputeDescription.trim() || draftNotes);
      toast.success(t.pages.capture.filed);
      if (walk.online) void refetch();
    } catch { toast.error(t.common.somethingWentWrong); }
  };

  return <div className="space-y-6">
    <Link href="/field" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t.pages.capture.backToVisits}</Link>
    <PageHeader eyebrow={<IdChip icon={MapPin}>{report.parcelDagNo}</IdChip>} title={t.domain.surveyPurpose[report.purpose]} description={parcel?.title}><StatusMetaBadge meta={status.fieldReport[report.status]} /></PageHeader>

    <div className="grid gap-1.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><Calendar className="size-3.5" />{t.pages.capture.scheduled(f.dateTime(report.scheduledFor))}</span>
      {report.addressHint ? <span className="inline-flex items-center gap-1.5"><Navigation className="size-3.5" />{report.addressHint}</span> : null}
      {survey ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{t.pages.capture.surveyStatus(t.pages.capture.surveyState[survey.status])}</span> : null}
      {survey ? <span className="inline-flex items-center gap-1.5"><Calendar className="size-3.5" />{t.pages.capture.surveyStarted(f.dateTime(survey.startedAt))}</span> : null}
      {survey?.completedAt ? <span className="inline-flex items-center gap-1.5"><Calendar className="size-3.5" />{t.pages.capture.surveyCompleted(f.dateTime(survey.completedAt))}</span> : null}
      <span className="inline-flex items-center gap-1.5">{walk.online ? <Crosshair className="size-3.5" /> : <WifiOff className="size-3.5" />}{walk.online ? t.pages.capture.online : t.pages.capture.offline}{walk.pendingCount ? ` · ${t.pages.capture.pendingSync(walk.pendingCount)}` : ""}</span>
    </div>

    {!closed ? <div className="flex flex-wrap gap-2">
      {report.status === "assigned" ? <Button size="sm" variant="secondary" disabled={acceptCase.isPending || !walk.online} onClick={() => acceptCase.mutate(report.id, { onSuccess: () => toast.success(t.pages.capture.caseAccepted), onError: () => toast.error(t.common.somethingWentWrong) })}><Ruler className="size-3.5" />{acceptCase.isPending ? t.pages.capture.acceptingCase : t.pages.capture.acceptCase}</Button> : null}
      {report.status === "accepted" ? <Button size="sm" variant="secondary" disabled={updateReport.isPending || !walk.online} onClick={() => updateReport.mutate({ status: "en-route" })}><Navigation className="size-3.5" />{t.pages.capture.markEnRoute}</Button> : null}
      {(report.status === "accepted" || report.status === "en-route") && !survey ? <Button size="sm" variant="secondary" onClick={() => void begin()}><MapPin className="size-3.5" />{t.pages.capture.startVerification}</Button> : null}
    </div> : null}

    {walk.locationError ? <Alert variant="destructive"><AlertTitle>{t.pages.capture.gpsProblem}</AlertTitle><AlertDescription>{locationMessage(new GeolocationFailure(walk.locationError, ""))}</AlertDescription></Alert> : null}
    {walk.syncStatus === "FAILED" || walk.syncStatus === "CONFLICT" ? <Alert variant="destructive"><AlertTitle>{walk.syncStatus === "CONFLICT" ? t.pages.capture.syncConflict : t.pages.capture.syncFailed}</AlertTitle>{walk.syncStatus === "FAILED" ? <AlertDescription><Button size="sm" variant="outline" onClick={() => void walk.retrySync()}>{t.common.retry}</Button></AlertDescription> : null}</Alert> : null}

    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="relative gap-4 px-4">
        <div className="flex items-center justify-between gap-2"><h2 className="inline-flex items-center gap-2 text-sm font-medium text-foreground"><Crosshair className="size-4 text-marker" />{t.pages.capture.gpsPoints}</h2><span className="tabular text-xs text-muted-foreground">{review.gpsNeed > 0 ? t.pages.capture.required(review.gpsHave, review.gpsNeed) : f.number(review.gpsHave)}</span></div>
        <BoundaryWalkMap parcel={parcel} points={walk.points} />
        {walk.points.length === 0 ? <p className="text-xs text-muted-foreground">{t.pages.capture.noGps}</p> : <ul className="max-h-52 space-y-1.5 overflow-y-auto">{walk.points.map((point) => <li key={point.id} className="rounded-md bg-secondary/40 px-3 py-2 text-xs"><div className="font-medium text-foreground">P{f.number(point.sequence)}</div><div className="tabular text-muted-foreground">{formatCoord(point.latitude, point.longitude)} · {t.pages.capture.accuracy(point.accuracyMeters)}{point.accuracyMeters > 25 ? ` · ${t.pages.capture.lowAccuracy}` : ""}</div></li>)}</ul>}
        {!closed && active ? <Button size="sm" className="w-fit" disabled={walk.tracking} onClick={() => void resume()}><Crosshair className="size-3.5" />{walk.tracking ? t.pages.capture.tracking : t.pages.capture.resumeTracking}</Button> : null}
        <SurveyCorners />
      </Card>

      <Card className="gap-4 px-4">
        <div className="flex items-center justify-between gap-2"><h2 className="inline-flex items-center gap-2 text-sm font-medium text-foreground"><Camera className="size-4 text-marker" />{t.pages.capture.photos}</h2><span className="tabular text-xs text-muted-foreground">{review.photosNeed > 0 ? t.pages.capture.required(review.photosHave, review.photosNeed) : f.number(review.photosHave)}</span></div>
        {report.photos.length === 0 ? <p className="text-xs text-muted-foreground">{t.pages.capture.noPhotos}</p> : <ul className="space-y-1.5">{report.photos.map((photo) => <li key={photo.id} className="flex items-center gap-2.5 rounded-md bg-secondary/40 px-3 py-2 text-xs"><span className="grid size-8 shrink-0 place-items-center rounded bg-muted text-muted-foreground"><ImageIcon className="size-4" /></span><span className="min-w-0"><span className="block truncate text-foreground">{photo.caption ?? t.pages.capture.photoPlaceholder}</span><span className="block text-muted-foreground">{f.dateTime(photo.capturedAt)}</span></span></li>)}</ul>}
        {!closed ? <div className="space-y-2"><Label htmlFor="caption" className="text-xs">{t.pages.capture.photoCaption}</Label><Input id="caption" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder={t.pages.capture.photoCaptionHint} /><Button size="sm" variant="secondary" className="w-fit" disabled={!active || addMedia.isPending || !walk.online} onClick={() => void addPhoto()}><Camera className="size-3.5" />{t.pages.capture.addPhoto}</Button></div> : null}
      </Card>
    </div>

    <Card className="gap-3 px-4">
      <div className="space-y-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-medium text-foreground"><FileUp className="size-4 text-marker" />{t.pages.capture.sketchMap}</h2>
        <p className="text-xs text-muted-foreground">{report.sketchMapFileName ? t.pages.capture.sketchMapUploaded(report.sketchMapFileName) : t.pages.capture.sketchMapHint}</p>
        {!closed ? <Input type="file" accept="image/*,.pdf" disabled={!active || addMedia.isPending || !walk.online} onChange={(event) => void addSketchMap(event.target.files?.[0])} /> : null}
      </div>
    </Card>

    <Card className="gap-3 px-4">
      <div><h2 className="text-sm font-medium text-foreground">{t.pages.capture.notes}</h2><p className="text-xs text-muted-foreground">{t.pages.capture.notesHint}</p></div>
      {closed ? <p className="rounded-md bg-secondary/50 px-3 py-2 text-sm text-secondary-foreground">{report.notes ?? t.common.notAvailable}</p> : <Textarea value={draftNotes} onChange={(event) => setNotes(event.target.value)} placeholder={t.pages.capture.notesPlaceholder} rows={5} />}
      {!closed && report.mutationId ? <div className="space-y-2 rounded-lg border border-border p-3"><label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={disputeFound} onCheckedChange={(value) => setDisputeFound(value === true)} />{t.pages.capture.disputeFound}</label>{disputeFound ? <Textarea value={disputeDescription} onChange={(event) => setDisputeDescription(event.target.value)} placeholder={t.pages.capture.disputeDescription} /> : null}</div> : null}
      {!closed ? <>{review.blockers.length > 0 ? <Alert><AlertDescription><span className="font-medium">{t.pages.capture.needsBefore}</span><ul className="mt-1 list-disc space-y-0.5 pl-4">{review.blockers.map((blocker) => <li key={blocker.code}>{blockerText(t, blocker)}</li>)}</ul></AlertDescription></Alert> : null}<Button className="w-fit" disabled={!active || !review.canFile} onClick={() => void file()}><Send className="size-3.5" />{t.pages.capture.fileReport}</Button></> : report.submittedAt ? <p className="text-xs text-muted-foreground">{t.pages.visits.submitted(f.dateTime(report.submittedAt))}</p> : null}
    </Card>
  </div>;
}
