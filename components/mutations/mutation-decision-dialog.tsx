"use client";

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useMutationDecision } from "@/hooks/queries";
import { useStatusMeta } from "@/lib/i18n/status";
import { useT } from "@/lib/i18n/provider";
import type { Mutation } from "@/lib/types";

export function MutationDecisionDialog({
  mutation,
  decision,
  open,
  onOpenChange,
  onSuccess,
}: {
  mutation: Mutation;
  decision: "approve" | "reject";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const t = useT();
  const s = useStatusMeta();
  const decide = useMutationDecision(mutation.id);
  const [note, setNote] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const rejecting = decision === "reject";

  const trimmedNote = note.trim();
  const canSubmit = !decide.isPending && (!rejecting || Boolean(trimmedNote));

  function submit() {
    if (!canSubmit) {
      if (rejecting) setReasonError(true);
      return;
    }

    decide.mutate(
      rejecting
        ? { decision: "reject", rejectionReason: trimmedNote }
        : { decision: "approve", ...(trimmedNote ? { approvalNote: trimmedNote } : {}) },
      {
        onSuccess: () => {
          toast.success(
            rejecting ? t.pages.mutations.rejectedTitle : t.pages.mutations.approvedTitle,
            {
              description: rejecting
                ? t.pages.mutations.rejectedBody(mutation.mutationNumber)
                : t.pages.mutations.approvedBody(
                    mutation.mutationNumber,
                    mutation.parcelDagNo,
                    mutation.toOwnerName,
                  ),
            },
          );
          onSuccess?.();
          if (!onSuccess) onOpenChange(false);
        },
        onError: () =>
          toast.error(t.pages.mutations.failedTitle, {
            description: t.pages.mutations.failedBody,
          }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {rejecting ? t.pages.mutations.rejectionTitle : t.pages.mutations.approvalTitle}
          </DialogTitle>
          <DialogDescription>
            {rejecting
              ? t.pages.mutations.confirmReject(mutation.mutationNumber)
              : t.pages.mutations.confirmApprove(mutation.toOwnerName, mutation.parcelDagNo)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg bg-muted/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip>{mutation.mutationNumber}</IdChip>
            <IdChip icon={MapPin}>{mutation.parcelDagNo}</IdChip>
            <StatusMetaBadge meta={s.mutation[mutation.status]} />
          </div>
          <p className="text-sm text-foreground">
            {mutation.fromOwnerName} → {mutation.toOwnerName}
          </p>
          <p className="text-xs text-muted-foreground">{t.pages.mutations.currentStatus}</p>
        </div>

        <div className="space-y-2">
          <label htmlFor={`mutation-decision-${mutation.id}`} className="font-medium text-foreground">
            {rejecting ? t.pages.mutations.rejectionReason : t.pages.mutations.approvalNote}
          </label>
          <Textarea
            id={`mutation-decision-${mutation.id}`}
            value={note}
            disabled={decide.isPending}
            aria-required={rejecting ? "true" : undefined}
            aria-invalid={reasonError || undefined}
            onChange={(event) => {
              setNote(event.target.value);
              setReasonError(false);
            }}
          />
          <p className={reasonError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {reasonError
              ? t.pages.mutations.rejectionReasonRequired
              : rejecting
                ? t.pages.mutations.rejectionReasonHint
                : t.pages.mutations.approvalNoteHint}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={decide.isPending} onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant={rejecting ? "destructive" : "default"}
            disabled={!canSubmit}
            onClick={submit}
          >
            {decide.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {decide.isPending
              ? rejecting
                ? t.pages.mutations.rejecting
                : t.pages.mutations.approving
              : rejecting
                ? t.pages.mutations.yesReject
                : t.pages.mutations.yesApprove}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
