/**
 * A preview may either stay within this app or point to a conventional web
 * endpoint. Everything else is an unavailable preview, not a navigation.
 */
const AUDIT_ACTIONS = new Set(["create", "status-change", "approve", "reject"]);
const WORKFLOW_ACTIONS = new Set([
  "start-verification",
  "verify",
  "complete-verification",
  "start-objection-period",
  "file-objection",
  "objection-added",
  "objection-resolved",
]);

export function mutationTimelineActionGroup(action) {
  if (AUDIT_ACTIONS.has(action)) return "audit";
  if (WORKFLOW_ACTIONS.has(action)) return "workflow";
  return "unknown";
}

/**
 * @param {import("../../lib/types").MutationDetail | undefined} detail
 * @param {string | undefined} [fallbackIdentifier]
 */
export function mutationDetailPresentation(detail, fallbackIdentifier) {
  return {
    identifier: detail?.mutation.mutationNumber ?? fallbackIdentifier,
    currentStatus: detail?.mutation.status ?? null,
    documents: (detail?.documents ?? []).map((document) => ({
      document,
      verificationStatus: document.verificationStatus,
    })),
  };
}

export function isUsableMutationPreviewUrl(value) {
  if (typeof value !== "string") return false;

  const url = value.trim();
  if (!url) return false;

  // A leading backslash is treated as a slash by some URL consumers, so it
  // must not turn a nominally local path into an external authority URL.
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) {
    return true;
  }
  // `new URL()` normalizes a third slash into a hostname. Require exactly the
  // scheme delimiter followed immediately by a real authority character.
  if (!/^https?:\/\/(?![\\/])/i.test(url)) return false;

  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
