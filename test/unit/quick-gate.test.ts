import { describe, expect, it } from "vitest";
import { auditQuickSpec, evaluateQuickGate } from "../../src/domains/quick-dev/gate.js";

describe("quick development gate", () => {
  it("accepts a single existing-seam validation change", () => {
    const result = evaluateQuickGate({
      request: "修复现有邮箱格式校验的边界判断",
      changedFiles: ["src/validation/email.ts"],
      testSeam: "src/validation/email.test.ts",
    });
    expect(result.verdict).toBe("QUICK");
    expect(result.reasons).toEqual([]);
  });

  it.each([
    ["增加公开 API 接口", "公共接口或 API 契约"],
    ["新增数据库迁移", "数据库或持久化"],
    ["修复并发锁竞争", "事务、并发或锁"],
    ["调整支付退款规则", "支付或资金语义"],
  ])("stops high-risk work: %s", (request, reason) => {
    const result = evaluateQuickGate({
      request,
      changedFiles: ["src/service.ts"],
      testSeam: "src/service.test.ts",
    });
    expect(result.verdict).toBe("STOP");
    expect(result.reasons).toContain(reason);
  });

  it("stops when more than one task scope is changed", () => {
    const result = evaluateQuickGate({
      request: "修复输入校验",
      changedFiles: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"],
      testSeam: "src/a.test.ts",
    });
    expect(result.verdict).toBe("STOP");
  });

  it("requires the Quick Spec shape and accepts a ready draft", () => {
    const draft = [
      "---", "status: draft", "baseline: abcdef012345", "---",
      "## Intent", "fix the boundary", "## Non-goals", "no API change",
      "## Current behavior", "accepts a@", "## Target behavior", "rejects a@",
      "## Test seam", "existing email test", "## Implementation steps", "one condition",
      "## Acceptance Criteria", "Given a@ Then reject", "## Risks", "keep old callers",
    ].join("\n");
    expect(auditQuickSpec(draft)).toMatchObject({ ok: true, status: "draft" });
    expect(auditQuickSpec("status: draft\n## Intent").ok).toBe(false);
  });

  it("invalidates an approved Quick Spec when its content changes", () => {
    const draft = [
      "status: draft", "baseline: abcdef012345", "## Intent", "fix email validation", "## Non-goals", "no API change",
      "## Current behavior", "accepts a@", "## Target behavior", "rejects a@",
      "## Test seam", "existing email test", "## Implementation steps", "one condition",
      "## Acceptance Criteria", "Given a@ Then reject", "## Risks", "keep old callers",
    ].join("\n");
    const digest = auditQuickSpec(draft).digest;
    const approved = draft.replace("status: draft", "status: ready-for-dev") +
      `\napproved-digest: ${digest}\n`;
    expect(auditQuickSpec(approved).ok).toBe(true);
    expect(auditQuickSpec(approved.replace("no API change", "change API")).ok)
      .toBe(false);
  });

  it("stops when the test seam is missing or the source path is high risk", () => {
    expect(evaluateQuickGate({
      request: "修复输入校验",
      changedFiles: ["src/a.ts"],
    }).verdict).toBe("STOP");
    expect(evaluateQuickGate({
      request: "修复查询条件",
      changedFiles: ["src/main/resources/OrderMapper.xml"],
      testSeam: "src/test/OrderMapperTest.java",
    }).verdict).toBe("STOP");
  });

  it("stops when a related SDD change owns the behavior", () => {
    const result = evaluateQuickGate({
      request: "修复邮箱边界",
      changedFiles: ["src/email.ts"],
      testSeam: "src/email.test.ts",
      activeSddChange: true,
    });
    expect(result.verdict).toBe("STOP");
    expect(result.reasons).toContain("存在相关在途 SDD 变更");
    expect(result.nextSkill).toBe("superflow-clarify");
  });
});
