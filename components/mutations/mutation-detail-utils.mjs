/**
 * A preview may either stay within this app or point to a conventional web
 * endpoint. Everything else is an unavailable preview, not a navigation.
 */
export function isUsableMutationPreviewUrl(value) {
  if (typeof value !== "string") return false;

  const url = value.trim();
  if (!url) return false;

  // A leading backslash is treated as a slash by some URL consumers, so it
  // must not turn a nominally local path into an external authority URL.
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) {
    return true;
  }
  if (!/^https?:\/\//i.test(url)) return false;

  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
