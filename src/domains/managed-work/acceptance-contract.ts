import { createHash } from "crypto";
import { existsSync, readFileSync, realpathSync } from "fs";
import path from "path";
import type {
  ManagedAcceptanceContract,
  ManagedTaskContract,
  ReviewResult,
} from "./types.js";
import { managedText } from "./i18n.js";

export function requiresManagedAcceptanceContract(
  contract: Pick<ManagedTaskContract, "source">,
): boolean {
  return contract.source === "task_file" || contract.source === "sdd";
}

export function parseManagedAcceptanceContractFile(
  file: string,
): ManagedAcceptanceContract {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path.resolve(file), "utf-8"));
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`无法读取验收合同 JSON${detail}`);
  }
  validateManagedAcceptanceContract(value, "zh");
  return value;
}

export function validateManagedAcceptanceContract(
  value: unknown,
  language: ManagedTaskContract["language"] = "zh",
): asserts value is ManagedAcceptanceContract {
  const message = (zh: string, en: string) => managedText(language, zh, en);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      message(
        "验收合同必须是 JSON 对象",
        "Acceptance contract must be a JSON object",
      ),
    );
  }
  const contract = value as Partial<ManagedAcceptanceContract>;
  assertTextList(
    contract.businessInvariants,
    "businessInvariants",
    true,
    message,
  );
  assertTextList(contract.deliverables, "deliverables", true, message);
  assertTextList(contract.verification, "verification", true, message);
  assertTextList(contract.exclusions, "exclusions", false, message);
  if (
    !Array.isArray(contract.sourceCoverage) ||
    contract.sourceCoverage.length === 0
  ) {
    throw new Error(
      message(
        "验收合同必须列出 sourceCoverage",
        "Acceptance contract must list sourceCoverage",
      ),
    );
  }
  const scopes = new Set<string>();
  const targets = new Set<string>();
  for (const item of contract.sourceCoverage) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(
        message("sourceCoverage 项格式非法", "Invalid sourceCoverage item"),
      );
    }
    if (!isText(item.scope) || scopes.has(item.scope.trim())) {
      throw new Error(
        message(
          "sourceCoverage.scope 必须非空且唯一",
          "sourceCoverage.scope must be non-empty and unique",
        ),
      );
    }
    scopes.add(item.scope.trim());
    assertTextList(item.targets, "sourceCoverage.targets", true, message);
    for (const target of item.targets) {
      const normalized = target.trim();
      if (targets.has(normalized)) {
        throw new Error(
          message(
            "sourceCoverage.targets 不能在不同覆盖项中重复",
            "sourceCoverage.targets cannot be duplicated across coverage items",
          ),
        );
      }
      targets.add(normalized);
    }
  }
}

export function assertManagedAcceptanceTargetsExist(
  contract: ManagedTaskContract,
): void {
  if (!contract.acceptanceContract) return;
  const roots = [contract.projectRoot, ...contract.relatedProjectRoots].map(
    (root) => realpathSync(path.resolve(root)),
  );
  for (const coverage of contract.acceptanceContract.sourceCoverage) {
    for (const target of coverage.targets) {
      if (path.isAbsolute(target) || target.split(/[\\/]+/).includes("..")) {
        throw new Error(
          managedText(
            contract.language,
            `源码覆盖目标必须是仓库内相对路径：${target}`,
            `Source coverage target must be a repository-relative path: ${target}`,
          ),
        );
      }
      if (path.normalize(target) === ".") {
        throw new Error(
          managedText(
            contract.language,
            "源码覆盖目标不能指向仓库根目录",
            "Source coverage target cannot be the repository root",
          ),
        );
      }
      const matched = roots.some((root) => {
        const candidate = path.join(root, target);
        if (!existsSync(candidate)) return false;
        const resolved = realpathSync(candidate);
        return resolved === root || resolved.startsWith(`${root}${path.sep}`);
      });
      if (!matched) {
        throw new Error(
          managedText(
            contract.language,
            `源码覆盖目标在启动时不存在：${target}`,
            `Source coverage target does not exist at start: ${target}`,
          ),
        );
      }
    }
  }
}

