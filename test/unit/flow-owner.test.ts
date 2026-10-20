import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deploySkill } from "../../src/domains/skill/deploy.js";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";

const root = path.resolve(__dirname, "../..");
const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

const matrix = (["codex", "claude"] as const).flatMap((agent) =>
  (["zh", "en"] as const).flatMap((language) =>
    (["project", "global"] as const).map((scope) => ({
      agent,
      language,
      scope,
    })),
  ),
);

describe("ordinary Flow Owner installed lifecycle", () => {
  it.each(matrix)(
    "$agent/$language/$scope resumes execution and preserves lifecycle gates",
    async ({ agent, language, scope }) => {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), "superflow-owner-"),
      );
      temporary.push(directory);
      const project = path.join(directory, "project");
      const home = path.join(directory, "home");
      const host = scope === "project" ? project : home;
      const target = path.join(host, `.${agent}`, "skills");
      fs.mkdirSync(home, { recursive: true });
      await deploySkill(
        "superflow",
        path.join(root, "assets", language === "en" ? "skills-en" : "skills"),
        target,
        { agent },
      );
      const scripts = path.join(target, "superflow", "scripts");
      const change = path.join(project, "openspec", "changes", "example");
      fs.mkdirSync(change, { recursive: true });
      const env = fixtureProcessEnv(home, {
        ...process.env,
        SDD_AUTO_TRANSITION: "true",
        SDD_CONTEXT_COMPRESSION: "off",
      });
      const run = (command: string, ...args: string[]) =>
        spawnSync("bash", [path.join(scripts, command), ...args], {
          cwd: project,
          env,
          encoding: "utf8",
        });
      const state = (...args: string[]) => run("superflow-state.sh", ...args);
      const set = (key: string, value: string) => {
        const result = state("set", change, key, value);
        expect(result.status, result.stderr).toBe(0);
      };
      expect(state("init", change, "full", "implement").status).toBe(0);

      // A phase alone cannot imply that an execution contract is available.
      expect(state("next", change).stdout).toContain(
        "SKILL: superflow-handoff",
      );
      set("implementation_prompt", "prompt/implementation.md");
      expect(state("next", change).stdout).toContain(
        "SKILL: superflow-handoff",
      );
      fs.mkdirSync(path.join(change, "prompt"));
      fs.writeFileSync(
        path.join(change, "prompt/implementation.md"),
        "Frozen contract\n",
      );
      expect(state("next", change).stdout).toContain("SKILL: superflow-build");
      set(
        "implementation_prompt",
        path.join(change, "prompt/implementation.md"),
      );
      expect(state("next", change).stdout).toContain("SKILL: superflow-build");

      set("build_mode", "owner");
      set("isolation", "branch");
      set("tdd_mode", "tdd");
      set("review_mode", "standard");
      const valid = run("superflow-yaml-validate.sh", change);
      expect(valid.status, valid.stdout + valid.stderr).toBe(0);

      fs.writeFileSync(
        path.join(change, "tasks.md"),
        "- [ ] Simplify labels\n",
      );
      const light = state("scale", change);
      expect(light.status, light.stderr).toBe(0);
      expect(light.stdout).toContain("verify_mode: light");
      const risks =
        language === "en"
          ? [
              "database",
              "cross-repo",
              "status field",
              "enum",
              "real entry",
              "scheduled job",
              "third party",
            ]
          : [
              "数据库",
              "跨仓",
              "状态字段",
              "枚举",
              "真实入口",
              "定时任务",
              "第三方",
            ];
      for (const risk of risks) {
        fs.writeFileSync(
          path.join(change, "tasks.md"),
          `- [ ] Change ${risk}\n`,
        );
        const scaled = state("scale", change);
        expect(scaled.status, scaled.stderr).toBe(0);
        expect(scaled.stdout, risk).toContain("verify_mode: full");
      }

      // Explicit manual control and existing modes remain authoritative.
      set("auto_transition", "false");
      expect(state("next", change).stdout).toContain("NEXT: manual");
      expect(state("next", change).stdout).toContain("SKILL: superflow-build");
      set("auto_transition", "true");
      set("build_mode", "subagent-driven-development");
      expect(state("transition", change, "implement-complete").status).toBe(1);
      set("build_mode", "direct");
      expect(state("transition", change, "implement-complete").status).toBe(1);
      set("build_mode", "owner");
      set("review_mode", "null");
      expect(state("transition", change, "implement-complete").status).toBe(1);
      set("review_mode", "standard");

      const completed = state("transition", change, "implement-complete");
      expect(completed.status, completed.stderr).toBe(0);
      expect(state("phase", change).stdout.trim()).toBe("verify");
      expect(state("next", change).stdout).toContain("SKILL: superflow-verify");
      // Failed verification returns to implementation without losing the contract.
      expect(state("transition", change, "verify-pass").status).toBe(1);
      expect(state("transition", change, "verify-fail").status).toBe(0);
      expect(state("get", change, "build_mode").stdout.trim()).toBe("owner");
      expect(state("next", change).stdout).toContain("SKILL: superflow-build");
    },
    30_000,
  );
});
