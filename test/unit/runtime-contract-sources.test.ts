import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { prepareCoverage, REVIEW, digest } from "../helpers/review-coverage.js";

const root = path.resolve(__dirname, "../..");
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "contract-progress-"),
  );
  directories.push(directory);
  fs.writeFileSync(
    path.join(directory, "tasks.md"),
    "- [ ] 1.1 Validate input\n",
  );
  fs.writeFileSync(
    path.join(directory, "test-report.md"),
    "Verification Result: NOT_RUN\n",
  );
  prepareCoverage(directory, { persistReceipt: false });
  const review = JSON.parse(
    fs.readFileSync(path.join(directory, REVIEW), "utf8"),
  );
  return { directory, review };
}
function canonicalTaskHash(directory: string): string {
  const manifest = JSON.parse(
    execFileSync(
      "bash",
      [
        path.join(root, "assets/skills/superflow/scripts/superflow-handoff.sh"),
        directory,
        "--manifest",
      ],
      { encoding: "utf8" },
    ),
  );
  return manifest.sources.find(
    (source: { path: string }) => source.path === "tasks.md",
  ).sha256;
}
function validate(
  directory: string,
  review: unknown,
  changeRoot = directory,
): string[] {
  const file = path.join(directory, REVIEW);
  fs.writeFileSync(file, JSON.stringify(review));
  const module = pathToFileURL(
    path.join(root, "assets/scripts/superflow-review-coverage.mjs"),
  ).href;
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
    import fs from 'node:fs';
    import {validateCoverage} from ${JSON.stringify(module)};
    const issues=[];
    validateCoverage(${JSON.stringify(changeRoot)},JSON.parse(fs.readFileSync(${JSON.stringify(file)},'utf8')),issues,false);
    console.log(JSON.stringify(issues));
  `,
      ],
      { encoding: "utf8" },
    ),
  );
}
describe("canonical contract identity and mutable execution progress", () => {
  it("keeps a canonical task source valid after progress-only checkoff", () => {
    const f = fixture();
    f.review.coverage.sources.push({
      id: "tasks",
      role: "contract",
      path: "tasks.md",
      sha256: canonicalTaskHash(f.directory),
    });
    fs.writeFileSync(
      path.join(f.directory, "tasks.md"),
      "- [x] 1.1 Validate input\n",
    );
    expect(validate(f.directory, f.review)).toEqual([]);
  });
  it("rejects changed task semantics even when implementation code checks are disabled", () => {
    const f = fixture();
    f.review.coverage.sources.push({
      id: "tasks",
      role: "contract",
      path: "tasks.md",
      sha256: canonicalTaskHash(f.directory),
    });
    fs.writeFileSync(
      path.join(f.directory, "tasks.md"),
      "- [x] 1.1 Bypass validation\n",
    );
    expect(validate(f.directory, f.review).join("\n")).toContain(
      "来源 tasks 内容已变化",
    );
  });
  it("rejects a live report as frozen contract input before repeated result edits cause drift", () => {
    const f = fixture();
    f.review.coverage.sources.push({
      id: "live-report",
      role: "contract",
      path: "test-report.md",
      sha256: digest(fs.readFileSync(path.join(f.directory, "test-report.md"))),
    });
    expect(validate(f.directory, f.review).join("\n")).toContain("运行报告");
  });
  it("also rejects live report contract identity for a relative change root", () => {
    const f = fixture();
    f.review.coverage.sources.push({
      id: "live-report",
      role: "contract",
      path: "test-report.md",
      sha256: digest(fs.readFileSync(path.join(f.directory, "test-report.md"))),
    });
    expect(
      validate(
        f.directory,
        f.review,
        path.relative(process.cwd(), f.directory),
      ).join("\n"),
    ).toContain("运行报告");
  });
  it("rejects a symbolic-link alias of the live report as a contract source", () => {
    const f = fixture();
    const alias = path.join(f.directory, "report-alias.md");
    fs.symlinkSync("test-report.md", alias, "file");
    f.review.coverage.sources.push({
      id: "live-alias",
      role: "contract",
      path: "report-alias.md",
      sha256: digest(fs.readFileSync(alias)),
    });
    expect(validate(f.directory, f.review).join("\n")).toContain("运行报告");
  });
  it("rejects a hard-link alias of the same live report inode", () => {
    const f = fixture();
    const alias = path.join(f.directory, "report-alias.md");
    fs.linkSync(path.join(f.directory, "test-report.md"), alias);
    f.review.coverage.sources.push({
      id: "live-alias",
      role: "contract",
      path: "report-alias.md",
      sha256: digest(fs.readFileSync(alias)),
    });
    expect(validate(f.directory, f.review).join("\n")).toContain("运行报告");
  });
  it("keeps a physical task alias bound to the same canonical progress owner", () => {
    const f = fixture();
    const alias = path.join(f.directory, "task-alias.txt");
    fs.linkSync(path.join(f.directory, "tasks.md"), alias);
    f.review.coverage.sources.push({
      id: "task-alias",
      role: "contract",
      path: "task-alias.txt",
      sha256: canonicalTaskHash(f.directory),
    });
    fs.writeFileSync(
      path.join(f.directory, "tasks.md"),
      "- [x] 1.1 Validate input\n",
    );
    expect(validate(f.directory, f.review)).toEqual([]);
  });
  it("accepts a separate byte-identical report snapshot as an immutable source", () => {
    const f = fixture();
    const snapshot = path.join(f.directory, "original-defect.md");
    fs.copyFileSync(path.join(f.directory, "test-report.md"), snapshot);
    f.review.coverage.sources.push({
      id: "snapshot",
      role: "contract",
      path: "original-defect.md",
      sha256: digest(fs.readFileSync(snapshot)),
    });
    expect(validate(f.directory, f.review)).toEqual([]);
  });
  it("keeps ordinary canonical prose protected by its byte identity", () => {
    const f = fixture();
    fs.appendFileSync(
      path.join(f.directory, "tests.md"),
      "Changed required acceptance\n",
    );
    expect(validate(f.directory, f.review).join("\n")).toContain(
      "来源 tests 内容已变化",
    );
  });
});