/** New starts fail closed; persisted legacy tasks remain inspectable/resumable. */
export function assertManagedAcceptanceContractForStart(
  contract: ManagedTaskContract,
): void {
  if (
    requiresManagedAcceptanceContract(contract) &&
    !contract.acceptanceContract
  ) {
    throw new Error(
      managedText(
        contract.language,
        "任务 Prompt/SDD 启动必须提供冻结的结构化验收合同",
        "Task-file and SDD starts require a frozen structured acceptance contract",
      ),
    );
  }
  if (!contract.acceptanceContract) return;
  validateManagedAcceptanceContract(
    contract.acceptanceContract,
    contract.language,
  );
  assertManagedAcceptanceTargetsExist(contract);
}

export function managedAcceptanceContractHash(
  contract: ManagedAcceptanceContract,
): string {
  return createHash("sha256").update(JSON.stringify(contract)).digest("hex");
}

export function managedAcceptanceContractReferences(
  contract: ManagedAcceptanceContract,
): string[] {
  return [
    ...contract.businessInvariants.map((_, index) => `invariant:${index + 1}`),
    ...contract.sourceCoverage.map((_, index) => `source:${index + 1}`),
    ...contract.deliverables.map((_, index) => `deliverable:${index + 1}`),
    ...contract.verification.map((_, index) => `verification:${index + 1}`),
    ...contract.exclusions.map((_, index) => `exclusion:${index + 1}`),
  ];
}

export function validateManagedAcceptanceReviewCoverage(
  contract: ManagedTaskContract,
  result: ReviewResult,
): void {
  if (!contract.acceptanceContract) return;
  const expected = managedAcceptanceContractReferences(
    contract.acceptanceContract,
  );
  const reviewed = result.acceptanceCoverage?.reviewed;
  const message = (zh: string, en: string) =>
    managedText(contract.language, zh, en);
  if (!Array.isArray(reviewed) || new Set(reviewed).size !== reviewed.length) {
    throw new Error(
      message(
        "Host 评审缺少唯一的验收合同覆盖记录",
        "Host review is missing unique acceptance-contract coverage",
      ),
    );
  }
  const actual = new Set(reviewed);
  if (
    expected.length !== actual.size ||
    expected.some((reference) => !actual.has(reference))
  ) {
    throw new Error(
      message(
        "Host 评审没有覆盖全部冻结验收合同条目",
        "Host review did not cover every frozen acceptance-contract item",
      ),
    );
  }
  const known = new Set(expected);
  for (const finding of result.findings) {
    if (
      !Array.isArray(finding.acceptanceContractRefs) ||
      finding.acceptanceContractRefs.length === 0
    ) {
      throw new Error(
        message(
          `finding ${finding.id} 未映射验收合同条目`,
          `Finding ${finding.id} is not mapped to an acceptance-contract item`,
        ),
      );
    }
    if (
      finding.acceptanceContractRefs.some((reference) => !known.has(reference))
    ) {
      throw new Error(
        message(
          `finding ${finding.id} 引用了未知验收合同条目`,
          `Finding ${finding.id} references an unknown acceptance-contract item`,
        ),
      );
    }
  }
}

function assertTextList(
  value: unknown,
  name: string,
  required: boolean,
  message: (zh: string, en: string) => string,
): void {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    throw new Error(
      message(
        `验收合同 ${name} 必须是${required ? "非空" : ""}字符串数组`,
        `Acceptance contract ${name} must be ${required ? "a non-empty " : "an "}array of strings`,
      ),
    );
  }
  if (
    value.some((item) => !isText(item)) ||
    new Set(value.map((item) => item.trim())).size !== value.length
  ) {
    throw new Error(
      message(
        `验收合同 ${name} 不能包含空值或重复项`,
        `Acceptance contract ${name} cannot contain blank or duplicate items`,
      ),
    );
  }
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
