"use client";

import { useMemo } from "react";
import type { StatusTone } from "@/lib/types";
import type { StatusMeta } from "@/lib/status";
import {
  disputeStatusTone,
  fieldReportStatusTone,
  hearingStatusTone,
  mutationStatusTone,
  ocrStatusTone,
  priorityTone,
  registryStatusTone,
  userStatusTone,
  verificationStatusTone,
} from "@/lib/status";
import { useT } from "./provider";

/** Pair a tone map with the matching label block, key for key. */
function pair<K extends string>(
  tones: Record<K, StatusTone>,
  labels: Record<K, string>,
): Record<K, StatusMeta> {
  const out = {} as Record<K, StatusMeta>;
  for (const key of Object.keys(tones) as K[]) {
    out[key] = { tone: tones[key], label: labels[key] };
  }
  return out;
}

/**
 * The `{ tone, label }` maps badges take, in the reader's language.
 * `const s = useStatusMeta()` then `<StatusMetaBadge meta={s.dispute[d.status]} />`.
 */
export function useStatusMeta() {
  const t = useT();
  return useMemo(
    () => ({
      registry: pair(registryStatusTone, t.status.registry),
      dispute: pair(disputeStatusTone, t.status.dispute),
      priority: pair(priorityTone, t.status.priority),
      mutation: pair(mutationStatusTone, t.status.mutation),
      ocr: pair(ocrStatusTone, t.status.ocr),
      verification: pair(verificationStatusTone, t.status.verification),
      fieldReport: pair(fieldReportStatusTone, t.status.fieldReport),
      hearing: pair(hearingStatusTone, t.status.hearing),
      user: pair(userStatusTone, t.status.user),
    }),
    [t],
  );
}
