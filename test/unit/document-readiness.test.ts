import { prepareSourceInvestigation } from "../helpers/source-investigation.js";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handoffHash, mutateReview } from "../helpers/review-coverage.js";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "../..");
const AUDIT = path.join(
  ROOT,
  "assets",
  "scripts",
  "superflow-document-audit.mjs",
);
const ENV_PREFLIGHT = path.join(
  ROOT,
  "assets",
  "scripts",
  "superflow-environment-preflight.mjs",
);

let tmp: string;
let change: string;

async function write(relative: string, content: string): Promise<void> {
  const target = path.join(change, relative);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, content);
}

async function refreshReviewIdentity(): Promise<void> {
  const hash = handoffHash(change);
  mutateReview(change, (review) => {
    review.handoffHash = hash;
    for (const round of review.rounds) round.inputHash = hash;
  });
  await write(".sdd/handoff/sdd-context.sha256", `${hash}\n`);
}

async function prepareReadyChange(): Promise<void> {
  change = path.join(tmp, "openspec", "changes", "cross-repo-demo");
  const promptLinks = ["[P00](prompt/p00.md)", "[P01](prompt/p01.md)"].join(
    " ",
  );
  await write(".openspec.yaml", "schema: spec-driven\n");
  await write(
    ".sdd/applicability.yaml",
    [
      "applicability:",
      "  cross_repo: true",
      "  complex_logic: true",
      "  mermaid: required",
      "  environment: required",
      "  money: false",
      "repositories:",
      "  - ../service-a",
      "  - ../service-b",
      "",
    ].join("\n"),
  );
  for (const document of [
    "tasks.md",
    "traceability-matrix.md",
    "sdd-quality-gate.md",
    "test-report.md",
  ]) {
    await write(document, `# ${document}\n\n${promptLinks}\n`);
  }
  await write(
    "design.md",
    [
      "# Design",
      "",
      "```mermaid",
      "sequenceDiagram",
      "  participant A as service-a",
      "  participant B as service-b",
      "  A->>B: request",
      "```",
      "",
      "```mermaid",
      "flowchart TD",
      "  A[service-a] --> B[service-b]",
      "```",
      "",
    ].join("\n"),
  );
  await write("tests.md", "# Tests\n\nEnvironment preflight is required.\n");
  await write("prompt/p00.md", "# P00\n");
  await write("prompt/p01.md", "# P01\n");
  const hash = createHash("sha256").update("ready-docs").digest("hex");
  await write(".sdd/handoff/sdd-context.sha256", `${hash}\n`);
  await write(
    ".sdd/reviews/document-review.json",
    JSON.stringify(
      {
        schemaVersion: "superflow.document-review.v1",
        handoffHash: hash,
        verdict: "PASS",
        openOwnerDecisions: [],
        rounds: [
          {
            round: 1,
            lens: "source-contract",
            inputHash: hash,
            findings: [],
          },
          {
            round: 2,
            lens: "architecture-minimality",
            inputHash: hash,
            findings: [],
          },
          {
            round: 3,
            lens: "e2e-environment",
            inputHash: hash,
            findings: [],
          },
        ],
      },
      null,
      2,
    ),
  );
  await write("fixtures/service-a.txt", "service-a\n");
  await write("fixtures/service-b.txt", "service-b\n");
  await write(
    ".sdd/readiness/environment.json",
    JSON.stringify(
      {
        schemaVersion: "superflow.environment-readiness.v2",
        handoffHash: hash,
        scope: "local-dev",
        overall: "READY",
        ownerHelpRequired: [],
        executionContract: {
          applicationLocation: "local",
          dependencyPolicy: "local-isolated",
          allowLocalProvisioning: true,
          allowRemoteDevDependencies: false,
          allowedOverrides: ["server.port"],
          forbiddenOverrides: ["spring.datasource.url"],
          services: [
            {
              id: "service-a",
              configSource: {
                type: "bundled-profile",
                ref: "application-local.yml",
              },
              startupCommandSource: "tests.md",
            },
            {
              id: "service-b",
              configSource: {
                type: "bundled-profile",
                ref: "application-local.yml",
              },
              startupCommandSource: "tests.md",
            },
          ],
          dependencies: [
            {
              id: "service-a-fixture",
              kind: "file",
              provisioning: "local-isolated",
              configSource: {
                type: "generated-fixture",
                ref: "tests.md",
              },
            },
            {
              id: "service-b-fixture",
              kind: "file",
              provisioning: "local-isolated",
              configSource: {
                type: "generated-fixture",
                ref: "tests.md",
              },
            },
          ],
        },
        checks: [
          {
            id: "service-a-config",
            type: "file",
            target: "fixtures/service-a.txt",
            contractRef: "service:service-a",
            status: "READY",
          },
          {
            id: "service-b-config",
            type: "file",
            target: "fixtures/service-b.txt",
            contractRef: "service:service-b",
            status: "READY",
          },
          {
            id: "service-a",
            type: "file",
            target: "fixtures/service-a.txt",
            contractRef: "dependency:service-a-fixture",
            status: "READY",
          },
          {
            id: "service-b",
            type: "file",
            target: "fixtures/service-b.txt",
            contractRef: "dependency:service-b-fixture",
            status: "READY",
          },
        ],
      },
      null,
      2,
    ),
  );
}

