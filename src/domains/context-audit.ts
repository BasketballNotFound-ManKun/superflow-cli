export interface ContextAuditResult {
  contextFiles: string[];
  adrFiles: string[];
  terminology: { total: number; invalid: string[] };
  adr: { valid: string[]; invalid: string[] };
  warnings: string[];
  ok: boolean;
}

const ADR_HEADINGS = ["Status", "Context", "Decision", "Alternatives", "Consequences"];

export function auditContextFiles(files: Array<{ path: string; content: string }>): ContextAuditResult {
  const contextFiles = files.filter((file) => /(^|\/)(?:CONTEXT|context)\.md$/.test(file.path));
  const adrFiles = files.filter((file) => /(^|\/)(?:adr|ADR)\/.*\.md$/.test(file.path));
  const invalidTerms: string[] = [];
  let totalTerms = 0;
  for (const file of contextFiles) {
    for (const line of file.content.split(/\r?\n/)) {
      const match = line.match(/^\s*[-*]\s+`?([^:`]+)`?\s*:\s*(.+)$/);
      if (!match) continue;
      totalTerms += 1;
      if (/[{}]|\b(class|interface|SELECT|INSERT|UPDATE|DELETE|public|private)\b/i.test(match[2])) {
        invalidTerms.push(`${file.path}: ${match[1].trim()} 含实现细节`);
      }
    }
  }
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const file of adrFiles) {
    const missing = ADR_HEADINGS.filter((heading) =>
      !new RegExp(`^#{1,6}\\s+${heading}\\s*$`, "mi").test(file.content));
    (missing.length ? invalid : valid).push(
      missing.length ? `${file.path}: 缺少 ${missing.join("、")}` : file.path,
    );
  }
  const warnings: string[] = [];
  if (contextFiles.length === 0) warnings.push("未找到 CONTEXT.md；术语不会被长期复用");
  if (adrFiles.length === 0) warnings.push("未找到 ADR；仅当决定不可逆且存在备选方案时才需要新增");
  if (invalidTerms.length) warnings.push("CONTEXT 术语应描述业务语言，不应写实现细节");
  return {
    contextFiles: contextFiles.map((file) => file.path),
    adrFiles: adrFiles.map((file) => file.path),
    terminology: { total: totalTerms, invalid: invalidTerms },
    adr: { valid, invalid }, warnings,
    ok: invalidTerms.length === 0 && invalid.length === 0,
  };
}
