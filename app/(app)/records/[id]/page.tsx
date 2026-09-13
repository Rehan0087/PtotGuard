"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  History,
  MapPin,
  Scale,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { DisputeListItem } from "@/components/dispute-list-item";
import { IdChip } from "@/components/id-chip";
import { MutationDetailDialog } from "@/components/mutations/mutation-detail-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLandRecord } from "@/hooks/queries";
import { ApiError } from "@/lib/api-client";
import { sentenceCase } from "@/lib/format";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import { cn } from "@/lib/utils";
import type { LandRecordOwnershipEvent } from "@/lib/types";
import {
  ownershipTransitions,
  usableRecordDocumentUrl,
} from "@/components/records/record-detail-utils.mjs";

const ParcelLiveMap = dynamic(
  () => import("@/components/parcel-live-map").then((module) => module.ParcelLiveMap),
  { ssr: false, loading: () => <Skeleton className="h-72 w-full rounded-lg" /> },
);

function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id?: string;
  title: string;
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-foreground">
        <Icon className="size-4 text-marker" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function LandRecordDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const record = useLandRecord(id);
  const [selectedMutationId, setSelectedMutationId] = useState<string>();
  const ownership = useMemo(
    () => ownershipTransitions(record.data?.ownership ?? []) as (LandRecordOwnershipEvent & { previousOwnerName?: string })[],
    [record.data?.ownership],
  );
  const mapParcels = useMemo(
    () => (record.data ? [record.data.parcel] : []),
    [record.data],
  );

  if (record.isLoading) {
    return (
      <div className="space-y-6" aria-label={t.pages.records.loadingDetail}>
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-52 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (record.isError || !record.data) {
    const notFound = record.error instanceof ApiError && record.error.status === 404;
    return (
      <div className="space-y-6">
        <Link href="/records" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
          <ArrowLeft className="size-4" />
          {t.pages.records.backToRecords}
        </Link>
        <Card className="items-center p-8 text-center">
          <h1 className="font-heading text-lg font-semibold">
            {notFound ? t.pages.records.notFoundTitle : t.pages.records.loadFailedTitle}
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {notFound ? t.pages.records.notFoundBody : t.pages.records.loadFailedBody}
          </p>
          {!notFound ? (
            <Button variant="outline" onClick={() => void record.refetch()}>{t.common.retry}</Button>
          ) : null}
        </Card>
      </div>
    );
  }

  const { parcel, owner, jurisdiction, mutations, disputes, documents, restrictions, audit } = record.data;
  const jurisdictionText = jurisdiction.map((item) => item.name).join(" · ");

  return (
    <div className="space-y-6">
      <Link href="/records" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
        <ArrowLeft className="size-4" />
        {t.pages.records.backToRecords}
      </Link>

      <PageHeader
        eyebrow={t.nav.portals.landOffice}
        title={parcel.title}
        description={t.pages.records.detailDescription(parcel.dagNo, parcel.khatianNo)}
      >
        <StatusMetaBadge meta={s.registry[parcel.registryStatus]} />
      </PageHeader>

      <nav className="flex flex-wrap gap-2" aria-label={t.pages.records.recordActions}>
        <a href="#location" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <MapPin className="size-4" /> {t.pages.records.viewGis}
        </a>
        <a href="#documents" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <FileText className="size-4" /> {t.pages.records.viewDocuments}
        </a>
        <a href="#audit" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <ShieldCheck className="size-4" /> {t.pages.records.viewAudit}
        </a>
        <Link href="/mutations" className={cn(buttonVariants({ size: "sm" }))}>
          <ClipboardList className="size-4" /> {t.pages.records.mutationQueue}
        </Link>
      </nav>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Section title={t.pages.records.landInformation} icon={ClipboardList}>
            <Card className="p-4">
              <Facts rows={[
                { label: t.pages.records.landId, value: parcel.ulpin ? <IdChip>{parcel.ulpin}</IdChip> : t.common.notAvailable },
                { label: t.pages.records.dag, value: <IdChip>{parcel.dagNo}</IdChip> },
                { label: t.pages.records.khatian, value: parcel.khatianNo },
                { label: t.pages.records.landUse, value: t.domain.landUse[parcel.landUse] },
                { label: t.pages.records.area, value: f.area(parcel.area) },
                { label: t.pages.records.registered, value: f.date(parcel.registeredAt) },
                { label: t.pages.records.lastMutation, value: parcel.lastMutationAt ? f.date(parcel.lastMutationAt) : t.common.notAvailable },
                { label: t.pages.records.jurisdiction, value: jurisdictionText || t.common.notAvailable },
              ]} />
            </Card>
          </Section>

          <Section title={t.pages.records.currentOwner} icon={UserRound}>
            <Card className="p-4">
              <Facts rows={[
                { label: t.pages.records.ownerName, value: owner.name },
                { label: t.pages.records.ownerReference, value: owner.referenceId ?? t.common.notAvailable },
                { label: t.pages.records.ownerAddress, value: owner.address ?? t.common.notAvailable },
                { label: t.pages.records.ownershipType, value: t.domain.ownershipType[parcel.ownershipType] },
              ]} />
            </Card>
          </Section>

          <Section title={t.pages.records.ownershipHistory} icon={History}>
            <Card className="gap-0 px-0 py-1">
              {ownership.length ? (
                <ol className="divide-y divide-border">
                  {ownership.map((entry) => (
                    <li key={entry.id} className="space-y-2 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">{entry.ownerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.domain.acquisitionType[entry.acquisitionType]} · {f.date(entry.fromDate)} – {entry.toDate ? f.date(entry.toDate) : t.pages.records.present}
                          </p>
                        </div>
                        {entry.toDate === null ? <StatusMetaBadge meta={{ tone: "verified", label: t.pages.records.current }} /> : null}
                      </div>
                      {entry.previousOwnerName ? (
                        <p className="text-xs text-muted-foreground">
                          {t.pages.records.transferredFrom(entry.previousOwnerName)}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {entry.mutation ? <span>{t.pages.records.mutationReference(entry.mutation.mutationNumber)}</span> : null}
                        {entry.document ? <span>{t.pages.records.documentReference(entry.document.fileName)}</span> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p className="p-4 text-sm text-muted-foreground">{t.pages.records.noOwnershipHistory}</p>}
            </Card>
          </Section>

          <Section title={t.pages.records.mutationHistory} icon={ClipboardList}>
            <Card className="gap-0 px-0 py-1">
              {mutations.length ? (
                <ul className="divide-y divide-border">
                  {mutations.map(({ mutation, applicantName, responsibleOfficerName }) => (
                    <li key={mutation.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <IdChip>{mutation.mutationNumber}</IdChip>
                          <StatusMetaBadge meta={s.mutation[mutation.status]} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t.domain.mutationType[mutation.type]} · {f.date(mutation.requestedAt)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t.pages.records.mutationPeople(applicantName ?? t.common.unknown, responsibleOfficerName ?? t.common.notAvailable)}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedMutationId(mutation.id)}>
                        {t.common.view}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : <p className="p-4 text-sm text-muted-foreground">{t.pages.records.noMutations}</p>}
            </Card>
          </Section>
        </div>

        <div className="space-y-6">
          <Section id="location" title={t.pages.records.plotLocation} icon={MapPin}>
            <Card className="gap-3 p-4">
              <ParcelLiveMap
                parcels={mapParcels}
                focusId={parcel.id}
                hrefBase="/records"
              />
              <Facts rows={[
                { label: t.pages.records.coordinates, value: `${parcel.centroid.lat.toFixed(5)}, ${parcel.centroid.lng.toFixed(5)}` },
                { label: t.pages.records.boundary, value: parcel.boundary ? t.pages.records.boundaryRecorded : t.pages.records.boundaryUnavailable },
              ]} />
            </Card>
          </Section>

          <Section title={t.pages.records.restrictions} icon={ShieldCheck}>
            <Card className="gap-0 px-0 py-1">
              {restrictions.length ? (
                <ul className="divide-y divide-border">
                  {restrictions.map((restriction) => (
                    <li key={restriction.id} className="px-4 py-3">
                      <p className="font-medium text-foreground">{sentenceCase(restriction.type)}</p>
                      <p className="text-xs text-muted-foreground">
                        {restriction.authority} · {restriction.referenceNo ?? t.common.notAvailable}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : <p className="p-4 text-sm text-muted-foreground">{t.pages.records.noRestrictions}</p>}
            </Card>
          </Section>

          <Section title={t.pages.records.disputes} icon={Scale}>
            <div className="space-y-2">
              {disputes.length ? disputes.map((dispute) => <DisputeListItem key={dispute.id} dispute={dispute} />) : (
                <Card className="p-4 text-sm text-muted-foreground">{t.pages.records.noDisputes}</Card>
              )}
            </div>
          </Section>

          <Section id="documents" title={t.pages.records.documents} icon={FileText}>
            <Card className="gap-0 px-0 py-1">
              {documents.length ? (
                <ul className="divide-y divide-border">
                  {documents.map((document) => {
                    const url = usableRecordDocumentUrl(document.thumbnailUrl);
                    return (
                      <li key={document.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">{document.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.domain.documentType[document.type]} · {f.date(document.uploadedAt)}
                          </p>
                        </div>
                        <StatusMetaBadge meta={s.verification[document.verificationStatus]} dot={false} />
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                            {t.common.view}
                          </a>
                        ) : (
                          <Button variant="ghost" size="sm" disabled>{t.pages.records.fileUnavailable}</Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="p-4 text-sm text-muted-foreground">{t.pages.records.noDocuments}</p>}
            </Card>
          </Section>

          <Section id="audit" title={t.pages.records.auditHistory} icon={ShieldCheck}>
            <Card className="gap-0 px-0 py-1">
              {audit.length ? (
                <ol className="divide-y divide-border">
                  {audit.map((event) => (
                    <li key={event.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-foreground">{sentenceCase(event.action)}</p>
                        <span className="text-xs text-muted-foreground">{f.dateTime(event.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t.pages.records.auditBy(event.actorName ?? t.common.unknown, event.entityType)}
                      </p>
                      {Object.keys(event.payload).length ? (
                        <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                          {Object.entries(event.payload).map(([key, value]) => (
                            <div key={key} className="flex gap-2">
                              <dt>{sentenceCase(key)}:</dt>
                              <dd className="break-all text-foreground">{String(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : <p className="p-4 text-sm text-muted-foreground">{t.pages.records.noAudit}</p>}
            </Card>
          </Section>
        </div>
      </div>

      <MutationDetailDialog
        mutationId={selectedMutationId}
        open={Boolean(selectedMutationId)}
        onOpenChange={(open) => {
          if (!open) setSelectedMutationId(undefined);
        }}
      />
    </div>
  );
}
