/**
 * Returns the reference form that an officer UI may display without exposing
 * the stored national identifier. Already-masked seed/import data is preserved.
 */
export function maskNationalId(value: string | null | undefined): string | undefined {
  const identifier = value?.trim();
  if (!identifier) return undefined;
  if (/^•••• •••• \d{4}$/u.test(identifier)) return identifier;
  return `•••• •••• ${identifier.slice(-4)}`;
}
