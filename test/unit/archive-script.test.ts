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
  });

  afterEach(async () => {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("recognizes a canonical OpenSpec change directory", async () => {
    const project = path.join(tmp, "repo");
    const change = path.join(
      project,
      "openspec",
      "changes",
      "example-change",
    );
    const scripts = path.join(tmp, "scripts");
    const bin = path.join(tmp, "bin");
    await fs.promises.mkdir(change, { recursive: true });
    await fs.promises.mkdir(scripts, { recursive: true });
    await fs.promises.mkdir(bin, { recursive: true });
    await fs.promises.copyFile(ARCHIVE, path.join(scripts, "superflow-archive.sh"));
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
    await writeExecutable(path.join(bin, "openspec"), "#!/usr/bin/env bash\nexit 0\n");

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
});

async function writeExecutable(file: string, content: string) {
  await fs.promises.writeFile(file, content, { mode: 0o755 });
}
