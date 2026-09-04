/**
 * Keeps structured evidence references machine-resolvable while allowing the
 * trailing description suffix emitted by older Executors. The raw delivery JSON is
 * retained unchanged; callers use this only for deterministic path checks.
 */
export function canonicalEvidencePath(value: string): string {
  const trimmed = value.trim();
  const unquoted = trimmed.match(/^`(.+)`$/s)?.[1]?.trim() ?? trimmed;
  const withoutDescription = unquoted
    .replace(/\s+\([^()\r\n]*\)\s*$/u, "")
    .trim();
  return withoutDescription || unquoted;
}
