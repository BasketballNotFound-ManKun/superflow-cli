import { describe, expect, it } from "vitest";
import { redactManagedLog } from "../../src/domains/managed-work/runner.js";

describe("managed work log redaction", () => {
  it("redacts header, JSON, key-value, and URL credentials", () => {
    const raw = [
      "Authorization: Bearer abc.def",
      '{"token":"json-token","password":"json-password"}',
      "api_key=plain-key secret:plain-secret",
      "https://demo:db-password@example.com/path",
    ].join("\n");

    const result = redactManagedLog(raw);

    for (const secret of [
      "abc.def",
      "json-token",
      "json-password",
      "plain-key",
      "plain-secret",
      "db-password",
    ]) {
      expect(result).not.toContain(secret);
    }
    expect(result.match(/<redacted>/g)?.length).toBeGreaterThanOrEqual(6);
  });
});
