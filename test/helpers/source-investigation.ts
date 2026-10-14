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
export function prepareSourceInvestigation(change: string): void {
  prepareCoverage(change);
  const files: Record<string, string> = {
    "service.ts": 'export const begin = () => publish("START_PENDING");\n',
    "schema.sql": "  `summary` varchar(20) DEFAULT NULL,\n",
    "source-code-audit.md":
      "# Current source audit\nE1: caller mounts begin; publisher is outside rollback.\n",
    "tasks.md": "# Tasks\n- [ ] 1.1 Preserve the original caller transaction\n",
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
      ["audit", "source-code-audit.md", "contract"],
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
    for (const decision of review.coverage.decisions)
      decision.taskIds = ["1.1"];
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
  fs.writeFileSync(
    path.join(change, ".sdd/state.yaml"),
    `phase: implement\nhandoff_hash: ${hash}\n`,
  );
  fs.writeFileSync(
    path.join(change, ".sdd/handoff/sdd-context.sha256"),
    `${hash}\n`,
  );
  fs.writeFileSync(
    path.join(change, ".sdd/readiness/coding-ready.json"),
    JSON.stringify({
      schemaVersion: "superflow.coding-ready.v1",
      codingReady: true,
      handoffHash: hash,
      reviewHash: digest(fs.readFileSync(path.join(change, REVIEW))),
    }),
  );
}
