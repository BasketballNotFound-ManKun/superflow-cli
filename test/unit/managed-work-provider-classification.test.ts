import { describe, expect, it } from "vitest";
import { isCreditableTransientProviderFailure } from "../../src/domains/managed-work/failure.js";
import { isPermanentProviderFailure } from "../../src/domains/managed-work/runner.js";

describe("isPermanentProviderFailure", () => {
  it.each(["stream disconnected before completion", "STREAM DISCONNECTED BEFORE COMPLETION", "Stream disconnected before completion: error sending request"])("credits explicit stream interruption before completion: %s", message => {
    expect(isCreditableTransientProviderFailure(message)).toBe(true);
  });
  it.each(["invalid API key", "authentication failed", "insufficient permissions", "INVALID_API_KEY", "AUTHENTICATION-FAILED", "INSUFFICIENT_PERMISSIONS"])("gives explicit authorization failure precedence over stream and capacity: %s", detail => {
    const message = `stream disconnected before completion: ${detail}; network 529 overloaded`;
    expect(isPermanentProviderFailure(message)).toBe(true);
    expect(isCreditableTransientProviderFailure(message)).toBe(false);
  });
  it.each([
    "permission denied; connection reset",
    "invalid access token; socket hang up",
    "401 unauthorized; network error",
    "HTTP 403 Forbidden; network error",
    "PERMISSION_DENIED; CONNECTION RESET",
    "INVALID_ACCESS_TOKEN; SOCKET HANG UP",
  ])("rejects explicit authorization across every transport branch: %s", detail => {
    const message = `stream disconnected before completion: ${detail}`;
    expect(isPermanentProviderFailure(message)).toBe(true);
    expect(isCreditableTransientProviderFailure(message)).toBe(false);
  });
  it.each(["HTTP 403 invalid access token", "permission denied", "quota exhausted", "billing required", "auth_unavailable: no accounts"])("does not credit stream text hiding permanent or permission failure: %s", detail => {
    expect(isCreditableTransientProviderFailure(`stream disconnected before completion: ${detail}`)).toBe(false);
  });
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
