export function ownershipTransitions(entries) {
  const ordered = [...entries].sort((a, b) => b.fromDate.localeCompare(a.fromDate));
  return ordered.map((entry, index) => ({
    ...entry,
    previousOwnerName: ordered[index + 1]?.ownerName,
  }));
}

export function usableRecordDocumentUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const url = value.trim();
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
