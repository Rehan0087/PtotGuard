"use client";

import { useRef, useState } from "react";
import { Upload, FileText, X, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUploadDocument, useParcels } from "@/hooks/queries";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import type { DocumentType } from "@/lib/types";

/**
 * The order the counter offers them in — commonest first. Labels come from
 * `t.pages.upload.types`, which uses what people actually call these documents
 * rather than the enum's English name.
 */
const DOC_TYPES = [
  "title-deed",
  "sale-deed",
  "inheritance-affidavit",
  "tax-receipt",
  "id-proof",
  "court-order",
  "survey-report",
  "photo",
] as const satisfies readonly DocumentType[];

const ACCEPT = ".pdf,.jpg,.jpeg,.png";
const MAX_BYTES = 20 * 1024 * 1024;

export function UploadDocumentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const f = useFmt();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocumentType>("title-deed");
  const [parcelId, setParcelId] = useState<string>("none");
  const [dragging, setDragging] = useState(false);

  const upload = useUploadDocument();
  const { data: parcelsData } = useParcels({ owner: "me", pageSize: 100 });
  const parcels = parcelsData?.items ?? [];

  function reset() {
    setFile(null);
    setDocType("title-deed");
    setParcelId("none");
    setDragging(false);
  }

  function accept(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error(t.pages.upload.tooLargeTitle, { description: t.pages.upload.tooLargeBody });
      return;
    }
    setFile(f);
  }

  function onSubmit() {
    if (!file) return;
    upload.mutate(
      {
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        sizeBytes: file.size,
        type: docType,
        ...(parcelId !== "none" ? { parcelId } : {}),
      },
      {
        onSuccess: (doc) => {
          toast.success(t.pages.upload.receivedTitle, {
            description: t.pages.upload.receivedBody(doc.fileName),
          });
          reset();
          onOpenChange(false);
        },
        onError: () =>
          toast.error(t.pages.upload.failedTitle, { description: t.pages.upload.failedBody }),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.pages.upload.title}</DialogTitle>
          <DialogDescription>{t.pages.upload.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone / selected file */}
          {file ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                <FileText className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{file.name}</div>
                <div className="tabular text-xs text-muted-foreground">
                  {f.fileSize(file.size)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.pages.upload.removeFile}
                onClick={() => setFile(null)}
              >
                <X />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                accept(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
                dragging
                  ? "border-marker bg-marker/5"
                  : "border-border hover:border-marker/50 hover:bg-muted/40",
              )}
            >
              <Upload className="size-5 text-marker" />
              <span className="text-sm font-medium text-foreground">
                {t.pages.upload.dropHere}
              </span>
              <span className="text-xs text-muted-foreground">{t.pages.upload.constraints}</span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => accept(e.target.files?.[0])}
          />

          {/* Document type */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              {t.pages.upload.documentType}
            </span>
            <Select
              value={docType}
              onValueChange={(v) => setDocType(v as DocumentType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string) =>
                    t.pages.upload.types[v as (typeof DOC_TYPES)[number]] ??
                    t.pages.upload.selectType
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t.pages.upload.types[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional parcel link */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              {t.pages.upload.linkParcel}{" "}
              <span className="text-muted-foreground">({t.common.optional})</span>
            </span>
            <Select value={parcelId} onValueChange={(v) => setParcelId(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string) =>
                    v === "none"
                      ? t.pages.upload.notLinked
                      : (() => {
                          const p = parcels.find((x) => x.id === v);
                          return p ? `${p.dagNo} · ${p.title}` : t.pages.upload.notLinked;
                        })()
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t.pages.upload.notLinked}</SelectItem>
                {parcels.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <MapPin className="size-3.5 opacity-60" />
                    {p.dagNo} · {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upload.isPending}>
            {t.common.cancel}
          </Button>
          <Button onClick={onSubmit} disabled={!file || upload.isPending}>
            {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {t.pages.upload.upload}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
