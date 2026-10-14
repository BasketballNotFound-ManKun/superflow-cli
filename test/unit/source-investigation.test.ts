import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  digest,
  mutateReview,
  prepareCoverage,
  REVIEW,
} from "../helpers/review-coverage.js";
import { prepareSourceInvestigation } from "../helpers/source-investigation.js";

const script = path.resolve(
  __dirname,
  "../../assets/scripts/superflow-review-coverage.mjs",
);
let change: string;
function audit(checkCode = true): string[] {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import fs from 'node:fs';
    import {validateCoverage} from ${JSON.stringify(script)};
    const root = process.argv[1];
    const review = JSON.parse(fs.readFileSync(root + '/${REVIEW}', 'utf8'));
    const issues = [];
    validateCoverage(root, review, issues, ${checkCode});
    console.log(JSON.stringify(issues));
  `,
      change,
    ],
    { encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}
function constraints(value: string): void {
  fs.writeFileSync(
    path.join(change, "service.ts"),
    `const state = "${value}";\n`,
  );
  mutateReview(change, (r) => {
    r.coverage.sources.find((s: any) => s.id === "service").sha256 = digest(
      fs.readFileSync(path.join(change, "service.ts")),
    );
    const literal = {
      sourceRef: "service",
      lineStart: 1,
      lineEnd: 1,
      text: `const state = "${value}";`,
      value,
    };
    for (const entry of r.coverage.entries) {
      entry.investigation.evidence = [literal];
      entry.valueConstraints = [
        {
          kind: "string-capacity",
          field: "summary",
          schema: {
            sourceRef: "schema",
            lineStart: 1,
            lineEnd: 1,
            text: "  `summary` varchar(20) DEFAULT NULL,",
          },
          values: [literal],
        },
      ];
    }
  });
}
function taskIndex(): { ids: string[]; ambiguous: boolean } {
  const result = spawnSync(
    "python3",
    [
      path.resolve(
        __dirname,
        "../../assets/scripts/superflow-test-report-lint.py",
      ),
      path.join(change, "tasks.md"),
      "--task-index",
    ],
    { encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}
describe("source investigation facts, never a semantic verdict", () => {
  beforeEach(() => {
    change = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-source-"));
    prepareSourceInvestigation(change);
  });
  afterEach(() => fs.rmSync(change, { recursive: true, force: true }));
  it("accepts verified anchors without adding business inference", () => {
    expect(audit()).toEqual([]);
  });
  it.each([
    [
      "hash-only analysis",
      (r: any) => {
        delete r.coverage.entries[0].investigation;
      },
      "源码调查",
    ],
    [
      "unresolved source fact",
      (r: any) => {
        r.coverage.entries[0].investigation.status = "SOURCE_INVESTIGATION";
      },
      "SOURCE_INVESTIGATION",
    ],
    [
      "fabricated line despite fresh hash",
      (r: any) => {
        r.coverage.entries[0].investigation.evidence[0].text =
          "already analyzed";
      },
      "锚点",
    ],
    [
      "wrong source role",
      (r: any) => {
        r.coverage.entries[0].investigation.evidence[0].sourceRef = "tests";
      },
      "code",
    ],
    [
      "missing independent check",
      (r: any) => {
        delete r.rounds[0].sourceChecks;
      },
      "独立",
    ],
    [
      "unmounted entry contradicted",
      (r: any) => {
        r.rounds[0].sourceChecks[0].result = "CONTRADICTED";
      },
      "CONTRADICTED",
    ],
    [
      "missing counterexample",
      (r: any) => {
        r.rounds[0].sourceChecks[0].counterexample = "";
      },
      "反例",
    ],
    [
      "stale task reference",
      (r: any) => {
        r.coverage.decisions[0].taskIds = ["2.1"];
      },
      "任务",
    ],
    [
      "old C04 entry mapping",
      (r: any) => {
        r.coverage.cases[0].entryId = "api-child-create";
      },
      "验收等级",
    ],
  ])("rejects %s", (_name, mutate, message) => {
    mutateReview(change, mutate);
    expect(audit().join("\n")).toContain(message);
  });
  it("cannot remove coverage marker to bypass a frozen requirement", () => {
    fs.writeFileSync(
      path.join(change, ".openspec.yaml"),
      "applicability:\n  source_investigation: required\n",
    );
    mutateReview(change, (r) => {
      delete r.coverage.sourceInvestigation;
      delete r.coverage.entries[0].investigation;
    });
    expect(audit().join("\n")).toContain("源码调查");
  });
  it.each([
    "applicability: {source_investigation: required}",
    'applicability:\n  "source_investigation": "required"',
  ])(
    "does not bypass investigation with alternative key syntax %s",
    (config) => {
      fs.writeFileSync(path.join(change, ".openspec.yaml"), config + "\n");
      mutateReview(change, (r) => {
        delete r.coverage.sourceInvestigation;
        delete r.coverage.entries[0].investigation;
      });
      expect(audit().join("\n")).toContain("源码调查");
    },
  );
  it.each([
    '"required"',
    "'required'",
    "required # frozen",
    ">-\n    required",
  ])("does not silently ignore declared YAML requirement %s", (value) => {
    fs.writeFileSync(
      path.join(change, ".openspec.yaml"),
      `applicability:\n  source_investigation: ${value}\n`,
    );
    mutateReview(change, (r) => {
      delete r.coverage.sourceInvestigation;
      delete r.coverage.entries[0].investigation;
    });
    expect(audit().join("\n")).toContain("源码调查");
  });
  it.each([
    "REQUEST_START_EXECUTING_PENDING",
    "REQUEST_START_COMPLETED_DONE",
    "REQUEST_START_COMPLETED_FAILED",
  ])("rejects mapped over-capacity literal %s", (value) => {
    constraints(value);
    expect(audit().join("\n")).toContain("容量 20");
  });
  it("accepts exact capacity and task progress without stale-reference errors", () => {
    constraints("12345678901234567890");
    fs.writeFileSync(
      path.join(change, "tasks.md"),
      "- [x] 1.1 Preserve transaction\n",
    );
    expect(audit()).toEqual([]);
  });
  it("does not guess a field from an unmapped expression", () => {
    constraints("PENDING");
    mutateReview(change, (r) => {
      r.coverage.entries[0].valueConstraints[0].field = "other";
    });
    expect(audit().join("\n")).toContain("SOURCE_INVESTIGATION");
  });
  it("does not accept task IDs from fenced examples", () => {
    fs.writeFileSync(
      path.join(change, "tasks.md"),
      "# Current\n```md\n- [ ] 1.1 historical example\n```\n",
    );
    expect(audit().join("\n")).toContain("任务");
  });
  it("rejects ambiguous duplicate task IDs", () => {
    fs.writeFileSync(
      path.join(change, "tasks.md"),
      "- [ ] 1.1 first\n- [ ] 1.1 second\n",
    );
    expect(audit().join("\n")).toContain("重复");
  });
  it("does not accept retired task IDs in HTML comments", () => {
    fs.writeFileSync(
      path.join(change, "tasks.md"),
      "- [ ] 2.1 Current task\n<!--\n- [ ] 1.1 Retired task\n-->\n",
    );
    expect(audit().join("\n")).toContain("任务");
  });
  it.each([
    "# Historical example\n\n    - [ ] 1.1 Retired sample only\n",
    "- Parent list item\n\n      - [ ] 1.1 Indented code inside list\n",
    "- Previous list\n\n# New section\n\n    - [ ] 1.1 Retired sample\n",
    "- Parent\n\n~~~text\nOutside-list fence\n~~~\n\n    - [ ] 1.1 Indented code after root block\n",
    "- Parent\n\n    ```md\n    - [ ] 1.1 Fenced sample inside list\n    ```\n",
  ])("does not promote indented code into task IDs: %s", (text) => {
    fs.writeFileSync(path.join(change, "tasks.md"), text);
    expect(taskIndex()).toEqual({ ids: [], ambiguous: false });
    expect(audit().join("\n")).toContain("任务");
  });
  it.each([
    "- Parent list item\n    - [x] 1.1 Nested task\n",
    "1. Parent list item\n    - [ ] 1.1 Nested task\n",
    "- Parent list item\n\n    - [ ] 1.1 Nested task after blank\n",
    "   - Parent list item\n       - [ ] 1.1 Nested task\n",
    "- Parent\n\n    ```text\n    List-local example\n    ```\n\n    - [ ] 1.1 Actual nested task\n",
  ])("preserves actual nested task IDs: %s", (text) => {
    fs.writeFileSync(path.join(change, "tasks.md"), text);
    expect(taskIndex()).toEqual({ ids: ["1.1"], ambiguous: false });
    expect(audit()).toEqual([]);
  });
  it.each([true, false])(
    "rejects requirement literal sources (checkCode=%s)",
    (checkCode) => {
      constraints("START_PENDING");
      const text = 'Desired value: "START_PENDING"';
      fs.writeFileSync(path.join(change, "literal.txt"), text + "\n");
      mutateReview(change, (r) => {
        r.coverage.sources.push({
          id: "literal",
          path: "literal.txt",
          role: "requirement",
          sha256: digest(text + "\n"),
        });
        r.coverage.entries[0].valueConstraints[0].values = [
          {
            sourceRef: "literal",
            lineStart: 1,
            lineEnd: 1,
            text,
            value: "START_PENDING",
          },
        ];
      });
      expect(audit(checkCode).join("\n")).toContain("code|contract");
    },
  );
  it.each(["code", "contract"])(
    "accepts %s literal source and implementation compatibility",
    (role) => {
      constraints("START_PENDING");
      const text = 'const state = "START_PENDING";';
      fs.writeFileSync(path.join(change, "literal.txt"), text + "\n");
      mutateReview(change, (r) => {
        r.coverage.sources.push({
          id: "literal",
          path: "literal.txt",
          role,
          sha256: digest(text + "\n"),
        });
        r.coverage.entries[0].valueConstraints[0].values = [
          {
            sourceRef: "literal",
            lineStart: 1,
            lineEnd: 1,
            text,
            value: "START_PENDING",
          },
        ];
      });
      expect(audit()).toEqual([]);
      if (role === "code")
        fs.writeFileSync(path.join(change, "literal.txt"), "// implemented\n");
      expect(audit(false)).toEqual([]);
    },
  );
  it("preserves implementation-stage source drift allowance", () => {
    fs.writeFileSync(
      path.join(change, "service.ts"),
      "// implementation changes\n",
    );
    expect(audit(false)).toEqual([]);
    expect(audit(true).length).toBeGreaterThan(0);
  });
  it("keeps legacy v1 readable without claiming the new investigation", () => {
    prepareCoverage(change);
    expect(audit()).toEqual([]);
  });
});
