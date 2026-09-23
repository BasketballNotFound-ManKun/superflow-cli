import { describe, expect, it } from "vitest";
import { auditContextFiles } from "../../src/domains/context-audit.js";

describe("CONTEXT / ADR audit", () => {
  it("accepts business terminology and complete ADR", () => {
    const result = auditContextFiles([
      { path: "CONTEXT.md", content: "- 站点: 车辆充电服务发生的业务地点\n" },
      { path: "docs/ADR/001-storage.md", content: "# 记录\n## Status\n## Context\n## Decision\n## Alternatives\n## Consequences\n" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.terminology.total).toBe(1);
  });

  it("reports implementation details and incomplete ADR without blocking warnings", () => {
    const result = auditContextFiles([
      { path: "context.md", content: "- 站点: class SiteEntity\n" },
      { path: "adr/001.md", content: "## Status\n## Decision\n" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.terminology.invalid[0]).toContain("实现细节");
    expect(result.adr.invalid[0]).toContain("缺少");
  });

  it("does not require ADR for a repository without one", () => {
    const result = auditContextFiles([{ path: "CONTEXT.md", content: "- 场站: 停车和充电发生的业务地点\n" }]);
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("仅当决定不可逆");
  });
});
