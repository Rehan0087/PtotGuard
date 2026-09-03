"use client";

import { useCallback } from "react";
import type { AppNotification, DisputeEvent } from "@/lib/types";
import { useT } from "./provider";

/**
 * Renders system-generated record text in the reader's language.
 *
 * Both hooks fall back to the stored `title`/`body` when a record carries no
 * structured `content` — older rows, and anything a human actually typed. The
 * boundary is deliberate: a status change is generated per reader and should
 * follow their language; a clerk's case note is evidence and stays as filed.
 */

export function useNotificationText() {
  const t = useT();

  return useCallback(
    (notification: AppNotification): { title: string; body: string } => {
      const c = notification.content;
      if (!c) return { title: notification.title, body: notification.body };

      switch (c.code) {
        case "dispute-status":
          return t.notifications["dispute-status"](
            c.caseNumber,
            t.status.dispute[c.status],
          );
        case "dispute-assigned":
          return t.notifications["dispute-assigned"](c.caseNumber);
        case "dispute-ruled":
          return t.notifications["dispute-ruled"](c.caseNumber);
        case "hearing-scheduled":
          return t.notifications["hearing-scheduled"](c.caseNumber);
        case "document-verified":
          return t.notifications["document-verified"](c.dagNo);
        case "document-unclear":
          return t.notifications["document-unclear"](c.dagNo);
        case "document-processed":
          return t.notifications["document-processed"](c.fileName);
        case "survey-scheduled":
          return t.notifications["survey-scheduled"](c.dagNo);
        case "mutation-verification":
          return t.notifications["mutation-verification"](c.mutationNumber, c.dagNo);
        case "welcome":
          return t.notifications.welcome();
      }
    },
    [t],
  );
}

/** The headline of a timeline entry. `description` is left as recorded. */
export function useDisputeEventTitle() {
  const t = useT();

  return useCallback(
    (event: DisputeEvent): string => {
      const c = event.content;
      if (!c) return event.title;

      switch (c.code) {
        case "filed":
          return t.disputeEvents.filed;
        case "assigned":
          return t.disputeEvents.assigned(c.to);
        case "evidence-added":
          return t.disputeEvents["evidence-added"];
        case "status-change":
          return t.disputeEvents["status-change"](t.status.dispute[c.status]);
        case "hearing-held":
          return t.disputeEvents["hearing-held"](c.ordinal);
        case "field-visit-scheduled":
          return t.disputeEvents["field-visit-scheduled"];
        case "field-visit-completed":
          return t.disputeEvents["field-visit-completed"];
        case "ruled":
          return t.disputeEvents.ruled;
      }
    },
    [t],
  );
}
