import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  digest,
  handoffHash,
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
  function currentHow(): void {
    const text =
      "# Current HOW\nImplement the declared request route using the frozen design.\n";
    fs.writeFileSync(path.join(change, "technical-design.md"), text);
    fs.appendFileSync(
      path.join(change, ".sdd/state.yaml"),
      "technical_design: technical-design.md\n",
    );
    const hash = handoffHash(change);
    mutateReview(change, (r) => {
      r.coverage.sources.push({
        id: "how",
        path: "technical-design.md",
        role: "contract",
        sha256: digest(text),
      });
      for (const round of r.rounds) round.inputHash = hash;
    });
  }
  function negativeInvestigation(): void {
    for (const file of ["caller.ts", "service.ts", "schema.sql"])
      fs.rmSync(path.join(change, file));
    fs.appendFileSync(path.join(change, ".sdd/state.yaml"), "workflow: full\n");
    const text =
      "# Negative source investigation\nNo implementation files or vendored dependency sources exist in the inspected project.\n";
    fs.writeFileSync(path.join(change, "source-code-audit.md"), text);
    fs.writeFileSync(
      path.join(change, "tasks.md"),
      "- [ ] 1.1 Implement the declared request route\n",
    );
    mutateReview(change, (r) => {
      r.coverage.sources.find((source: any) => source.id === "audit").sha256 =
        digest(text);
      r.coverage.sources = r.coverage.sources.filter(
        (source: any) => source.role !== "code",
      );
      for (const entry of r.coverage.entries) {
        entry.sourceRefs = ["audit"];
        entry.investigation.canonical.text = text.trim().split("\n")[1];
        entry.investigation.scope = "no-existing-source";
        entry.investigation.evidence = [entry.investigation.canonical];
        entry.investigation.counterexample =
          "An existing implementation or dependency source would invalidate this empty-source investigation.";
      }
      r.coverage.decisions.forEach((decision: any) => {
        decision.sourceRefs = ["original", "audit"];
      });
      r.rounds[0].sourceChecks = r.coverage.entries.map((entry: any) => ({
        entryId: entry.id,
        scope: "no-existing-source",
        result: "CONFIRMED",
        evidence: entry.investigation.evidence,
        rationale:
          "Reviewed the recorded empty-source and dependency investigation.",
        counterexample: entry.investigation.counterexample,
      }));
    });
    currentHow();
  }
  it("accepts explicit negative investigation without fabricated code anchors", () => {
    negativeInvestigation();
    expect(audit()).toEqual([]);
  });
  it("rejects negative investigation when any code source exists", () => {
    negativeInvestigation();
    fs.writeFileSync(
      path.join(change, "caller.ts"),
      "// existing implementation\n",
    );
    mutateReview(change, (r) => {
      r.coverage.sources.push({
        id: "caller",
        path: "caller.ts",
        role: "code",
        sha256: digest(fs.readFileSync(path.join(change, "caller.ts"))),
      });
    });
    expect(audit().join("\n")).toContain("已有 code");
  });
  it("requires explicit independent negative investigation checks", () => {
    negativeInvestigation();
    mutateReview(change, (r) => {
      delete r.rounds[0].sourceChecks[0].scope;
    });
    expect(audit().join("\n")).toContain("无既有源码调查复核");
  });
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
  it("an existing READY cannot remove workflow to bypass full investigation", () => {
    currentHow();
    const hash = handoffHash(change);
    mutateReview(change, (r) => {
      delete r.coverage.sourceInvestigation;
      for (const entry of r.coverage.entries) delete entry.investigation;
      delete r.rounds[0].sourceChecks;
    });
    fs.writeFileSync(
      path.join(change, ".sdd/state.yaml"),
      `phase: implement\nhandoff_hash: ${hash}\n`,
    );
    const receiptFile = path.join(change, ".sdd/readiness/coding-ready.json");
    const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
    receipt.handoffHash = hash;
    receipt.reviewHash = digest(fs.readFileSync(path.join(change, REVIEW)));
    fs.writeFileSync(receiptFile, JSON.stringify(receipt));
    const checked = spawnSync(process.execPath, [script, change], {
      encoding: "utf8",
    });
    expect(checked.status, checked.stderr).toBe(1);
    expect(checked.stderr).toContain("workflow");
  });
  it("accepts project-scoped HOW outside change and rejects its obsolete review input", () => {
    const project = change;
    const names = fs.readdirSync(project);
    const nested = path.join(project, "planning/openspec/changes/demo");
    fs.mkdirSync(nested, { recursive: true });
    for (const name of names)
      fs.renameSync(path.join(project, name), path.join(nested, name));
    change = nested;
    expect(spawnSync("git", ["init", project]).status).toBe(0);
    const file = path.join(project, "docs/superpowers/specs/current-how.md");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "# HOW\nPreserve the caller.\n");
    const relative = path.relative(change, file);
    fs.appendFileSync(
      path.join(change, ".sdd/state.yaml"),
      `technical_design: ${relative}\n`,
    );
    try {
      const hash = handoffHash(change);
      mutateReview(change, (r) => {
        r.coverage.sources.push({
          id: "how",
          path: relative,
          role: "contract",
          sha256: digest(fs.readFileSync(file)),
        });
        for (const round of r.rounds) round.inputHash = hash;
      });
      expect(audit()).toEqual([]);
      fs.appendFileSync(file, "Correct the caller boundary.\n");
      mutateReview(change, (r) => {
        r.coverage.sources.find((source: any) => source.id === "how").sha256 =
          digest(fs.readFileSync(file));
      });
      expect(audit().join("\n")).toContain("当前 HOW 输入");
      expect(audit(false).join("\n")).toContain("当前 HOW 输入");
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });
  it.each([".sdd/current-how.md", "current-how.txt", "test-report.md"])(
    "rejects coverage-only HOW outside the handoff input %s",
    (file) => {
      fs.writeFileSync(path.join(change, file), "# Current HOW\n");
      const hash = handoffHash(change);
      fs.appendFileSync(
        path.join(change, ".sdd/state.yaml"),
        `technical_design: ${file}\n`,
      );
      mutateReview(change, (r) => {
        r.coverage.sources.push({
          id: "how",
          path: file,
          role: "contract",
          sha256: digest("# Current HOW\n"),
        });
        for (const round of r.rounds) round.inputHash = hash;
      });
      expect(audit().join("\n")).toContain("handoff");
    },
  );
  it("full workflow cannot delete the current technical_design declaration", () => {
    fs.appendFileSync(path.join(change, ".sdd/state.yaml"), "workflow: full\n");
    expect(audit().join("\n")).toContain("technical_design");
  });
  it("does not reuse source checks from an obsolete HOW review round", () => {
    fs.writeFileSync(
      path.join(change, "technical-design.md"),
      "# Current HOW\n",
    );
    fs.appendFileSync(
      path.join(change, ".sdd/state.yaml"),
      "technical_design: technical-design.md\n",
    );
    const hash = handoffHash(change);
    mutateReview(change, (r) => {
      r.coverage.sources.push({
        id: "how",
        path: "technical-design.md",
        role: "contract",
        sha256: digest("# Current HOW\n"),
      });
      const historical = { ...r.rounds[0] };
      for (const round of r.rounds) round.inputHash = hash;
      delete r.rounds[0].sourceChecks;
      r.rounds.push(historical);
    });
    expect(audit().join("\n")).toContain("独立源码核验");
  });
  it.each([true, false])(
    "full workflow cannot omit all investigation markers (checkCode=%s)",
    (checkCode) => {
      prepareCoverage(change);
      fs.appendFileSync(
        path.join(change, ".sdd/state.yaml"),
        "workflow: full\n",
      );
      expect(audit(checkCode).join("\n")).toContain("源码调查");
    },
  );
  it("full workflow cannot remove existing investigation and markers", () => {
    fs.appendFileSync(path.join(change, ".sdd/state.yaml"), "workflow: full\n");
    mutateReview(change, (r) => {
      delete r.coverage.sourceInvestigation;
      for (const entry of r.coverage.entries) delete entry.investigation;
    });
    expect(audit().join("\n")).toContain("源码调查");
  });
  it.each(["missing", "wrong role", "stale input", "missing lens"])(
    "rejects current HOW with %s",
    (scenario) => {
      const file = "technical-design.md";
      fs.writeFileSync(path.join(change, file), "# Current HOW\n");
      fs.appendFileSync(
        path.join(change, ".sdd/state.yaml"),
        `technical_design: ${file}\n`,
      );
      mutateReview(change, (r) => {
        if (scenario !== "missing")
          r.coverage.sources.push({
            id: "how",
            path: file,
            role: scenario === "wrong role" ? "requirement" : "contract",
            sha256: digest(fs.readFileSync(path.join(change, file))),
          });
        if (scenario === "missing lens") r.rounds.pop();
      });
      expect(audit().join("\n")).toContain(
        scenario === "missing" || scenario === "wrong role"
          ? "technical_design"
          : "当前",
      );
    },
  );
  it("cannot remove coverage marker to bypass a frozen requirement", () => {
    fs.writeFileSync(
      path.join(change, ".sdd/applicability.yaml"),
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
      fs.writeFileSync(path.join(change, ".sdd/applicability.yaml"), config + "\n");
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
      path.join(change, ".sdd/applicability.yaml"),
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
    fs.appendFileSync(path.join(change, ".sdd/state.yaml"), "workflow: full\n");
    currentHow();
    fs.writeFileSync(
      path.join(change, "service.ts"),
      "// implementation changes\n",
    );
    expect(audit(false)).toEqual([]);
    expect(audit(true).length).toBeGreaterThan(0);
  });
  it.each(["quick", ""])(
    "does not impose full investigation on generic coverage (%s)",
    (workflow) => {
      prepareCoverage(change);
      if (workflow)
        fs.appendFileSync(
          path.join(change, ".sdd/state.yaml"),
          `workflow: ${workflow}\n`,
        );
      expect(audit()).toEqual([]);
    },
  );
});
