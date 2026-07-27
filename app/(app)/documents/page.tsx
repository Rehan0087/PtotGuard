"use client";

import { useState } from "react";
import { FileText, Upload, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { UploadDocumentDialog } from "@/components/upload-document-dialog";
import { EmptyState } from "@/components/empty-state";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDocuments } from "@/hooks/queries";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";

export default function DocumentsPage() {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const { data, isLoading } = useDocuments({ owner: "me" });
  const [uploadOpen, setUploadOpen] = useState(false);
  const docs = data?.items ?? [];
  const processing = docs.filter(
    (d) => d.ocrStatus === "processing" || d.ocrStatus === "pending",
  ).length;

  return (
    <div className="space-y-6">
      <UploadDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.myDocuments}
        description={t.pages.documents.description}
      >
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="size-3.5" />
          {t.pages.documents.upload}
        </Button>
      </PageHeader>

      {processing > 0 ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-pending/30 bg-pending-soft px-4 py-2.5 text-sm text-pending">
          <Loader2 className="size-4 shrink-0 animate-spin" />
          {t.pages.documents.reading(processing)}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <EmptyState
            className="border-0"
            icon={FileText}
            title={t.pages.documents.emptyTitle}
            description={t.pages.documents.emptyBody}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{t.pages.documents.colDocument}</TableHead>
                <TableHead>{t.pages.documents.colType}</TableHead>
                <TableHead>{t.pages.documents.colOcr}</TableHead>
                <TableHead>{t.pages.documents.colVerification}</TableHead>
                <TableHead className="text-right">{t.pages.documents.colUploaded}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                        <FileText className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{d.fileName}</div>
                        <div className="text-xs text-muted-foreground tabular">
                          {f.fileSize(d.sizeBytes)}
                          {d.pageCount ? ` · ${t.pages.documents.pages(d.pageCount)}` : ""}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.domain.documentType[d.type]}
                  </TableCell>
                  <TableCell>
                    <StatusMetaBadge meta={s.ocr[d.ocrStatus]} dot={false} />
                  </TableCell>
                  <TableCell>
                    <StatusMetaBadge meta={s.verification[d.verificationStatus]} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {f.date(d.uploadedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
