/**
 * Redaction at every persisted managed-work boundary.
 *
 * Runner telemetry is untrusted: it can contain a complete shell command even
 * when the structured delivery has already been redacted. Keep this module
 * independent of Runner and Journal so both can call the same implementation
 * before writing any user-readable artifact.
 */
export function redactManagedLog(value: string): string {
  const structured = value
    .split(/\r?\n/)
    .map((line) => redactManagedJsonLine(line))
    .join("\n");
  return redactManagedPlainText(structured);
}

export function redactManagedValue<T>(value: T): T {
  return redactManagedStructuredValue(value) as T;
}

function redactManagedPlainText(value: string): string {
  return value
    .replace(
      /("type"\s*:\s*"input_json_delta"[^\r\n]*?"partial_json"\s*:\s*")(?:(?:\\.)|[^"\\])*/g,
      "$1<redacted-tool-input>",
    )
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi, "$1<redacted>")
    .replace(
      /(["']?(?:[a-z0-9]+_)*(?:token|password|secret|cookie|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
      "$1<redacted>",
    )
    .replace(
      /(["']?(?:access|secret)[_-]?key["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
      "$1<redacted>",
    )
    .replace(
      /(\bmysql\b[^\r\n]*?\s(?:-p|--password(?:=|\s+)))\s*(?:'[^']*'|"[^"]*"|[^\s"']+)/g,
      "$1<redacted>",
    )
    .replace(/(\s-p)\s*(?:'[^']*'|"[^"]*"|[^\s"']+)/g, "$1<redacted>")
    .replace(/(https?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, "$1<redacted>@");
}

function redactManagedJsonLine(line: string): string {
  if (!line.trim()) return line;
  try {
    return JSON.stringify(redactManagedJsonValue(JSON.parse(line)));
  } catch {
    if (
      /\\?"type\\?"\s*:\s*\\?"(?:tool_use|tool_result)\\?"/.test(line) ||
      /\\?"tool_use_result\\?"\s*:/.test(line)
    ) {
      return "<redacted-tool-event>";
    }
    return line;
  }
}

function redactManagedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactManagedJsonValue(item));
  }
  if (value === null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const type = typeof source.type === "string" ? source.type : "";
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if (key === "tool_use_result") {
      result[key] = "<redacted-tool-result>";
    } else if (type === "tool_use" && key === "input") {
      result[key] = "<redacted-tool-input>";
    } else if (type === "tool_result" && key === "content") {
      result[key] = "<redacted-tool-result>";
    } else {
      result[key] = redactManagedJsonValue(child);
    }
  }
  return result;
}

function redactManagedStructuredValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactManagedStructuredValue(item));
  }
  if (value === null || typeof value !== "object") {
    return typeof value === "string" ? redactManagedLog(value) : value;
  }
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if (isSensitiveManagedKey(key)) {
      result[key] = "<redacted>";
    } else {
      result[key] = redactManagedStructuredValue(child);
    }
  }
  return result;
}

function isSensitiveManagedKey(key: string): boolean {
  return /^(?:authorization|cookie|password|secret|token|api[_-]?key|access[_-]?key)$/i.test(
    key,
  );
}
