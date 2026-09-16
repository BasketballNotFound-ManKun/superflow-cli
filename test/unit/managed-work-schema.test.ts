import { describe, expect, it } from "vitest";
import { EXECUTOR_RESULT_SCHEMA } from "../../src/domains/managed-work/schemas.js";

describe("managed executor response schema", () => {
  it("declares every command property required for strict providers", () => {
    const command = EXECUTOR_RESULT_SCHEMA.properties.commands.items;
    expect(command.required).toEqual([
      "command",
      "exitCode",
      "result",
      "categories",
      "assertion",
    ]);
  });
});
