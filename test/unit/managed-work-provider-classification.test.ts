import { describe, expect, it } from "vitest";
import { isPermanentProviderFailure } from "../../src/domains/managed-work/runner.js";

describe("isPermanentProviderFailure", () => {
  it("classifies account-pool auth failures as permanent", () => {
    const realWorldMessage =
      "unexpected status 503 Service Unavailable: auth_unavailable: 账号池没有可用账号：候选 5 个，不可用 5 个，模型排除 0 个，额度保留拦截 0 个，生图策略拦截 0 个。, url: http://localhost:55288/v1/responses";
    expect(isPermanentProviderFailure(realWorldMessage)).toBe(true);
    expect(isPermanentProviderFailure("auth unavailable: no accounts")).toBe(
      true,
    );
  });

  it("keeps classifying quota and plan exhaustion as permanent", () => {
    expect(isPermanentProviderFailure("error code 2056 token plan")).toBe(true);
    expect(isPermanentProviderFailure("insufficient quota")).toBe(true);
  });

  it("keeps transient capacity and rate-limit errors out of the permanent class", () => {
    expect(
      isPermanentProviderFailure(
        "Selected model is at capacity. Please try a different model.",
      ),
    ).toBe(false);
    expect(isPermanentProviderFailure("429 Too Many Requests")).toBe(false);
    expect(
      isPermanentProviderFailure("stream disconnected before completion"),
    ).toBe(false);
  });

  it("does not misread unrelated text that merely contains similar tokens", () => {
    expect(
      isPermanentProviderFailure("fixture path contains auth_unavailable.md"),
    ).toBe(false);
  });
});
