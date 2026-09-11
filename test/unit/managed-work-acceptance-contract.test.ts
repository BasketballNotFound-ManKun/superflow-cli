import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertManagedAcceptanceContractForStart,
  managedAcceptanceContractReferences,
  validateManagedAcceptanceReviewCoverage,
} from "../../src/domains/managed-work/acceptance-contract.js";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import {
  ensureManagedContextManifest,
  validateManagedContextManifest,
} from "../../src/domains/managed-work/context-manifest.js";
import { initManagedRunState } from "../../src/domains/managed-work/state.js";
import { createManagedTaskFiles } from "../../src/domains/managed-work/storage.js";
import type { ManagedAcceptanceContract } from "../../src/domains/managed-work/types.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("managed first-run acceptance contract", () => {
  it("rejects a new SDD start without a frozen acceptance contract", () => {
    const root = fixtureRoot();
    const contract = createManagedTaskContract({
      request: "执行冻结任务",
      projectRoot: root,
      source: "sdd",
    });

    expect(() => assertManagedAcceptanceContractForStart(contract)).toThrow(
      "必须提供冻结的结构化验收合同",
    );
  });

  it("rejects source coverage that is absent or escapes the repository", () => {
    const root = fixtureRoot();
    const absent = createContract(root, acceptance("src/missing.ts"));
    const escaping = createContract(root, acceptance("../outside.ts"));

    expect(() => assertManagedAcceptanceContractForStart(absent)).toThrow(
      "启动时不存在",
    );
    expect(() => assertManagedAcceptanceContractForStart(escaping)).toThrow(
      "仓库内相对路径",
    );
  });

  it("rejects imprecise or duplicated source-coverage targets", () => {
    const root = fixtureRoot();
    const rootTarget = createContract(root, acceptance("."));
    const duplicate = createContract(root, {
      ...acceptance("src/owner.ts"),
      sourceCoverage: [
        { scope: "订单入口", targets: ["src/owner.ts"] },
        { scope: "订单服务", targets: ["src/owner.ts"] },
      ],
    });

    expect(() => assertManagedAcceptanceContractForStart(rootTarget)).toThrow(
      "不能指向仓库根目录",
    );
    expect(() => assertManagedAcceptanceContractForStart(duplicate)).toThrow(
      "不能在不同覆盖项中重复",
    );
  });

  it("freezes acceptance evidence in the manifest and requires full Host coverage", () => {
    const root = fixtureRoot();
    const contract = createContract(root, acceptance("src/owner.ts"));
    assertManagedAcceptanceContractForStart(contract);
    createManagedTaskFiles(contract, initManagedRunState(contract), {
      ...process.env,
      SUPERFLOW_HOME: path.join(root, "home"),
    });
    const manifest = ensureManagedContextManifest(contract);
    const acceptanceJson = path.join(
      root,
      ".superflow",
      "tasks",
      contract.taskId,
      "acceptance-contract.json",
    );

    expect(manifest.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: acceptanceJson,
          protection: "immutable",
        }),
      ]),
    );
    const reviewed = managedAcceptanceContractReferences(
      contract.acceptanceContract!,
    );
    expect(() =>
      validateManagedAcceptanceReviewCoverage(contract, {
        result: "pass",
        summary: "全部合同范围已检查",
        findings: [],
        acceptanceCoverage: { reviewed },
      }),
    ).not.toThrow();
    expect(() =>
      validateManagedAcceptanceReviewCoverage(contract, {
        result: "pass",
        summary: "覆盖不完整",
        findings: [],
        acceptanceCoverage: { reviewed: reviewed.slice(1) },
      }),
    ).toThrow("没有覆盖全部冻结验收合同条目");

    fs.writeFileSync(acceptanceJson, "{}\n");
    expect(() => validateManagedContextManifest(manifest, contract)).toThrow(
      "执行上下文清单已漂移",
    );
  });
});

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-acceptance-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "owner.ts"), "export {};\n");
  return root;
}

function createContract(
  root: string,
  acceptanceContract: ManagedAcceptanceContract,
) {
  return createManagedTaskContract({
    request: "执行冻结任务",
    projectRoot: root,
    source: "sdd",
    acceptanceContract,
  });
}

function acceptance(target: string): ManagedAcceptanceContract {
  return {
    businessInvariants: ["保持订单状态单调"],
    sourceCoverage: [{ scope: "订单入口与服务", targets: [target] }],
    deliverables: ["源码与回归测试"],
    verification: ["受影响测试通过"],
    exclusions: [],
  };
}
