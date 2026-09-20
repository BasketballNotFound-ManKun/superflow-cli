import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
export const REVIEW = ".sdd/reviews/document-review.json";
export const digest = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

export function handoffHash(change: string): string {
  return execFileSync(
    "bash",
    [
      path.join(
        ROOT,
        "assets/skills/superflow-pipeline/scripts/superflow-handoff.sh",
      ),
      change,
      "--hash-only",
    ],
    { encoding: "utf8" },
  ).trim();
}

export function prepareCoverage(change: string): string {
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(change, file)), { recursive: true });
    fs.writeFileSync(path.join(change, file), text);
  };
  write(
    "source-requirements.txt",
    "Child may create another child, both belong to the root account.\n",
  );
  write("caller.ts", "export const create = () => post('/operator/add');\n");
  if (!fs.existsSync(path.join(change, "tests.md")))
    write("tests.md", "# Test contract\n");
  const hash = handoffHash(change);
  const sources = [
    { id: "original", path: "source-requirements.txt", role: "requirement" },
    { id: "caller", path: "caller.ts", role: "code" },
    { id: "tests", path: "tests.md", role: "contract" },
  ].map((source) => ({
    ...source,
    sha256: digest(fs.readFileSync(path.join(change, source.path))),
  }));
  const reviewedPairs = [
    ["R1", "page-child-create"],
    ["R1", "api-child-create"],
  ];
  const review = {
    schemaVersion: "superflow.document-review.v1",
    handoffHash: hash,
    verdict: "PASS",
    openOwnerDecisions: [],
    rounds: [
      "source-contract",
      "architecture-minimality",
      "e2e-environment",
    ].map((lens, i) => ({
      round: i + 1,
      lens,
      inputHash: hash,
      findings: [],
      reviewedPairs,
    })),
    coverage: {
      schemaVersion: "superflow.review-coverage.v1",
      sources,
      requirements: [
        {
          id: "R1",
          statement: "Allowed creation must preserve root ownership",
          sourceRefs: ["original"],
        },
      ],
      entries: [
        {
          id: "page-child-create",
          kind: "browser",
          actor: "child",
          route: "account page -> POST /operator/add",
          sourceRefs: ["caller"],
        },
        {
          id: "api-child-create",
          kind: "api",
          actor: "child",
          route: "POST /operator/add",
          sourceRefs: ["caller"],
        },
      ],
      decisions: reviewedPairs.map(([requirementId, entryId], i) => ({
        requirementId,
        entryId,
        disposition: "FIX",
        rationale: "Preserve ownership on actual entry",
        currentBehavior: "creates independent operator",
        targetBehavior: "creates child under original root",
        sourceRefs: ["original", "caller"],
        caseIds: [`C${i + 1}`],
      })),
      cases: reviewedPairs.map(([, entryId], i) => ({
        id: `C${i + 1}`,
        entryId,
        level: i === 0 ? "browser" : "api",
        action: "Child creates another account",
        sourceRefs: ["tests"],
        assertions: {
          response: "success",
          state: "new child belongs to root",
          forbiddenEffects: "no independent operator resources",
        },
      })),
    },
  };
  write(REVIEW, JSON.stringify(review));
  write(".sdd/handoff/sdd-context.sha256", `${hash}\n`);
  write(".sdd/state.yaml", `phase: implement\nhandoff_hash: ${hash}\n`);
  write(
    ".sdd/readiness/coding-ready.json",
    JSON.stringify({
      schemaVersion: "superflow.coding-ready.v1",
      codingReady: true,
      handoffHash: hash,
      reviewHash: digest(JSON.stringify(review)),
    }),
  );
  return hash;
}

export function mutateReview(
  change: string,
  mutate: (review: any) => void,
): void {
  const file = path.join(change, REVIEW);
  const review = JSON.parse(fs.readFileSync(file, "utf8"));
  mutate(review);
  fs.writeFileSync(file, JSON.stringify(review));
}
