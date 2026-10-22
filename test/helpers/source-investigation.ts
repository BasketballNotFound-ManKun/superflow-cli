import fs from "node:fs";
import path from "node:path";
import {
  digest,
  handoffHash,
  mutateReview,
  prepareCoverage,
  REVIEW,
} from "./review-coverage.js";

// Anonymous fixture: real files and explicit mappings, no business-name scan.
export function prepareSourceInvestigation(
  change: string,
  {
    persistState = true,
    persistReceipt = true,
    preserveContracts = false,
    full = false,
  } = {},
): string {
  prepareCoverage(change, { persistState, persistReceipt: false });
  const stateFile = path.join(change, ".sdd/state.yaml");
  const state = fs.existsSync(stateFile)
    ? fs.readFileSync(stateFile, "utf8")
    : "";
  const technical =
    state.match(/^technical_design:\s*(.+)$/m)?.[1] ?? "technical-design.md";
  if (full && !fs.existsSync(path.join(change, technical)))
    fs.writeFileSync(
      path.join(change, technical),
      "# Current HOW\nPreserve the declared request route and current caller.\n",
    );
  const auditFile = preserveContracts
    ? "source-investigation.md"
    : "source-code-audit.md";
  const files: Record<string, string> = {
    "service.ts": 'export const begin = () => publish("START_PENDING");\n',
    "schema.sql": "  `summary` varchar(20) DEFAULT NULL,\n",
    [auditFile]:
      "# Current source audit\nE1: caller mounts begin; publisher is outside rollback.\n",
    ...(!preserveContracts || !fs.existsSync(path.join(change, "tasks.md"))
      ? {
          "tasks.md":
            "# Tasks\n- [ ] 1.1 Preserve the original caller transaction\n",
        }
      : {}),
  };
  for (const [file, content] of Object.entries(files))
    fs.writeFileSync(path.join(change, file), content);
  const anchor = (sourceRef: string, line: number, text: string) => ({
    sourceRef,
    lineStart: line,
    lineEnd: line,
    text,
  });
  mutateReview(change, (review) => {
    review.coverage.sourceInvestigation = "required";
    for (const [id, file, role] of [
      ["service", "service.ts", "code"],
      ["schema", "schema.sql", "code"],
      ["audit", auditFile, "contract"],
      ...(full &&
      !review.coverage.sources.some((source: any) => source.path === technical)
        ? [["how", technical, "contract"]]
        : []),
    ]) {
      review.coverage.sources.push({
        id,
        path: file,
        role,
        sha256: digest(fs.readFileSync(path.join(change, file))),
      });
    }
    for (const entry of review.coverage.entries) {
      entry.investigation = {
        status: "VERIFIED",
        canonical: anchor(
          "audit",
          2,
          "E1: caller mounts begin; publisher is outside rollback.",
        ),
        evidence: [
          anchor(
            "service",
            1,
            'export const begin = () => publish("START_PENDING");',
          ),
        ],
        counterexample: "An unmounted caller would invalidate this entry.",
      };
    }
    if (
      preserveContracts &&
      !/^\s*- \[[ xX]\] (\S+)/m.test(
        fs.readFileSync(path.join(change, "tasks.md"), "utf8"),
      )
    )
      fs.appendFileSync(
        path.join(change, "tasks.md"),
        "\n- [ ] 1.1 Preserve the declared request route\n",
      );
    const taskId = preserveContracts
      ? fs
          .readFileSync(path.join(change, "tasks.md"), "utf8")
          .match(/^\s*- \[[ xX]\] (\S+)/m)?.[1]
      : "1.1";
    if (!taskId) throw new Error("Fixture requires a current task");
    for (const decision of review.coverage.decisions)
      decision.taskIds = [taskId];
    review.rounds[0].sourceChecks = [
      {
        entryId: "api-child-create",
        result: "CONFIRMED",
        evidence: [
          anchor(
            "caller",
            1,
            "export const create = () => post('/operator/add');",
          ),
        ],
        rationale: "The actual caller invokes the declared route.",
        counterexample: "An exported but unmounted function is insufficient.",
      },
    ];
  });
  const hash = handoffHash(change);
  mutateReview(change, (review) => {
    review.handoffHash = hash;
    for (const round of review.rounds) round.inputHash = hash;
  });
  if (persistState)
    fs.writeFileSync(
      path.join(change, ".sdd/state.yaml"),
      `${full ? `workflow: full\ntechnical_design: ${technical}\n` : ""}phase: implement\nhandoff_hash: ${hash}\n`,
    );
  fs.writeFileSync(
    path.join(change, ".sdd/handoff/sdd-context.sha256"),
    `${hash}\n`,
  );
  if (persistReceipt) {
    fs.mkdirSync(path.join(change, ".sdd/readiness"), { recursive: true });
    fs.writeFileSync(
      path.join(change, ".sdd/readiness/coding-ready.json"),
      JSON.stringify({
        schemaVersion: "superflow.coding-ready.v1",
        codingReady: true,
        workflowPolicy: "observed-delivery.v1",
        handoffHash: hash,
        reviewHash: digest(fs.readFileSync(path.join(change, REVIEW))),
      }),
    );
  }
  return hash;
}
