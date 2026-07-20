import { execFileSync } from "child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "fs";
import path from "path";
import type {
  ManagedProfile,
  ManagedTaskContract,
} from "./types.js";

export interface ResolveManagedInputOptions {
  projectRoot?: string;
  relatedProjectRoots?: string[];
  profile?: ManagedProfile | "auto";
}

export interface ResolvedManagedInput {
  request: string;
  projectRoot: string;
  relatedProjectRoots: string[];
  profile?: ManagedProfile | "auto";
  source: ManagedTaskContract["source"];
  taskPromptPath?: string;
}

export function resolveManagedInput(
  rawInput: string,
  options: ResolveManagedInputOptions = {},
): ResolvedManagedInput {
  const request = rawInput.trim();
  if (!request) throw new Error("托管任务内容不能为空");
  const configuredRoot = canonicalRoot(options.projectRoot ?? process.cwd());
  const candidate = path.resolve(configuredRoot, request);
  if (!existsSync(candidate)) {
    return {
      request,
      projectRoot: configuredRoot,
      relatedProjectRoots: normalizeRoots(options.relatedProjectRoots),
      profile: options.profile,
      source: "direct_prompt",
    };
  }

  const resolved = realpathSync(candidate);
  const promptPath = statSync(resolved).isDirectory()
    ? promptFromChangeDirectory(resolved)
    : resolved;
  rejectSddTasksChecklist(promptPath);
  const projectRoot = options.projectRoot
    ? configuredRoot
    : gitProjectRoot(path.dirname(promptPath)) ?? configuredRoot;
  const relatedProjectRoots = normalizeRoots(options.relatedProjectRoots);
  assertPromptInsideAllowedRoots(promptPath, [projectRoot, ...relatedProjectRoots]);
  const isSdd = isSddPrompt(promptPath);

  return {
    request: promptPath,
    projectRoot,
    relatedProjectRoots,
    profile:
      options.profile && options.profile !== "auto"
        ? options.profile
        : isSdd
          ? "sdd"
          : "engineering",
    source: isSdd ? "sdd" : "task_file",
    taskPromptPath: promptPath,
  };
}

function promptFromChangeDirectory(changeDir: string): string {
  const stateFile = path.join(changeDir, ".sdd", "state.yaml");
  if (!existsSync(stateFile)) {
    throw new Error("目录缺少 .sdd/state.yaml，无法定位 implementation_prompt");
  }
  const state = readFileSync(stateFile, "utf-8");
  const match = state.match(/^implementation_prompt:\s*(.+?)\s*$/m);
  const configured = match ? unquote(match[1]) : "";
  if (!configured || configured === "null") {
    throw new Error(".sdd/state.yaml 尚未记录可执行的 implementation_prompt");
  }
  const promptPath = realpathIfExists(path.resolve(changeDir, configured));
  if (!promptPath || !statSync(promptPath).isFile()) {
    throw new Error(`implementation_prompt 文件不存在：${configured}`);
  }
  return promptPath;
}

function rejectSddTasksChecklist(promptPath: string): void {
  const normalized = promptPath.replaceAll("\\", "/");
  if (
    path.basename(promptPath).toLowerCase() === "tasks.md" &&
    normalized.includes("/openspec/changes/")
  ) {
    throw new Error(
      "tasks.md 是任务清单，不是 Agent 执行 Prompt；请提供 prompt/*.md 或 change 目录",
    );
  }
}

function assertPromptInsideAllowedRoots(
  promptPath: string,
  roots: string[],
): void {
  if (roots.some((root) => isInside(promptPath, root))) return;
  throw new Error("任务 Prompt 不在项目目录或允许的关联仓库内");
}

function isInside(file: string, root: string): boolean {
  const relative = path.relative(canonicalRoot(root), canonicalRoot(file));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeRoots(roots: string[] = []): string[] {
  return [...new Set(roots.map(canonicalRoot))].sort();
}

function canonicalRoot(value: string): string {
  const resolved = path.resolve(value);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

function gitProjectRoot(directory: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: directory,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function isSddPrompt(promptPath: string): boolean {
  return promptPath.replaceAll("\\", "/").includes("/openspec/changes/");
}

function realpathIfExists(value: string): string | null {
  return existsSync(value) ? realpathSync(value) : null;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
