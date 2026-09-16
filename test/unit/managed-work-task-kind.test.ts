import { describe, expect, it } from "vitest";
import { createManagedTaskContract } from "../../src/domains/managed-work/contract.js";
import { readManagedExecutionContract } from "../../src/domains/managed-work/execution-contract.js";

describe("managed task classification", () => {
  it("keeps README repair documentation-only and without runtime acceptance", () => {
    const contract = createManagedTaskContract({
      request: "修复 README 中的安装说明",
      projectRoot: process.cwd(),
    });

    expect(contract.taskKind).toBe("docs-only");
    expect(readManagedExecutionContract(contract).tasks.map((task) => task.taskId))
      .toEqual(["E01", "E02"]);
  });
});
