import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { readTasks } from "../../src/app/commands/status.js";
import { implementationInstructions } from "../../src/app/commands/implement.js";

const temporary: string[] = [];
afterEach(() =>
  temporary
    .splice(0)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })),
);

function fixture(phase = "implement") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-capability-"));
  temporary.push(dir);
  fs.mkdirSync(path.join(dir, ".sdd"));
  fs.writeFileSync(
    path.join(dir, ".sdd/state.yaml"),
    `phase: ${phase}\nbuild_mode: owner\n`,
  );
  fs.writeFileSync(
    path.join(dir, "tasks.md"),
    [
      "# Tasks",
      "```md",
      "- [ ] T-99 Example only",
      "```",
      "",
      "- [x] T-01 Create storage",
      "  - Blocked by: none",
      "- [ ] T-02 Save a loaded document",
      "  - Blocked by: T-01",
      "  - Delivers: Loaded content can be saved without losing other content",
      "  - Verify: [save checks](tests.md#save)",
      "  - Cases: C-01, C-02",
      "- [ ] T-03 Extend consumers",
      "  - Blocked by: T-02",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(dir, "tests.md"), "# save\n");
  return dir;
}

it("returns the next verifiable capability from the same task frontier without executing admission or tests", () => {
  const dir = fixture();
  const before = fs.readFileSync(path.join(dir, "tasks.md"));
  const result = implementationInstructions(dir, "en");
  expect(result.snapshotOnly).toBe(true);
  expect(result.workflow.buildMode).toBe("owner");
  expect(result.progress).toEqual({ complete: 1, total: 3, remaining: 2 });
  expect(result.frontier).toEqual([
    expect.objectContaining({
      id: "T-02",
      title: "T-02 Save a loaded document",
      line: 8,
      delivers: "Loaded content can be saved without losing other content",
      verification: "[save checks](tests.md#save)",
      cases: ["C-01", "C-02"],
    }),
  ]);
  expect(result.admission.argv).toContain("coding-ready");
  expect(result.executionPermission).toBe("not-evaluated");
  expect(fs.readFileSync(path.join(dir, "tasks.md"))).toEqual(before);
  expect(fs.readdirSync(path.join(dir, ".sdd"))).toEqual(["state.yaml"]);
  fs.writeFileSync(
    path.join(dir, "tasks.md"),
    before.toString().replace("[ ] T-02", "[x] T-02"),
  );
  expect(
    implementationInstructions(dir, "en").frontier.map((task) => task.id),
  ).toEqual(["T-03"]);
});

it("does not advertise tasks across a phase boundary or an invalid dependency graph", () => {
  const dir = fixture("docs");
  expect(implementationInstructions(dir, "en").frontier).toEqual([]);
  expect(implementationInstructions(dir, "en").state).toBe("blocked");
  fs.writeFileSync(path.join(dir, ".sdd/state.yaml"), "phase: implement\n");
  const file = path.join(dir, "tasks.md");
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, "utf8")
      .replace("Blocked by: T-01", "Blocked by: T-03"),
  );
  const result = implementationInstructions(dir, "en");
  expect(result.frontier).toEqual([]);
  expect(result.issues.join(" ")).toContain("cycle");
});

it("reports missing task dependencies instead of inventing an execution order", () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, "tasks.md"), "- [ ] T-01 A capability\n");
  const result = implementationInstructions(dir, "en");
  expect(result.frontier).toEqual([]);
  expect(result.state).toBe("needs-context");
  expect(result.progress.remaining).toBe(1);
});

it("accepts the Chinese no-dependency value used by the canonical task template", () => {
  const dir = fixture();
  const file = path.join(dir, "tasks.md");
  fs.writeFileSync(
    file,
    fs.readFileSync(file, "utf8").replace("Blocked by: none", "Blocked by: 无"),
  );
  expect(implementationInstructions(dir, "zh").issues).toEqual([]);
});

it("does not turn malformed dependency text into an unblocked task", () => {
  const dir = fixture();
  const file = path.join(dir, "tasks.md");
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, "utf8")
      .replace("Blocked by: T-01", "Blocked by: unknown-predecessor"),
  );
  const result = implementationInstructions(dir, "en");
  expect(result.frontier).toEqual([]);
  expect(result.issues.join(" ")).toContain("dependency");
});

it.each(["## Later notes", "- Later notes"])(
  "does not attach metadata outside the task subtree: %s",
  (boundary) => {
    const dir = fixture();
    fs.writeFileSync(
      path.join(dir, "tasks.md"),
      [
        "- [ ] T-01 Save",
        "  - Blocked by: none",
        "  - Delivers: Saved content",
        "  - Verify: tests.md#save",
        "  - Cases: C1",
        "",
        boundary,
        "  - Delivers: Unrelated note",
        "  - Verify: unrelated.md",
        "  - Cases: C99",
        "",
      ].join("\n"),
    );
    expect(implementationInstructions(dir, "en").frontier).toEqual([
      expect.objectContaining({
        delivers: "Saved content",
        verification: "tests.md#save",
        cases: ["C1"],
      }),
    ]);
  },
);

