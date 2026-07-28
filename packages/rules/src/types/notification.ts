import type { ID, ISODateString } from "./common";
import type { DisputeStatus } from "./dispute";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

/**
 * The structured form of a system-generated notification: what happened, plus
 * the record it happened to. The client words it in the reader's language
 * (`useNotificationText()`), which a stored English sentence cannot be.
 *
 * Additive and optional, in the same style as `Jurisdiction.nameBn` — a
 * notification without one still renders from its `title`/`body`.
 */
export type NotificationContent =
  | { code: "dispute-status"; caseNumber: string; status: DisputeStatus }
  | { code: "dispute-assigned"; caseNumber: string }
  | { code: "dispute-ruled"; caseNumber: string }
  | { code: "hearing-scheduled"; caseNumber: string; }
  | { code: "document-verified"; dagNo: string }
  | { code: "document-unclear"; dagNo: string }
  | { code: "document-processed"; fileName: string }
  | { code: "survey-scheduled"; dagNo: string }
  | { code: "mutation-verification"; mutationNumber: string; dagNo: string }
  | { code: "welcome" };

export interface AppNotification {
  id: ID;
  userId: ID;
  at: ISODateString;
  severity: NotificationSeverity;
  title: string;
  body: string;
  /** Preferred over `title`/`body` when present. See NotificationContent. */
  content?: NotificationContent;
  read: boolean;
  /** Optional deep link into the app. */
  href?: string;
}
