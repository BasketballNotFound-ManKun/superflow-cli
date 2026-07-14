import { describe, expect, it } from "vitest";

import { validateReleaseMetadata } from "../../scripts/release-notes-check.js";

const COMPLETE_METADATA = {
  tag: "v0.2.5",
  objectType: "tag",
  subject: "发布 Superflow 0.2.5",
  body: [
    "## 升级摘要",
    "",
    "从 0.2.4 升级内容：强化金额精度门禁。",
    "",
    "## 主要更新",
    "",
    "- 增加金额精度设计门禁。",
    "- 增加差额反推算法。",
    "",
    "## 验证结果",
    "",
    "- 122 项测试通过。",
    "",
    "## 升级方式",
    "",
    "- 执行 npm install -g @chenmk/superflow@0.2.5。",
  ].join("\n"),
  previousTag: "v0.2.4",
};

describe("release-notes-check", () => {
  it("accepts an annotated tag with from-to upgrade notes", () => {
    expect(() => validateReleaseMetadata(COMPLETE_METADATA)).not.toThrow();
  });

  it("rejects a lightweight release tag", () => {
    expect(() =>
      validateReleaseMetadata({
        ...COMPLETE_METADATA,
        objectType: "commit",
      }),
    ).toThrow("annotated tag");
  });

  it("rejects release notes that omit the previous version", () => {
    expect(() =>
      validateReleaseMetadata({
        ...COMPLETE_METADATA,
        body: COMPLETE_METADATA.body.replace("0.2.4", "上一版"),
      }),
    ).toThrow("上一版本 0.2.4");
  });

  it("rejects release notes without an upgrade summary", () => {
    expect(() =>
      validateReleaseMetadata({
        ...COMPLETE_METADATA,
        body: COMPLETE_METADATA.body.replace("升级内容", "改动内容"),
      }),
    ).toThrow("升级内容");
  });

  it("rejects release notes without reader-friendly sections", () => {
    expect(() =>
      validateReleaseMetadata({
        ...COMPLETE_METADATA,
        body: COMPLETE_METADATA.body.replace("## 验证结果", "验证结果"),
      }),
    ).toThrow("## 验证结果");
  });

  it("rejects a summary without enough concrete bullets", () => {
    expect(() =>
      validateReleaseMetadata({
        ...COMPLETE_METADATA,
        body: COMPLETE_METADATA.body.replaceAll("- ", ""),
      }),
    ).toThrow("至少需要 3 条");
  });
});