it("exposes instructions through the actual CLI without invoking the first-edit gate", () => {
  const dir = fixture();
  const result = spawnSync(
    process.execPath,
    [
      path.resolve("node_modules/tsx/dist/cli.mjs"),
      path.resolve("src/app/cli.ts"),
      "implement",
      dir,
      "--instructions",
      "--json",
    ],
    {
      env: { ...process.env, SUPERFLOW_LANG: "en", NO_UPDATE_NOTIFIER: "1" },
      encoding: "utf8",
    },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).executionPermission).toBe("not-evaluated");
  expect(JSON.parse(result.stdout).frontier[0].id).toBe("T-02");
  const admission = spawnSync(
    process.execPath,
    [
      path.resolve("node_modules/tsx/dist/cli.mjs"),
      path.resolve("src/app/cli.ts"),
      ...JSON.parse(result.stdout).admission.argv.slice(1),
      "--json",
    ],
    { env: { ...process.env, NO_UPDATE_NOTIFIER: "1" }, encoding: "utf8" },
  );
  expect(admission.status).not.toBe(0);
  expect(JSON.parse(admission.stdout).ready).toBe(false);
  const guarded = spawnSync(
    process.execPath,
    [
      path.resolve("node_modules/tsx/dist/cli.mjs"),
      path.resolve("src/app/cli.ts"),
      "implement",
      dir,
    ],
    { env: { ...process.env, NO_UPDATE_NOTIFIER: "1" }, encoding: "utf8" },
  );
  expect(guarded.status).not.toBe(0);
});

it("uses the canonical task identity rather than IDs mentioned in a title", () => {
  const dir = fixture();
  const file = path.join(dir, "tasks.md");
  fs.writeFileSync(
    file,
    "- [ ] Prepare T-01 migration\n  - Blocked by: none\n",
  );
  const result = readTasks(file, "en");
  expect(result.frontier).toEqual([]);
  expect(result.issues.join(" ")).toContain("ID");
});

it.each(["T-01", "t-01", "P01", "1.2"])(
  "preserves the canonical first-token identity %s in navigation and coverage",
  (id) => {
    const dir = fixture();
    const file = path.join(dir, "tasks.md");
    fs.writeFileSync(
      file,
      `- [ ] ${id} Prepare T-99 migration\n  - Blocked by: none\n`,
    );
    const result = readTasks(file, "en");
    const canonical = spawnSync(
      "python3",
      [
        path.resolve("assets/scripts/superflow-test-report-lint.py"),
        "--task-index",
        file,
      ],
      { encoding: "utf8" },
    );
    expect(canonical.status, canonical.stderr).toBe(0);
    expect(result.frontier).toEqual(JSON.parse(canonical.stdout).ids);
    expect(result.frontier).toEqual([id]);
  },
);

it("does not normalize punctuation or dependency case into a different task identity", () => {
  const dir = fixture();
  const file = path.join(dir, "tasks.md");
  for (const body of [
    "- [ ] T-01: Save\n  - Blocked by: none\n",
    "- [x] t-01 Storage\n  - Blocked by: none\n- [ ] T-02 Save\n  - Blocked by: T-01\n",
  ]) {
    fs.writeFileSync(file, body);
    const result = readTasks(file, "en");
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.frontier).toEqual([]);
  }
});

it("derives current context files from the shared manifest, including specs and declared project design", () => {
  const dir = fixture();
  const project = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "superflow-source-project-")),
  );
  temporary.push(project);
  expect(spawnSync("git", ["init", project]).status).toBe(0);
  const change = path.join(project, "changes", "sample");
  fs.mkdirSync(path.dirname(change), { recursive: true });
  fs.cpSync(dir, change, { recursive: true });
  fs.mkdirSync(path.join(change, "specs", "first"), { recursive: true });
  fs.mkdirSync(path.join(change, "specs", "second"), { recursive: true });
  for (const source of [
    "specs/first/spec.md",
    "specs/second/spec.md",
    "requirement-source.md",
  ]) {
    fs.writeFileSync(path.join(change, source), "# Canonical source\n");
  }
  fs.writeFileSync(
    path.join(project, "technical.md"),
    "# Source-level design\n",
  );
  fs.appendFileSync(
    path.join(change, ".sdd/state.yaml"),
    "technical_design: ../../technical.md\n",
  );
  const before = fs.readFileSync(path.join(change, ".sdd/state.yaml"));
  const result = implementationInstructions(change, "en");
  expect(result.issues).toEqual([]);
  expect(result.contextFiles).toEqual(
    expect.arrayContaining([
      path.join(change, "specs/first/spec.md"),
      path.join(change, "specs/second/spec.md"),
      path.join(change, "requirement-source.md"),
      path.join(project, "technical.md"),
    ]),
  );
  fs.unlinkSync(path.join(change, "specs/second/spec.md"));
  fs.writeFileSync(path.join(change, "spec.md"), "# Added source\n");
  const updated = implementationInstructions(change, "en");
  expect(updated.contextFiles).not.toContain(
    path.join(change, "specs/second/spec.md"),
  );
  expect(updated.contextFiles).toContain(path.join(change, "spec.md"));
  expect(fs.readFileSync(path.join(change, ".sdd/state.yaml"))).toEqual(before);
  expect(fs.readdirSync(path.join(change, ".sdd"))).toEqual(["state.yaml"]);
});

it("reports a source inventory failure without advertising a partial ready snapshot", () => {
  const dir = fixture();
  fs.appendFileSync(
    path.join(dir, ".sdd/state.yaml"),
    "technical_design: missing.md\n",
  );
  const result = implementationInstructions(dir, "en");
  expect(result.state).toBe("blocked");
  expect(result.frontier).toEqual([]);
  expect(result.contextFiles).toEqual([]);
  expect(result.issues.join(" ")).toContain("manifest");
  expect(fs.readdirSync(path.join(dir, ".sdd"))).toEqual(["state.yaml"]);
});
