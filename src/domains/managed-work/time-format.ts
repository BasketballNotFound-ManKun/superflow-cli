/**
 * Human-readable timestamp rendering for managed-task artifacts.
 *
 * Machine-readable JSON keeps ISO-8601 UTC; only human-facing surfaces
 * (progress.md timelines, status output, review facts markdown) render
 * through this helper so wall-clock correlation no longer requires manual
 * UTC-offset conversion.
 */

const TIME_PARTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
};

/** Resolves the display time zone: SUPERFLOW_TZ override, else system zone. */
export function managedTimeZone(): string {
  const override = process.env.SUPERFLOW_TZ?.trim();
  if (override) return override;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function zoneOffsetLabel(date: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(date);
    const raw = parts.find((part) => part.type === "timeZoneName")?.value;
    if (!raw) return null;
    if (raw === "GMT") return "+00:00";
    const match = /^GMT([+-])(\d{2})(?::?(\d{2}))?$/.exec(raw);
    if (!match) return null;
    return `${match[1]}${match[2]}:${match[3] ?? "00"}`;
  } catch {
    return null;
  }
}

/**
 * Renders an ISO-8601 timestamp as "YYYY-MM-DD HH:mm:ss +HH:MM" in the
 * display time zone. Returns the original input when parsing or formatting
 * fails, so callers never lose the raw value.
 */
export function formatManagedTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const timeZone = managedTimeZone();
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      ...TIME_PARTS,
    }).formatToParts(date);
    const value = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const offset = zoneOffsetLabel(date, timeZone);
    const rendered = `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}:${value("second")}`;
    return offset ? `${rendered} ${offset}` : rendered;
  } catch {
    return iso;
  }
}
