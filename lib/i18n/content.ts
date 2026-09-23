"use client";

import { useCallback } from "react";
import type { AppNotification, DisputeEvent, ServiceApplicationEvent } from "@/lib/types";
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
        case "dispute-executed":
          return t.notifications["dispute-executed"](c.caseNumber);
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
        default:
          return { title: notification.title, body: notification.body };
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
        case "hearing-adjourned":
          return t.disputeEvents["hearing-adjourned"];
        case "hearing-closed":
          return t.disputeEvents["hearing-closed"];
        case "hearing-appealed":
          return t.disputeEvents["hearing-appealed"];
        case "field-verified":
          return t.disputeEvents["field-verified"];
        case "decided":
          return t.disputeEvents.decided;
        case "records-executed":
          return t.disputeEvents["records-executed"];
        default:
          return event.title;
      }
    },
    [t],
  );
}

/**
 * The headline of a service application's timeline entry.
 *
 * One step coarser than useDisputeEventTitle, because the model is: a
 * ServiceApplicationEvent carries no structured `content`, only a type and a
 * server-written title. So the type is what can be said in the reader's
 * language, and the stored title stays underneath as the specific thing that
 * happened — "Acquisition notice issued" under a generic "Submitted".
 */
export function useServiceApplicationEventTitle() {
  const t = useT();

  return useCallback(
    (event: ServiceApplicationEvent): string => {
      // Indexed loosely on purpose: `type` is a union in the type system but
      // just a string in the row, and an unknown one should read as its title
      // rather than as "undefined".
      const labels = t.serviceApplicationEvents as Record<string, string | undefined>;
      return labels[event.type] ?? event.title;
    },
    [t],
  );
}
