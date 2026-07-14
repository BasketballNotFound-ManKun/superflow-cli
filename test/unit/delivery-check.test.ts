import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "../..");
const DELIVERY = path.join(
  ROOT,
  "assets",
  "scripts",
  "superflow-delivery-check.sh",
);

let tmp: string;

async function write(relative: string, content: string): Promise<void> {
  const file = path.join(tmp, relative);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content);
}

describe("superflow delivery check", () => {
  beforeEach(async () => {
    tmp = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "superflow-delivery-"),
    );
    await execFileAsync("git", ["init"], { cwd: tmp });
    await write("src/main/java/example/App.java", "class App {}\n");
  });

  afterEach(async () => {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("detects active lifecycle state even when .sdd-enforced is missing", async () => {
    await write(
      "openspec/changes/sample/.sdd/state.yaml",
      "phase: implement\narchived: false\n",
    );
    await execFileAsync("git", ["add", "src/main/java/example/App.java"], {
      cwd: tmp,
    });

    await expect(
      execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
    ).rejects.toMatchObject({
      stdout: expect.stringContaining("没有 staged 当前任务的 test-report.md"),
    });
  });

  it("does not enforce SDD delivery when no lifecycle is active", async () => {
    await execFileAsync("git", ["add", "src/main/java/example/App.java"], {
      cwd: tmp,
    });

    await expect(
      execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
    ).resolves.toMatchObject({ stdout: "" });
  });

  it("does not revalidate incomplete documents moved into archive", async () => {
    await write(".sdd-enforced", "");
    await write(
      "openspec/changes/archive/2026-07-14-sample/embedded-changes/" +
        "p01-history/tasks.md",
      "- [ ] historical task\n",
    );
    await execFileAsync("git", ["add", ".sdd-enforced", "openspec"], {
      cwd: tmp,
    });

    await expect(
      execFileAsync("bash", [DELIVERY, "--check-staged", tmp]),
    ).resolves.toMatchObject({ stdout: "SDD 交付完整性检查通过\n" });
  });
});
