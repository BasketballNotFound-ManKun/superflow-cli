import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const OPENSPEC_DIR = "openspec";
const CONFIG_FILE = "config.yaml";
const CHANGES_DIR = "changes";
const MAX_SEARCH_DEPTH = 3;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  ".venv",
  "venv",
]);

function isOpenspecWorkspace(dir: string): boolean {
  return (
    existsSync(path.join(dir, CONFIG_FILE)) &&
    existsSync(path.join(dir, CHANGES_DIR))
  );
}

function searchWorkspaceRoot(dir: string, depth: number): string | null {
  if (depth > MAX_SEARCH_DEPTH) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    const candidate = path.join(dir, name);
    if (name === OPENSPEC_DIR && isOpenspecWorkspace(candidate)) {
      return candidate;
    }
    const nested = searchWorkspaceRoot(candidate, depth + 1);
    if (nested) return nested;
  }
  return null;
}

/**
 * 解析 OpenSpec 工作区的 changes 根目录。
 *
 * openspec CLI 支持把工作区放在仓库子目录（如 `doc/openspec/`，由
 * `config.yaml` 标记），而 superflow 此前硬编码 `<repo>/openspec/changes`，
 * 导致 `superflow check` 等命令在这类仓库直接失败。探测顺序：
 *
 * 1. 环境变量 `SUPERFLOW_OPENSPEC_DIR`（显式指定 openspec 工作区目录）
 * 2. `<projectPath>/openspec/config.yaml`（openspec CLI 默认工作区位置）
 * 3. 自 `<projectPath>` 向下有限深度搜索 `openspec/config.yaml` 工作区
 *    （跳过 node_modules/.git/dist 等与隐藏目录）
 * 4. 回退 `<projectPath>/openspec/changes`（兼容无 config.yaml 的旧仓库）
 */
export function resolveChangesRoot(projectPath: string): string {
  const envDir = process.env.SUPERFLOW_OPENSPEC_DIR;
  if (envDir) {
    const envChanges = path.resolve(envDir, CHANGES_DIR);
    if (existsSync(envChanges)) return envChanges;
  }

  const defaultRoot = path.join(projectPath, OPENSPEC_DIR);
  if (isOpenspecWorkspace(defaultRoot)) {
    return path.join(defaultRoot, CHANGES_DIR);
  }

  const discovered = searchWorkspaceRoot(projectPath, 0);
  if (discovered) {
    return path.join(discovered, CHANGES_DIR);
  }

  return path.join(defaultRoot, CHANGES_DIR);
}

/** 解析 change 名称到实际目录；找不到时返回默认拼接路径（保持旧报错行为）。 */
export function resolveChangeDirByName(
  projectPath: string,
  changeName: string,
): string {
  const changesRoot = resolveChangesRoot(projectPath);
  const changeDir = path.join(changesRoot, changeName);
  if (existsSync(changeDir)) return changeDir;
  return path.join(projectPath, OPENSPEC_DIR, CHANGES_DIR, changeName);
}
