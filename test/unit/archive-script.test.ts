import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "../..");
const ARCHIVE = path.join(
  ROOT,
  "assets",
  "skills",
  "superflow-pipeline",
  "scripts",
  "superflow-archive.sh",
);

let tmp: string;

describe("superflow archive script", () => {
  beforeEach(async () => {
    tmp = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "superflow-archive-script-"),
    );
    tmp = await fs.promises.realpath(tmp);
  });

  afterEach(async () => {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("recognizes a canonical OpenSpec change directory", async () => {
    const project = path.join(tmp, "repo");
    const change = path.join(project, "openspec", "changes", "example-change");
    const scripts = path.join(tmp, "scripts");
    const bin = path.join(tmp, "bin");
    await fs.promises.mkdir(change, { recursive: true });
    await fs.promises.mkdir(scripts, { recursive: true });
    await fs.promises.mkdir(bin, { recursive: true });
    await fs.promises.copyFile(
      ARCHIVE,
      path.join(scripts, "superflow-archive.sh"),
    );
    await writeExecutable(
      path.join(scripts, "superflow-yaml-validate.sh"),
      "#!/usr/bin/env bash\nexit 0\n",
    );
    await writeExecutable(
      path.join(scripts, "superflow-guard.sh"),
      "#!/usr/bin/env bash\nexit 0\n",
    );
    await writeExecutable(
      path.join(scripts, "superflow-state.sh"),
      [
        "#!/usr/bin/env bash",
        'if [[ "$1" == "get" ]]; then',
        '  [[ "$3" == "phase" ]] && echo archive || echo null',
        "fi",
        "",
      ].join("\n"),
    );
    await writeExecutable(
      path.join(bin, "openspec"),
      "#!/usr/bin/env bash\nexit 0\n",
    );

    const result = await execFileAsync(
      path.join(scripts, "superflow-archive.sh"),
      [change, "--dry-run"],
      {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
        },
      },
    );

    expect(result.stdout).toContain(
      "openspec_archive: openspec archive example-change --yes",
    );
    expect(result.stdout).not.toContain("fallback to state-only archive");
  });
  it("recovers a moved change after closeout fails, then remains idempotent", async () => {
    const f = await recoveryFixture();
    await fs.promises.writeFile(path.join(tmp, "fail"), "");
    await expect(f.run(f.change, "--apply")).rejects.toThrow();
    expect(fs.existsSync(f.change)).toBe(false);
    await fs.promises.rm(path.join(tmp, "fail"));
    await fs.promises.writeFile(
      f.doc,
      "---\nstatus: draft\n---\nbody\n---\nstatus: body-example\n",
    );
    await f.run(f.archived, "--apply");
    const doc = await fs.promises.readFile(f.doc, "utf8");
    expect(doc).toContain("archived-with: 2026-10-12-demo");
    expect(doc).toContain("status: final");
    expect(doc).toContain("body\n---\nstatus: body-example");
    const state = await fs.promises.readFile(f.state, "utf8");
    expect(state).toContain("phase: done");
    const log = await fs.promises.readFile(f.log, "utf8");
    const result = await f.run(f.archived, "--apply");
    expect(result.stdout).toContain("already archived");
    expect(await fs.promises.readFile(f.log, "utf8")).toBe(log);
    expect(await fs.promises.readFile(f.doc, "utf8")).toBe(doc);
    expect(log.match(/openspec/g)).toHaveLength(1);
  });

  it("keeps moved dry-run read-only and blocks failed readiness", async () => {
    const f = await recoveryFixture();
    await fs.promises.rename(f.change, f.archived);
    const before = await fs.promises.readFile(f.doc, "utf8");
    await f.run(f.archived, "--dry-run");
    expect(await fs.promises.readFile(f.doc, "utf8")).toBe(before);
    expect(await fs.promises.readFile(f.state, "utf8")).toContain(
      "phase: archive",
    );
    await fs.promises.writeFile(path.join(tmp, "guard-fail"), "");
    await expect(f.run(f.archived, "--apply")).rejects.toThrow();
    expect(await fs.promises.readFile(f.doc, "utf8")).toBe(before);
  });

  it("rejects ambiguous archive targets and never guesses from a missing path", async () => {
    const f = await recoveryFixture();
    await fs.promises.mkdir(path.join(path.dirname(f.archived), "old-demo"));
    await expect(f.run(f.change, "--apply")).rejects.toThrow(
      /explicit archive path/,
    );
    await expect(f.run(f.change, "--apply")).rejects.toThrow(/not found/);
    expect(await fs.promises.readFile(f.log, "utf8")).not.toContain(
      "transition",
    );
  });

  it("blocks standard closeout when OpenSpec is unavailable", async () => {
    const f = await recoveryFixture();
    await fs.promises.rm(path.join(tmp, "bin/openspec"));
    await expect(f.run(f.change, "--apply", "/usr/bin:/bin")).rejects.toThrow(
      /OpenSpec.*required/,
    );
    expect(
      await fs.promises.readFile(
        path.join(f.change, ".sdd/state.yaml"),
        "utf8",
      ),
    ).toContain("archived: false");
    expect(fs.existsSync(f.log)).toBe(false);
  });

  it("rejects archived state inside a physically active standard directory", async () => {
    const f = await recoveryFixture();
    await fs.promises.writeFile(
      path.join(f.change, ".sdd/state.yaml"),
      "phase: done\narchived: true\n",
    );
    await expect(f.run(f.change, "--apply")).rejects.toThrow(
      /active.*SUPERFLOW_FORCE_PHASE/,
    );
    expect(fs.existsSync(f.log)).toBe(false);
  });

  it("preserves state-only closeout for non-standard task directories", async () => {
    const f = await recoveryFixture();
    const task = path.join(tmp, "repo/custom/tasks/demo");
    await fs.promises.mkdir(path.dirname(task), { recursive: true });
    await fs.promises.rename(f.change, task);
    const result = await f.run(task, "--apply");
    expect(result.stdout).toContain("fallback to state-only archive");
    expect(
      await fs.promises.readFile(path.join(task, ".sdd/state.yaml"), "utf8"),
    ).toContain("phase: done");
    expect(await fs.promises.readFile(f.log, "utf8")).toBe("transition\n");
    expect(await fs.promises.readFile(f.doc, "utf8")).toContain(
      "archived-with: demo",
    );
  });

  it("rejects symbolic change directories and OpenSpec ancestors", async () => {
    const f = await recoveryFixture();
    const link = path.join(tmp, "link");
    await fs.promises.symlink(f.change, link);
    await expect(f.run(link, "--apply")).rejects.toThrow(/canonical/);
    const linkedProject = path.join(tmp, "linked-repo");
    await fs.promises.mkdir(linkedProject);
    await fs.promises.symlink(
      path.join(tmp, "repo/openspec"),
      path.join(linkedProject, "openspec"),
    );
    await expect(
      f.run(path.join(linkedProject, "openspec/changes/demo"), "--apply"),
    ).rejects.toThrow(/canonical/);
    await fs.promises.rename(f.change, f.archived);
    await expect(
      f.run(
        path.join(linkedProject, "openspec/changes/archive/2026-10-12-demo"),
        "--apply",
      ),
    ).rejects.toThrow(/canonical/);
  });
});

