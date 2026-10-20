import { createHash } from "crypto";
import { execFileSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "fs";
import path from "path";
import type { ManagedTaskContract } from "./types.js";
import { managedTaskDir } from "./paths.js";
import { updateManagedWorkspaceBindingContext } from "./context-manifest.js";

export interface ManagedRepositoryBinding {
  configuredRoot: string;
  realRoot: string;
  repositoryIdentity: string;
  worktreeIdentity: string | null;
  branch: string | null;
  headAtStart: string | null;
  /** Runner-recorded Git identity after native initialization or first commit. */
  nativeInitialized?: Pick<
    ManagedRepositoryBinding,
    "repositoryIdentity" | "worktreeIdentity" | "headAtStart"
  >;
}

export interface ManagedWorkspaceBinding {
  schemaVersion: 1;
  taskId: string;
  taskLocator: string;
  repositories: ManagedRepositoryBinding[];
}

export function writeManagedWorkspaceBinding(
  contract: ManagedTaskContract,
): ManagedWorkspaceBinding {
  const binding = {
    schemaVersion: 1,
    taskId: contract.taskId,
    taskLocator: path.join(".superflow", "tasks", contract.taskId),
    repositories: [contract.projectRoot, ...contract.relatedProjectRoots].map(
      repositoryBinding,
    ),
  } satisfies ManagedWorkspaceBinding;
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  writeJsonAtomic(path.join(taskDir, "workspace-binding.json"), binding);
  writeFileSync(
    path.join(taskDir, "workspace-binding.md"),
    renderBinding(binding, contract),
    "utf-8",
  );
  return binding;
}

export function ensureManagedWorkspaceBinding(
  contract: ManagedTaskContract,
): ManagedWorkspaceBinding {
  const file = path.join(
    managedTaskDir(contract.projectRoot, contract.taskId),
    "workspace-binding.json",
  );
  const binding = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf-8")) as ManagedWorkspaceBinding)
    : writeManagedWorkspaceBinding(contract);
  validateManagedWorkspaceBinding(binding, contract);
  if (contract.profile === "native") {
    const updated = structuredClone(binding);
    let promoted = false;
    updated.repositories.forEach((frozen) => {
      if (frozen.worktreeIdentity !== null && frozen.headAtStart !== null)
        return;
      const current = repositoryBinding(frozen.configuredRoot);
      if (!current.worktreeIdentity) return;
      const identity = frozen.nativeInitialized ?? frozen;
      if (
        identity.worktreeIdentity &&
        (identity.headAtStart || !current.headAtStart)
      )
        return;
      frozen.nativeInitialized = {
        repositoryIdentity: current.repositoryIdentity,
        worktreeIdentity: current.worktreeIdentity,
        headAtStart: current.headAtStart,
      };
      promoted = true;
    });
    if (promoted) {
      updateManagedWorkspaceBindingContext(contract, () =>
        writeJsonAtomic(file, updated),
      );
      return updated;
    }
  }
  return binding;
}

export function managedWorkspaceBindingFingerprint(
  binding: ManagedWorkspaceBinding,
): string {
  return sha256(JSON.stringify(binding));
}

export function validateManagedWorkspaceBinding(
  binding: ManagedWorkspaceBinding,
  contract: ManagedTaskContract,
): void {
  const roots = [contract.projectRoot, ...contract.relatedProjectRoots];
  const invalid =
    binding.schemaVersion !== 1 ||
    binding.taskId !== contract.taskId ||
    binding.repositories.length !== roots.length;
  if (invalid) {
    throw bindingError(
      contract,
      "绑定元数据无效",
      "binding metadata is invalid",
    );
  }
  roots.forEach((root, index) => {
    const frozen = binding.repositories[index];
    const current = repositoryBinding(root);
    if (frozen.configuredRoot !== current.configuredRoot) {
      throw bindingError(
        contract,
        `工作区根目录已变化：${root}`,
        `workspace root changed: ${root}`,
      );
    }
    if (frozen.realRoot !== current.realRoot) {
      throw bindingError(
        contract,
        `工作区真实目录已变化：${root}`,
        `workspace real directory changed: ${root}`,
      );
    }
    // Native Git initialization is allowed only for an originally non-Git
    // workspace, after both configured and canonical roots were checked.
    const identity =
      contract.profile === "native"
        ? (frozen.nativeInitialized ?? frozen)
        : frozen;
    const nativeInitialization =
      contract.profile === "native" && identity.worktreeIdentity === null;
    // A newly initialized unborn repository gains its first commit identity;
    // its already pinned physical Git directory must still match.
    const nativeFirstCommit =
      contract.profile === "native" &&
      identity.headAtStart === null &&
      identity.worktreeIdentity !== null &&
      identity.worktreeIdentity === current.worktreeIdentity;
    if (
      !nativeInitialization &&
      !nativeFirstCommit &&
      identity.repositoryIdentity !== current.repositoryIdentity
    ) {
      throw bindingError(
        contract,
        `仓库身份已变化：${root}`,
        `repository identity changed: ${root}`,
      );
    }
    if (
      !nativeInitialization &&
      identity.worktreeIdentity !== current.worktreeIdentity
    ) {
      throw bindingError(
        contract,
        `Git worktree 已变化：${root}`,
        `Git worktree changed: ${root}`,
      );
    }
    if (contract.profile !== "native" && frozen.branch !== current.branch) {
      throw bindingError(
        contract,
        `分支已从 ${frozen.branch ?? "detached"} 变为 ${current.branch ?? "detached"}：${root}`,
        `branch changed from ${frozen.branch ?? "detached"} to ${current.branch ?? "detached"}: ${root}`,
      );
    }
  });
}

function repositoryBinding(root: string): ManagedRepositoryBinding {
  const configuredRoot = path.resolve(root);
  if (!existsSync(configuredRoot)) {
    throw new Error(`Managed workspace root does not exist: ${configuredRoot}`);
  }
  const realRoot = realpathSync(configuredRoot);
  const gitTop = gitOutput(realRoot, ["rev-parse", "--show-toplevel"]);
  if (!gitTop) {
    return {
      configuredRoot,
      realRoot,
      repositoryIdentity: sha256(`filesystem:${realRoot}`),
      worktreeIdentity: null,
      branch: null,
      headAtStart: null,
    };
  }
  const top = realpathSync(gitTop);
  const roots =
    gitOutput(top, ["rev-list", "--max-parents=0", "HEAD"])
      ?.split(/\r?\n/)
      .filter(Boolean)
      .sort() ?? [];
  const head = gitOutput(top, ["rev-parse", "HEAD"]);
  const gitDir = gitOutput(top, ["rev-parse", "--git-dir"]);
  const absoluteGitDir = gitDir
    ? realpathSync(path.resolve(top, gitDir))
    : null;
  return {
    configuredRoot,
    realRoot,
    repositoryIdentity: sha256(`git:${roots.join("\n") || head || top}`),
    worktreeIdentity: absoluteGitDir ? sha256(absoluteGitDir) : null,
    branch: gitOutput(top, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    headAtStart: head,
  };
}

function renderBinding(
  binding: ManagedWorkspaceBinding,
  contract: ManagedTaskContract,
): string {
  const en = contract.language === "en";
  return [
    en ? "# Managed Workspace Binding" : "# 托管工作区绑定",
    "",
    contract.profile === "native"
      ? en
        ? "Initial repository, worktree, branch, and HEAD are retained for audit. Native tasks allow branch changes and Git initialization in an originally non-Git root while preserving configured and canonical workspace roots and existing worktree identity."
        : "保留起始仓库、worktree、分支与 HEAD 供审计。原生任务允许切换分支及初始化原非 Git 目录，仍校验配置根、真实根和已有 worktree 身份。"
      : en
        ? "Repository identity, worktree, and branch are frozen before execution. The relative task locator supports registry recovery without weakening workspace identity checks."
        : "执行前冻结仓库身份、worktree 和分支。相对任务定位符用于注册表恢复，不降低工作区身份校验。",
    "",
    `${en ? "Task locator" : "任务定位符"}: ${binding.taskLocator}`,
    ...binding.repositories.map(
      (item) =>
        `- ${item.configuredRoot} | ${item.branch ?? "detached"} | ${item.repositoryIdentity}`,
    ),
    "",
  ].join("\n");
}

function bindingError(
  contract: ManagedTaskContract,
  zh: string,
  en: string,
): Error {
  return new Error(
    contract.language === "en"
      ? `Managed workspace binding validation failed: ${en}`
      : `托管工作区绑定校验失败：${zh}`,
  );
}

function gitOutput(root: string, args: string[]): string | null {
  try {
    return (
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  renameSync(temp, file);
}
