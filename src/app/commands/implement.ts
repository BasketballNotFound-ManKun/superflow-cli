import {
  checkSkillDeployment,
  type SkillCheckOptions,
} from "../../domains/skill/check.js";
import { runCodingReady, resolveChangeDir } from "./change-guard.js";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readTasks, parseSimpleYaml } from "./status.js";
import { resolveCliLanguage } from "../../domains/config/cli-help.js";
import { ASSETS_DIR } from "../../platform/assets.js";
import type { Language } from "../../types.js";

const SKILL_NAME = "superflow-handoff";

export async function implementCommand(
  change?: string,
  options: SkillCheckOptions & { instructions?: boolean; json?: boolean } = {},
): Promise<void> {
  if (options.instructions) {
    if (!change)
      throw new Error(
        resolveCliLanguage() === "en"
          ? "superflow implement <change> --instructions requires a change"
          : "superflow implement <change> --instructions 需要指定变更",
      );
    const result = implementationInstructions(
      resolveChangeDir(change),
      resolveCliLanguage(),
    );
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(
        `${result.phase}: ${result.progress.complete}/${result.progress.total}`,
      );
      for (const task of result.frontier) {
        console.log(`${task.title} (${result.tasksPath}:${task.line})`);
        if (task.delivers) console.log(`  Delivers: ${task.delivers}`);
        if (task.verification) console.log(`  Verify: ${task.verification}`);
        if (task.cases.length) console.log(`  Cases: ${task.cases.join(", ")}`);
      }
      for (const issue of result.issues) console.log(`! ${issue}`);
      console.log(result.instruction);
    }
    return;
  }
  if (options.json)
    throw new Error(
      resolveCliLanguage() === "en"
        ? "--json requires --instructions"
        : "--json 需要配合 --instructions",
    );
  if (change) {
    runCodingReady(change);
  }
  checkSkillDeployment(SKILL_NAME, options);
}

/** Read-only navigation; the existing admission and delivery owners remain authoritative. */
export function implementationInstructions(
  changeDir: string,
  language: Language,
) {
  const root = realpathSync(changeDir);
  const state = parseSimpleYaml(
    readFileSync(path.join(root, ".sdd/state.yaml"), "utf8"),
  );
  const phase = state.phase ?? "unknown";
  const tasksPath = path.join(root, "tasks.md");
  const progress = readTasks(tasksPath, language);
  const context = implementationContext(root, language);
  const issues = [...progress.issues, ...context.issues];
  const frontier =
    phase === "implement" && issues.length === 0
      ? progress.tasks.filter((task) => progress.frontier.includes(task.id))
      : [];
  const status =
    phase !== "implement" || issues.length
      ? "blocked"
      : progress.total > 0 && progress.done === progress.total
        ? "tasks-complete"
        : frontier.length
          ? "ready"
          : "needs-context";
  return {
    snapshotOnly: true,
    executionPermission: "not-evaluated",
    changeDir: root,
    phase,
    state: status,
    workflow: {
      buildMode: state.build_mode ?? null,
      reviewMode: state.review_mode ?? null,
      autoTransition: state.auto_transition ?? null,
      isolation: state.isolation ?? null,
      tddMode: state.tdd_mode ?? null,
      contextCompression: state.context_compression ?? null,
      implementationPrompt: state.implementation_prompt ?? null,
    },
    tasksPath,
    progress: {
      complete: progress.done,
      total: progress.total,
      remaining: progress.total - progress.done,
    },
    frontier,
    issues,
    contextFiles: context.files,
    admission: {
      argv: ["superflow", "check", root, "--level", "coding-ready"],
    },
    resume: {
      argv: [
        process.execPath,
        path.join(ASSETS_DIR, "scripts/superflow-review-coverage.mjs"),
        root,
      ],
    },
    instruction:
      language === "en"
        ? "Navigation only, not permission or acceptance. Check admission/resume; read the canonical task and tests. Deliver one runnable capability and its required signals before expanding. Missing dependencies or verification: inspect the frozen contract, do not invent an order. Continue through required work and independent review."
        : "仅导航，不是准入或验收结论。核准入/续跑，读取原任务与tests；先交付一块可运行能力及其必测信号，再扩展。缺依赖或验证引用先核冻结合同，不猜顺序。持续完成必需工作和独立评审。",
  };
}

function implementationContext(root: string, language: Language) {
  try {
    // The handoff inventory owns declared source scope; do not guess document names.
    const manifest = JSON.parse(
      execFileSync(
        "bash",
        [
          path.join(
            ASSETS_DIR,
            "skills/superflow/scripts/superflow-handoff.sh",
          ),
          root,
          "--manifest",
        ],
        { encoding: "utf8", timeout: 30000, stdio: "pipe" },
      ),
    );
    if (
      manifest.canonical !== "openspec-sdd" ||
      !Array.isArray(manifest.sources)
    )
      throw new Error("Invalid source manifest");
    const files = manifest.sources.map((source: { path: string }) => {
      if (!source || typeof source.path !== "string")
        throw new Error("Invalid source path");
      return path.resolve(root, source.path);
    }) as string[];
    return { files, issues: [] as string[] };
  } catch {
    return {
      files: [] as string[],
      issues: [
        language === "en"
          ? "Source manifest unavailable; check the declared technical_design and superflow-handoff.sh --manifest."
          : "来源 manifest 不可读取；请核 technical_design 声明及 superflow-handoff.sh --manifest。",
      ],
    };
  }
}
