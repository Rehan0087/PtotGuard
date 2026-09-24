import type { LandDocument } from "@plotguard/rules";

function usableUrl(value?: string): string | null {
  const url = value?.trim();
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** Resolve the stored scan used by both officer review queues. */
export function documentPreviewUrl(document: LandDocument): string | null {
  const explicit = usableUrl(document.thumbnailUrl);
  if (explicit) return explicit;
  if (!document.parcelId || !document.fileName.trim()) return null;
  return `/documents/${encodeURIComponent(document.parcelId)}/${encodeURIComponent(document.fileName)}`;
}
