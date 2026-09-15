"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useCompleteMutationVerification } from "@/hooks/queries";
import { useT } from "@/lib/i18n/provider";
import type { Mutation, MutationVerificationChecklist } from "@/lib/types";

const CHECKLIST_KEYS: (keyof MutationVerificationChecklist)[] = [
  "applicantVerified",
  "previousOwnerVerified",
  "proposedOwnerVerified",
  "dagKhatianVerified",
  "deedVerified",
  "landRecordMatched",
  "documentsPresent",
  "khajnaReceiptVerified",
];

const EMPTY_CHECKLIST: MutationVerificationChecklist = {
  applicantVerified: false,
  previousOwnerVerified: false,
  proposedOwnerVerified: false,
  dagKhatianVerified: false,
  deedVerified: false,
  landRecordMatched: false,
  documentsPresent: false,
  khajnaReceiptVerified: false,
};

export function MutationVerificationForm({
  mutation,
  onSuccess,
}: {
  mutation: Mutation;
  onSuccess: () => void;
}) {
  const t = useT();
  const complete = useCompleteMutationVerification(mutation.id);
  const [checklist, setChecklist] = useState<MutationVerificationChecklist>(EMPTY_CHECKLIST);
  const [notes, setNotes] = useState("");

  const canSubmit = useMemo(
    () => CHECKLIST_KEYS.every((key) => checklist[key]) && Boolean(notes.trim()) && !complete.isPending,
    [checklist, complete.isPending, notes],
  );

  function submit() {
    if (!canSubmit) return;

    complete.mutate(
      { ...checklist, notes: notes.trim() },
      {
        onSuccess: () => {
          toast.success(t.pages.mutations.verificationCompletedTitle, {
            description: t.pages.mutations.verificationCompletedBody,
          });
          onSuccess();
        },
        onError: () => {
          // Do not reset the form: the officer can correct or retry the exact
          // server-rejected attestation without re-entering seven checks.
          toast.error(t.pages.mutations.verificationFailedTitle, {
            description: t.pages.mutations.verificationFailedBody,
          });
        },
      },
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <fieldset className="space-y-3">
        <legend className="font-medium text-foreground">{t.pages.mutations.checklist}</legend>
        {CHECKLIST_KEYS.map((key) => {
          const id = `mutation-${mutation.id}-${key}`;
          return (
            <label key={key} htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                id={id}
                checked={checklist[key]}
                disabled={complete.isPending}
                onCheckedChange={(checked) =>
                  setChecklist((current) => ({ ...current, [key]: checked === true }))
                }
              />
              <span>{t.pages.mutations[key]}</span>
            </label>
          );
        })}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor={`mutation-${mutation.id}-notes`} className="font-medium text-foreground">
          {t.pages.mutations.notes}
        </label>
        <Textarea
          id={`mutation-${mutation.id}-notes`}
          value={notes}
          disabled={complete.isPending}
          onChange={(event) => setNotes(event.target.value)}
          aria-required="true"
        />
        <p className="text-xs text-muted-foreground">{t.pages.mutations.notesRequired}</p>
      </div>

      <Button type="submit" disabled={!canSubmit}>
        {complete.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {complete.isPending
          ? t.pages.mutations.completingVerification
          : t.pages.mutations.completeVerification}
      </Button>
    </form>
  );
}
