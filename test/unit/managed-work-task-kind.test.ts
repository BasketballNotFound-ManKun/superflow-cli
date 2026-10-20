import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { readManagedExecutionContract } from "../../src/domains/managed-work/execution-contract.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, {recursive:true, force:true}); });

describe("managed task classification", () => {
  it("keeps README repair documentation-only and without runtime acceptance", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-kind-")); roots.push(root);
    const contract = createManagedTaskContract({
      request: "修复 README 中的安装说明",
      projectRoot: root,
    });

    expect(contract.taskKind).toBe("docs-only");
    expect(readManagedExecutionContract(contract).tasks.map((task) => task.taskId))
      .toEqual(["N01"]);
  });
});