async function writeExecutable(file: string, content: string) {
  await fs.promises.writeFile(file, content, { mode: 0o755 });
}

async function recoveryFixture() {
  const project = path.join(tmp, "repo");
  const change = path.join(project, "openspec/changes/demo");
  const archived = path.join(
    project,
    "openspec/changes/archive/2026-10-12-demo",
  );
  const scripts = path.join(tmp, "scripts");
  const bin = path.join(tmp, "bin");
  const log = path.join(tmp, "calls");
  const doc = path.join(project, "docs/design.md");
  for (const dir of [
    change,
    path.dirname(archived),
    scripts,
    bin,
    path.dirname(doc),
  ]) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
  await fs.promises.mkdir(path.join(change, ".sdd"));
  await fs.promises.writeFile(
    path.join(change, ".sdd/state.yaml"),
    "phase: archive\narchived: false\ndesign_doc: docs/design.md\n",
  );
  await fs.promises.writeFile(
    doc,
    "---\nstatus: draft\n---\nbody\n---\nstatus: body-example\n",
  );
  await fs.promises.copyFile(
    ARCHIVE,
    path.join(scripts, "superflow-archive.sh"),
  );
  await writeExecutable(
    path.join(scripts, "superflow-yaml-validate.sh"),
    '#!/usr/bin/env bash\ntest -f "$1/.sdd/state.yaml"\n',
  );
  await writeExecutable(
    path.join(scripts, "superflow-guard.sh"),
    `#!/usr/bin/env bash
[[ ! -f "${tmp}/guard-fail" ]] || exit 1
[[ "$(sed -n 's/^archived: //p' "$1/.sdd/state.yaml")" == false ]]
`,
  );
  await writeExecutable(
    path.join(scripts, "superflow-state.sh"),
    `#!/usr/bin/env bash
if [[ "$1" == get ]]; then
  sed -n "s/^$3: //p" "$2/.sdd/state.yaml"
else
  [[ ! -f "${tmp}/fail" ]] || exit 1
  echo transition >> "${log}"
  sed -i.bak -e 's/phase: archive/phase: done/' -e 's/archived: false/archived: true/' "$2/.sdd/state.yaml"
fi
`,
  );
  await writeExecutable(
    path.join(bin, "openspec"),
    `#!/usr/bin/env bash
echo openspec >> "${log}"
[[ "$PWD" == "${project}" ]] || exit 1
mv "${change}" "${archived}"
`,
  );
  const run = (
    target: string,
    mode: string,
    commandPath = `${bin}:${process.env.PATH}`,
  ) =>
    execFileAsync(path.join(scripts, "superflow-archive.sh"), [target, mode], {
      env: { ...process.env, PATH: commandPath },
    });
  return {
    change,
    archived,
    doc,
    log,
    run,
    state: path.join(archived, ".sdd/state.yaml"),
  };
}
