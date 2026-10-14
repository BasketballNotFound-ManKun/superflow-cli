import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import type { AgentSelection, InstallScope, Language } from "../types.js";
import { runCommand } from "../platform/process.js";

export class WizardCancelled extends Error {
  constructor() {
    super("Wizard cancelled");
  }
}

export function canPrompt(options: {
  yes?: boolean;
  json?: boolean;
  dryRun?: boolean;
  resume?: boolean;
}): boolean {
  return Boolean(
    stdin.isTTY &&
    stdout.isTTY &&
    !options.yes &&
    !options.json &&
    !options.dryRun &&
    !options.resume,
  );
}

export function parseAgentInput(
  value: string,
  fallback: AgentSelection = "both",
): AgentSelection | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "a" || normalized === "both") return "both";
  const selected = new Set<"claude" | "codex">();
  for (const part of normalized.split(/[,\s]+/).filter(Boolean)) {
    if (["1", "claude", "c"].includes(part)) selected.add("claude");
    else if (["2", "codex", "x"].includes(part)) selected.add("codex");
    else return null;
  }
  if (selected.size === 2) return "both";
  return selected.values().next().value ?? null;
}

export async function detectedAgentDefault(): Promise<AgentSelection> {
  const available = await Promise.all(
    ["claude", "codex"].map(async (agent) => {
      try {
        const result = await runCommand(agent, ["--version"], {
          timeout: 3_000,
        });
        return result.code === 0 ? agent : null;
      } catch {
        return null;
      }
    }),
  );
  if (available[0] && !available[1]) return "claude";
  if (available[1] && !available[0]) return "codex";
  return "both";
}

/** One readline session owns the complete wizard; no nested prompts or state. */
export class TerminalWizard {
  private readonly reader = createInterface({ input: stdin, output: stdout });
  private pendingReject?: (reason: Error) => void;
  private closed = false;
  constructor(public language: Language) {
    this.reader.on?.("close", () => {
      this.closed = true;
      this.pendingReject?.(new WizardCancelled());
    });
    this.reader.on?.("SIGINT", () => this.reader.close());
  }
  text(zh: string, en: string): string {
    return this.language === "zh" ? zh : en;
  }
  close(): void {
    this.reader.close();
  }
  private async answer(): Promise<string> {
    if (this.closed) throw new WizardCancelled();
    const answer = await new Promise<string>((resolve, reject) => {
      this.pendingReject = reject;
      this.reader.question("> ").then(resolve, reject);
    }).finally(() => {
      this.pendingReject = undefined;
    });
    if (["q", "quit", "cancel", "取消"].includes(answer.trim().toLowerCase())) {
      throw new WizardCancelled();
    }
    return answer.trim().toLowerCase();
  }
  async selectLanguage(): Promise<Language> {
    console.log("\nLanguage / 语言: 1) English  2) 中文");
    console.log(
      this.text("回车沿用中文；输入 q 取消", "Enter keeps English; q cancels"),
    );
    while (true) {
      const value = await this.answer();
      if (!value) return this.language;
      if (["1", "en", "english"].includes(value)) return (this.language = "en");
      if (["2", "zh", "chinese"].includes(value)) return (this.language = "zh");
      console.log(this.text("请输入 1 / 2 / en / zh", "Enter 1 / 2 / en / zh"));
    }
  }
  async selectAgents(fallback: AgentSelection): Promise<AgentSelection> {
    console.log(this.text("\n选择 Agent 工具：", "\nSelect Agent tools:"));
    console.log("  1) Claude Code  2) Codex  a) Claude Code + Codex");
    console.log(this.text(`回车选择 ${fallback}`, `Enter selects ${fallback}`));
    while (true) {
      const value = parseAgentInput(await this.answer(), fallback);
      if (value) return value;
      console.log(this.text("请输入 1、2、1,2 或 a", "Enter 1, 2, 1,2, or a"));
    }
  }
  async selectScope(allowAuto: boolean): Promise<InstallScope | "auto"> {
    console.log(this.text("\n选择安装范围：", "\nSelect installation scope:"));
    if (allowAuto)
      console.log(
        this.text(
          "  auto) 沿用现有安装（默认）",
          "  auto) Existing installations (default)",
        ),
      );
    console.log(
      this.text(
        "  global) 全局  project) 当前项目",
        "  global) Global  project) Current project",
      ),
    );
    while (true) {
      const value = (await this.answer()) || (allowAuto ? "auto" : "global");
      if (
        value === "global" ||
        value === "project" ||
        (allowAuto && value === "auto")
      )
        return value;
      console.log(this.text("请输入有效范围", "Enter a listed scope"));
    }
  }
  async selectUpdateMode(): Promise<"full" | "assets" | "preview"> {
    console.log(this.text("\n选择更新内容：", "\nChoose what to update:"));
    console.log(
      this.text(
        "  1) 完整更新：CLI、配套资产、依赖（推荐）",
        "  1) Complete update: CLI, assets, dependencies (recommended)",
      ),
    );
    console.log(
      this.text(
        "  2) 只刷新当前版本配套资产",
        "  2) Refresh assets for the installed version",
      ),
    );
    console.log(
      this.text(
        "  3) 只预览完整更新计划",
        "  3) Preview the complete update plan only",
      ),
    );
    while (true) {
      const value = (await this.answer()) || "1";
      if (value === "1") return "full";
      if (value === "2") return "assets";
      if (value === "3") return "preview";
      console.log(this.text("请输入 1 / 2 / 3", "Enter 1 / 2 / 3"));
    }
  }
  async confirm(): Promise<boolean> {
    console.log(
      this.text(
        "\n确认执行以上变更？[y/N]（q 取消）",
        "\nApply the changes above? [y/N] (q cancels)",
      ),
    );
    while (true) {
      const value = await this.answer();
      if (["y", "yes", "是"].includes(value)) return true;
      if (["", "n", "no", "否"].includes(value)) return false;
      console.log(this.text("请输入 y 或 n", "Enter y or n"));
    }
  }
}
