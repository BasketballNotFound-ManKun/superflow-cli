import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "../..");
const HOOK = path.join(
  ROOT,
  "assets",
  "scripts",
  "superflow-archive-command-hook.sh",
);
const ARCHIVE = path.join(
  ROOT,
  "assets",
  "skills",
  "superflow-pipeline",
  "scripts",
  "superflow-archive.sh",
);

let tmp: string;

describe("superflow archive command hook", () => {
  beforeEach(async () => {
    tmp = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "superflow-archive-hook-"),
    );
    await execFileAsync("git", ["init"], { cwd: tmp });
    await fs.promises.mkdir(
      path.join(tmp, "openspec", "changes", "legacy-change"),
      { recursive: true },
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("blocks direct OpenSpec archive when lifecycle state is missing", async () => {
    const input = JSON.stringify({
      tool_input: {
        command: "openspec archive legacy-change --yes",
        cwd: tmp,
      },
    });

    await expect(
      execFileAsync("bash", ["-c", 'printf %s "$HOOK_INPUT" | bash "$HOOK"'], {
        env: {
          ...process.env,
          HOOK_INPUT: input,
          HOOK,
          SUPERFLOW_ARCHIVE_SCRIPT: ARCHIVE,
        },
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("归档门禁未通过"),
    });
  });

  it("ignores unrelated shell commands", async () => {
    const input = JSON.stringify({
      tool_input: { command: "git status --short", cwd: tmp },
    });

    await expect(
      execFileAsync("bash", ["-c", 'printf %s "$HOOK_INPUT" | bash "$HOOK"'], {
        env: {
          ...process.env,
          HOOK_INPUT: input,
          HOOK,
          SUPERFLOW_ARCHIVE_SCRIPT: ARCHIVE,
        },
      }),
    ).resolves.toMatchObject({ stdout: "" });
  });
});
