import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import path from "path";
import type { ManagedTaskContract } from "./types.js";
import { managedTaskDir } from "./paths.js";
import { selectManagedRuleFiles } from "./rule-selection.js";
import { readManagedExecutionContract } from "./execution-contract.js";

export type ManagedContextRole =
  | "request"
  | "task_contract"
  | "implementation_prompt"
  | "requirement"
  | "design"
  | "tasks"
  | "test"
  | "rule"
  | "reference";

export type ManagedContextProtection = "immutable" | "retain";

export interface ManagedContextEntry {
  path: string;
  role: ManagedContextRole;
  sha256: string;
  required: boolean;
  /**
   * immutable: Executor may only read the file.
   * retain: Executor may update progress/evidence, but may not delete it.
   * Older manifests omit this field and retain the historical immutable rule.
   */
  protection?: ManagedContextProtection;
}

export interface ManagedContextManifest {
  schemaVersion: 1;
  taskId: string;
  entries: ManagedContextEntry[];
  manifestHash: string;
}

export function ensureManagedContextManifest(
  contract: ManagedTaskContract,
): ManagedContextManifest {
  const file = managedContextManifestPath(contract);
  if (!existsSync(file)) return writeManagedContextManifest(contract);
  let manifest = JSON.parse(
    readFileSync(file, "utf-8"),
  ) as ManagedContextManifest;
  if (!includesWorkspaceBinding(manifest, contract)) {
    manifest = writeManagedContextManifest(contract);
  }
  if (
    contract.acceptanceContract &&
    !includesAcceptanceContract(manifest, contract)
  ) {
    throw new Error(
      contract.language === "en"
        ? "Managed context manifest is missing the frozen acceptance contract"
        : "托管执行上下文清单缺少冻结验收合同",
    );
  }
  validateManagedContextManifest(manifest, contract);
  return manifest;
}

export function writeManagedContextManifest(
  contract: ManagedTaskContract,
): ManagedContextManifest {
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const candidates: Array<{
    file: string;
    role: ManagedContextRole;
    protection: ManagedContextProtection;
  }> = [
    {
      file: path.join(taskDir, "request.md"),
      role: "request",
      protection: "immutable",
    },
    {
      file: path.join(taskDir, "task-brief.md"),
      role: "task_contract",
      protection: "immutable",
    },
    {
      file: path.join(taskDir, "workspace-binding.json"),
      role: "task_contract",
      protection: "immutable",
    },
    {
      file: path.join(taskDir, "workspace-binding.md"),
      role: "task_contract",
      protection: "immutable",
    },
    {
      file: path.join(taskDir, "execution-contract.json"),
      role: "task_contract",
      protection: "immutable",
    },
    {
      file: path.join(taskDir, "execution-contract.md"),
      role: "task_contract",
      protection: "immutable",
    },
  ];
  if (contract.acceptanceContract) {
    candidates.push(
      {
        file: path.join(taskDir, "acceptance-contract.json"),
        role: "task_contract",
        protection: "immutable",
      },
      {
        file: path.join(taskDir, "acceptance-contract.md"),
        role: "task_contract",
        protection: "immutable",
      },
    );
  }
  const canonicalTasksPath =
    readManagedExecutionContract(contract).canonicalTasksPath;
  if (canonicalTasksPath) {
    candidates.push({
      file: canonicalTasksPath,
      role: "tasks",
      protection: "retain",
    });
  }
  if (contract.taskPrompt) {
    candidates.push({
      file: contract.taskPrompt.snapshotPath,
      role: "implementation_prompt",
      protection: "immutable",
    });
    if (
      contract.taskPrompt.origin !== "generated_standard" &&
      path.resolve(contract.taskPrompt.originalPath) !==
        path.resolve(contract.taskPrompt.snapshotPath)
    ) {
      candidates.push({
        file: contract.taskPrompt.originalPath,
        role: "implementation_prompt",
        protection: "immutable",
      });
    }
    for (const file of referencedLocalFiles(contract)) {
      candidates.push({
        file,
        role: inferRole(file),
        protection: protectionForReferencedFile(file),
      });
    }
  }
  for (const file of selectManagedRuleFiles(contract).files) {
    candidates.push({ file, role: "rule", protection: "immutable" });
  }
  const entries = [
    ...new Map(
      candidates
        .filter(({ file }) => existsSync(file))
        .map(({ file, role, protection }) => [
          path.resolve(file),
          {
            path: path.resolve(file),
            role,
            sha256: fileHash(file),
            required: true,
            protection,
          } satisfies ManagedContextEntry,
        ]),
    ).values(),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    schemaVersion: 1,
    taskId: contract.taskId,
    entries,
    manifestHash: hashEntries(entries),
  } satisfies ManagedContextManifest;
  writeJsonAtomic(managedContextManifestPath(contract), manifest);
  writeFileSync(
    path.join(taskDir, "context-manifest.md"),
    renderManifest(manifest, contract.language),
    "utf-8",
  );
  return manifest;
}