describe("document delivery readiness", () => {
  beforeEach(async () => {
    tmp = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "superflow-doc-readiness-"),
    );
    await prepareReadyChange();
    const hash = prepareSourceInvestigation(change, {
      full: true,
      preserveContracts: true,
    });
    const envFile = path.join(change, ".sdd/readiness/environment.json");
    const env = JSON.parse(fs.readFileSync(envFile, "utf8"));
    env.handoffHash = hash;
    fs.writeFileSync(envFile, JSON.stringify(env));
  });

  afterEach(async () => {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("freezes Superflow applicability independently of native OpenSpec metadata", async () => {
    const native = fs.readFileSync(path.join(change, ".openspec.yaml"), "utf8");
    expect(native).toBe("schema: spec-driven\n");
    const before = handoffHash(change);
    const declaration = path.join(change, ".sdd/applicability.yaml");
    fs.appendFileSync(declaration, "# Reviewed scope changed\n");
    expect(handoffHash(change)).not.toBe(before);
    expect(fs.readFileSync(path.join(change, ".openspec.yaml"), "utf8")).toBe(native);
    await expect(execFileAsync("node", [AUDIT, change, "--json"])).rejects.toThrow();
  });

  it("rejects applicability aliases before freezing outside content", async () => {
    const declaration = path.join(change, ".sdd/applicability.yaml");
    const outside = path.join(tmp, "outside-applicability.yaml");
    fs.writeFileSync(outside, "applicability:\n  database: false\n");
    fs.rmSync(declaration);
    fs.symlinkSync(outside, declaration);
    expect(() => handoffHash(change)).toThrow(/regular project-local file/);
  });

  it("keeps generated readiness outside the frozen applicability inventory", async () => {
    const before = handoffHash(change);
    await write(".sdd/readiness/unrelated.yaml", "generated: true\n");
    expect(handoffHash(change)).toBe(before);
  });

  it("nested workspace uses change-relative sources despite declared project root", async () => {
    const nested = path.join(
      tmp,
      "docs",
      "planning",
      "openspec",
      "changes",
      "demo",
    );
    await fs.promises.mkdir(path.dirname(nested), { recursive: true });
    await fs.promises.rename(change, nested);
    change = nested;
    mutateReview(change, (review) => {
      review.projectRoot = "../../../../..";
    });
    const reviewText = fs.readFileSync(
      path.join(change, ".sdd/reviews/document-review.json"),
    );
    const receipt = JSON.parse(
      fs.readFileSync(
        path.join(change, ".sdd/readiness/coding-ready.json"),
        "utf8",
      ),
    );
    receipt.reviewHash = createHash("sha256").update(reviewText).digest("hex");
    await write(".sdd/readiness/coding-ready.json", JSON.stringify(receipt));
    const audit = await execFileAsync("node", [AUDIT, change, "--json"]);
    expect(JSON.parse(audit.stdout).ready).toBe(true);
    await expect(
      execFileAsync("node", [
        path.join(ROOT, "assets/scripts/superflow-review-coverage.mjs"),
        change,
        "--check-sources",
      ]),
    ).resolves.toMatchObject({ stderr: "" });
  });

  it("accepts three closed review lenses and exact prompt links", async () => {
    const result = await execFileAsync("node", [AUDIT, change, "--json"]);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ready).toBe(true);
    expect(parsed.reviewRounds).toBe(3);
    expect(parsed.promptCount).toBe(3);
  });

  it.each([
    ["unknown task", "1.1", "unknown-task"],
    ["unknown entry", "page-child-create", "unknown-entry"],
    ["unknown case", "C1", "unknown-case"],
  ])("blocks prompt navigation %s", async (_name, before, after) => {
    const file = path.join(change, "prompt/implementation.md");
    const text = fs.readFileSync(file, "utf8").replaceAll(before, after);
    fs.writeFileSync(file, text);
    await expect(execFileAsync("node", [AUDIT, change])).rejects.toMatchObject({
      stderr: expect.stringContaining("导航"),
    });
  });

  it.each(["case", "task", "entry", "batch-link"])(
    "rejects missing navigation %s",
    async (missing) => {
      const main = path.join(change, "prompt/implementation.md");
      let text = fs.readFileSync(main, "utf8");
      if (missing === "case") text = text.replaceAll(", C2", "");
      if (missing === "task") text = text.replaceAll("| 1.1 |", "| — |");
      if (missing === "entry") text = text.replaceAll(", api-child-create", "");
      if (missing === "batch-link")
        text = text.replaceAll("](p01.md)", "](missing.md)");
      fs.writeFileSync(main, text);
      await expect(
        execFileAsync("node", [AUDIT, change]),
      ).rejects.toMatchObject({ stderr: expect.stringContaining("导航") });
    },
  );

  it.each([
    "indented-fence",
    "longer-close",
    "list-fence",
    "quote-fence",
    "indented-code",
    "ambiguous-list",
  ])("rejects example-only navigation in %s", async (example) => {
    const main = path.join(change, "prompt/implementation.md");
    const text = fs.readFileSync(main, "utf8");
    const wrapped: Record<string, string> = {
      "indented-fence": "   ```markdown\n" + text + "\n   ```\n",
      "longer-close": "   ```markdown\n" + text + "\n   ````\n",
      "list-fence":
        "- ```markdown\n" +
        text
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n") +
        "\n  ````\n",
      "quote-fence":
        "> ```markdown\n" +
        text
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n") +
        "\n> ````\n",
      "indented-code": text
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
      "ambiguous-list":
        "- ```markdown\n" +
        text
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n"),
    };
    fs.writeFileSync(main, wrapped[example]);
    await refreshReviewIdentity();
    await expect(execFileAsync("node", [AUDIT, change])).rejects.toMatchObject({
      stderr: expect.stringContaining(
        example === "ambiguous-list" ? "正文存在歧义" : "导航",
      ),
    });
  });

  it("accepts real navigation after indented list and quote examples", async () => {
    const main = path.join(change, "prompt/implementation.md");
    const text = fs.readFileSync(main, "utf8");
    const example =
      "| Prompt | Task IDs | Entry IDs | Case IDs |\n|---|---|---|---|\n| [Example](missing.md) | unknown-task | unknown-entry | unknown-case |\n";
    fs.writeFileSync(
      main,
      "   ```markdown\n" +
        example +
        "   ````\n\n- ```markdown\n" +
        example
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n") +
        "\n  ````\n\n> ```markdown\n" +
        example
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n") +
        "\n> ````\n\n" +
        text,
    );
    await refreshReviewIdentity();
    await expect(execFileAsync("node", [AUDIT, change])).resolves.toBeDefined();
  });

  it.each(["main-only", "single-batch", "multiple-batches"])(
    "accepts %s navigation",
    async (shape) => {
      const promptDir = path.join(change, "prompt");
      if (shape !== "multiple-batches") {
        fs.rmSync(path.join(promptDir, "p00.md"));
        const main = path.join(promptDir, "implementation.md");
        let text = fs
          .readFileSync(main, "utf8")
          .split("\n")
          .filter((line) => !line.includes("](p00.md)"))
          .join("\n");
        if (shape === "main-only") {
          fs.rmSync(path.join(promptDir, "p01.md"));
          text = text.replaceAll("](p01.md)", "](implementation.md)");
        }
        fs.writeFileSync(main, text);
      }
      const hash = handoffHash(change);
      mutateReview(change, (r) => {
        r.handoffHash = hash;
        for (const round of r.rounds) round.inputHash = hash;
      });
      await write(".sdd/handoff/sdd-context.sha256", `${hash}\n`);
      await expect(
        execFileAsync("node", [AUDIT, change]),
      ).resolves.toBeDefined();
    },
  );

  it("requires every aggregate document to link every prompt", async () => {
    await write("test-report.md", "# Test Report\n\n[P00](prompt/p00.md)\n");
    await expect(execFileAsync("node", [AUDIT, change])).rejects.toMatchObject({
      stderr: expect.stringContaining("test-report.md 未链接 prompt/p01.md"),
    });
  });

  it.each([
    [
      "missing legacy coverage",
      (r: any) => {
        delete r.coverage;
      },
      "缺少需求×入口",
    ],
    [
      "endpoint-wide exclusion",
      (r: any) => {
        r.coverage.decisions.pop();
      },
      "缺少映射",
    ],
    [
      "exclusion without source authority",
      (r: any) => {
        Object.assign(r.coverage.decisions[0], {
          disposition: "EXCLUDED",
          caseIds: [],
          sourceRefs: ["caller"],
        });
      },
      "缺少 requirement 来源",
    ],
    [
      "API-only replacing page E2E",
      (r: any) => {
        r.coverage.cases[0].level = "api";
      },
      "验收等级",
    ],
    [
      "wrong endpoint case",
      (r: any) => {
        r.coverage.decisions[0].caseIds = ["C2"];
      },
      "对应真实入口",
    ],
    [
      "success-only assertions",
      (r: any) => {
        delete r.coverage.cases[0].assertions.forbiddenEffects;
      },
      "forbiddenEffects",
    ],
    [
      "unreviewed exclusions",
      (r: any) => {
        r.rounds[0].reviewedPairs.pop();
      },
      "逐项评审",
    ],
    [
      "unknown evidence",
      (r: any) => {
        r.coverage.requirements[0].sourceRefs = ["missing"];
      },
      "有效来源引用",
    ],
    [
      "duplicate mapping",
      (r: any) => {
        r.coverage.decisions.push(r.coverage.decisions[0]);
      },
      "重复映射",
    ],
  ])("blocks %s", async (_name, mutate, error) => {
    mutateReview(change, mutate as (r: any) => void);
    await expect(execFileAsync("node", [AUDIT, change])).rejects.toMatchObject({
      stderr: expect.stringContaining(error as string),
    });
  });

  it("accepts source-backed exclusions without inventing a runtime test", async () => {
    mutateReview(change, (r) => {
      Object.assign(r.coverage.decisions[1], {
        disposition: "EXCLUDED",
        caseIds: [],
        rationale: "Source-backed scope exclusion reviewed independently",
      });
      r.coverage.cases.pop();
    });
    for (const prompt of fs.readdirSync(path.join(change, "prompt"))) {
      const file = path.join(change, "prompt", prompt);
      fs.writeFileSync(
        file,
        fs.readFileSync(file, "utf8").replaceAll(", C2", ""),
      );
    }
    const hash = handoffHash(change);
    mutateReview(change, (r) => {
      r.handoffHash = hash;
      for (const round of r.rounds) round.inputHash = hash;
    });
    await write(".sdd/handoff/sdd-context.sha256", `${hash}\n`);
    await expect(execFileAsync("node", [AUDIT, change])).resolves.toBeDefined();
  });

  it("blocks caller drift even when handoff hash markers did not change", async () => {
    await write(
      "caller.ts",
      "export const create = () => post('/different/add');\n",
    );
    await expect(execFileAsync("node", [AUDIT, change])).rejects.toMatchObject({
      stderr: expect.stringContaining("来源 caller 内容已变化"),
    });
  });

  it("revokes an earlier READY receipt when a recheck fails", async () => {
    const command = path.join(
      ROOT,
      "assets/scripts/superflow-coding-ready.mjs",
    );
    await write("tasks.md", "# broken contract\n");
    await expect(
      execFileAsync("node", [command, change, "--json"]),
    ).rejects.toBeDefined();
    const receipt = JSON.parse(
      fs.readFileSync(
        path.join(change, ".sdd/readiness/coding-ready.json"),
        "utf8",
      ),
    );
    expect(receipt.codingReady).toBe(false);
    expect(receipt.documentReadiness).toBe("BLOCKED");
  }, 15000);

  it.each(["sources", "requirements", "entries", "cases", "decisions"])(
    "rejects malformed coverage.%s with a diagnostic",
    async (field) => {
      mutateReview(change, (r) => {
        r.coverage[field] = [null];
      });
      await expect(
        execFileAsync("node", [AUDIT, change]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(`coverage.${field} 必须是对象数组`),
      });
    },
  );

  it("requires all three independent review lenses", async () => {
    const reviewFile = path.join(
      change,
      ".sdd",
      "reviews",
      "document-review.json",
    );
    const review = JSON.parse(await fs.promises.readFile(reviewFile, "utf-8"));
    review.rounds.pop();
    await fs.promises.writeFile(reviewFile, JSON.stringify(review));
    await expect(execFileAsync("node", [AUDIT, change])).rejects.toMatchObject({
      stderr: expect.stringContaining("至少三轮"),
    });
  });

  it("requires sequence and flow/state Mermaid diagrams for complex changes", async () => {
    await write("design.md", "# Design\n\nNo diagram.\n");
    await expect(execFileAsync("node", [AUDIT, change])).rejects.toMatchObject({
      stderr: expect.stringContaining("sequenceDiagram"),
    });
  });

  it("rejects structurally invalid Mermaid instead of checking the fence only", async () => {
    await write(
      "design.md",
      [
        "# Design",
        "",
        "```mermaid",
        "sequenceDiagram",
        "  participant A",
        "```",
        "",
        "```mermaid",
        "flowchart TD",
        "  A[only one node]",
        "```",
        "",
      ].join("\n"),
    );
    await expect(execFileAsync("node", [AUDIT, change])).rejects.toMatchObject({
      stderr: expect.stringContaining("缺少有效消息箭头"),
    });
  });

  it("probes declared local environment evidence without printing secrets", async () => {
    const result = await execFileAsync("node", [
      ENV_PREFLIGHT,
      change,
      "--json",
    ]);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ready).toBe(true);
    expect(result.stdout).not.toContain("password");
  });

  it("blocks when an environment check is stale or owner help remains", async () => {
    await fs.promises.rm(path.join(change, "fixtures", "service-b.txt"));
    await expect(
      execFileAsync("node", [ENV_PREFLIGHT, change]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("service-b"),
    });
  });

  it("rejects the legacy report because it lacks an execution contract", async () => {
    const reportFile = path.join(
      change,
      ".sdd",
      "readiness",
      "environment.json",
    );
    const report = JSON.parse(await fs.promises.readFile(reportFile, "utf-8"));
    report.schemaVersion = "superflow.environment-readiness.v1";
    delete report.executionContract;
    await fs.promises.writeFile(reportFile, JSON.stringify(report));
    await expect(
      execFileAsync("node", [ENV_PREFLIGHT, change]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("缺少结构化环境执行合同"),
    });
  });

  it("rejects shared development dependencies with local provisioning", async () => {
    const reportFile = path.join(
      change,
      ".sdd",
      "readiness",
      "environment.json",
    );
    const report = JSON.parse(await fs.promises.readFile(reportFile, "utf-8"));
    report.executionContract.dependencyPolicy = "shared-dev";
    report.executionContract.allowRemoteDevDependencies = true;
    for (const dependency of report.executionContract.dependencies) {
      dependency.provisioning = "shared-dev";
    }
    await fs.promises.writeFile(reportFile, JSON.stringify(report));
    await expect(
      execFileAsync("node", [ENV_PREFLIGHT, change]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("shared-dev 禁止自建本地依赖"),
    });
  });

  it("rejects local isolation with remote development dependencies", async () => {
    const reportFile = path.join(
      change,
      ".sdd",
      "readiness",
      "environment.json",
    );
    const report = JSON.parse(await fs.promises.readFile(reportFile, "utf-8"));
    report.executionContract.allowRemoteDevDependencies = true;
    await fs.promises.writeFile(reportFile, JSON.stringify(report));
    await expect(
      execFileAsync("node", [ENV_PREFLIGHT, change]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("local-isolated 禁止使用远程开发依赖"),
    });
  });

  it("rejects overlapping allowed and forbidden overrides", async () => {
    const reportFile = path.join(
      change,
      ".sdd",
      "readiness",
      "environment.json",
    );
    const report = JSON.parse(await fs.promises.readFile(reportFile, "utf-8"));
    report.executionContract.forbiddenOverrides.push("server.port");
    await fs.promises.writeFile(reportFile, JSON.stringify(report));
    await expect(
      execFileAsync("node", [ENV_PREFLIGHT, change]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("允许覆盖项与禁止覆盖项重复"),
    });
  });

  it("requires configuration sources and linked dependency checks", async () => {
    const reportFile = path.join(
      change,
      ".sdd",
      "readiness",
      "environment.json",
    );
    const report = JSON.parse(await fs.promises.readFile(reportFile, "utf-8"));
    delete report.executionContract.services[0].configSource;
    delete report.checks[0].contractRef;
    await fs.promises.writeFile(reportFile, JSON.stringify(report));
    await expect(
      execFileAsync("node", [ENV_PREFLIGHT, change]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("service-a: 缺少 configSource"),
    });
    await expect(
      execFileAsync("node", [ENV_PREFLIGHT, change]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("service-a-config: 缺少 contractRef"),
    });
  });
});