export function validateManagedContextManifest(
  manifest: ManagedContextManifest,
  contract: ManagedTaskContract,
): void {
  const message =
    contract.language === "en"
      ? "Managed context manifest is stale or invalid"
      : "托管执行上下文清单已漂移或无效";
  if (
    manifest.schemaVersion !== 1 ||
    manifest.taskId !== contract.taskId ||
    manifest.manifestHash !== hashEntries(manifest.entries)
  ) {
    throw new Error(message);
  }
  for (const entry of manifest.entries) {
    if (!existsSync(entry.path)) {
      throw new Error(`${message}: ${entry.path}`);
    }
    if (
      (entry.protection ?? "immutable") === "immutable" &&
      fileHash(entry.path) !== entry.sha256
    ) {
      throw new Error(`${message}: ${entry.path}`);
    }
  }
}

export function managedContextManifestPath(
  contract: ManagedTaskContract,
): string {
  return path.join(
    managedTaskDir(contract.projectRoot, contract.taskId),
    "context-manifest.json",
  );
}

function referencedLocalFiles(contract: ManagedTaskContract): string[] {
  if (
    !contract.taskPrompt ||
    contract.taskPrompt.origin === "generated_standard"
  ) {
    return [];
  }
  const source = readFileSync(contract.taskPrompt.originalPath, "utf-8");
  const base = path.dirname(contract.taskPrompt.originalPath);
  const approvedRoots = [
    contract.projectRoot,
    ...contract.relatedProjectRoots,
  ].map((root) => path.resolve(root));
  const references = [...source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
    .map((match) => match[1].split("#", 1)[0].trim())
    .filter((value) => value && !/^[a-z]+:/i.test(value))
    .map((value) => path.resolve(base, decodeURIComponent(value)))
    .filter((file) => approvedRoots.some((root) => isWithin(file, root)));
  return [...new Set(references)].filter(existsSync);
}

function inferRole(file: string): ManagedContextRole {
  const name = path.basename(file).toLowerCase();
  if (name.includes("task")) return "tasks";
  if (name.includes("design") || name.includes("architecture")) return "design";
  if (name.includes("test") || name.includes("acceptance")) return "test";
  if (name.includes("proposal") || name.includes("spec")) return "requirement";
  return "reference";
}

function protectionForReferencedFile(file: string): ManagedContextProtection {
  const name = path.basename(file).toLowerCase();
  return ["tasks.md", "test-report.md"].includes(name) ? "retain" : "immutable";
}

function renderManifest(
  manifest: ManagedContextManifest,
  language: ManagedTaskContract["language"],
): string {
  const title =
    language === "en" ? "# Managed Execution Context" : "# 托管执行上下文";
  const description =
    language === "en"
      ? "Read required entries by path. The JSON file and SHA-256 values are authoritative; this document does not copy source content."
      : "按路径读取必读项。JSON 与 SHA-256 是事实源；本文不复制权威文档正文。";
  return [
    title,
    "",
    description,
    "",
    `Manifest SHA-256: ${manifest.manifestHash}`,
    "",
    ...manifest.entries.map(
      (entry) =>
        `- [${entry.role}/${entry.protection ?? "immutable"}] ${entry.path} (${entry.sha256})`,
    ),
    "",
  ].join("\n");
}

function isWithin(file: string, root: string): boolean {
  const relative = path.relative(root, file);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function fileHash(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function hashEntries(entries: ManagedContextEntry[]): string {
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  renameSync(temp, file);
}

function includesWorkspaceBinding(
  manifest: ManagedContextManifest,
  contract: ManagedTaskContract,
): boolean {
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const expected = [
    path.join(taskDir, "workspace-binding.json"),
    path.join(taskDir, "workspace-binding.md"),
  ].map((file) => path.resolve(file));
  const actual = new Set(manifest.entries.map((entry) => entry.path));
  return expected.every((file) => actual.has(file));
}

function includesAcceptanceContract(
  manifest: ManagedContextManifest,
  contract: ManagedTaskContract,
): boolean {
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const expected = [
    path.join(taskDir, "acceptance-contract.json"),
    path.join(taskDir, "acceptance-contract.md"),
  ].map((file) => path.resolve(file));
  const actual = new Set(manifest.entries.map((entry) => entry.path));
  return expected.every((file) => actual.has(file));
}
