import { describe, expect, it } from "vitest";
import {
  containsPlaintextCredential,
  redactManagedLog,
  redactManagedValue,
} from "../../src/domains/managed-work/runner.js";

describe("managed work log redaction", () => {
  it("redacts header, JSON, key-value, and URL credentials", () => {
    const raw = [
      "Authorization: Bearer abc.def",
      '{"token":"json-token","password":"json-password"}',
      "api_key=plain-key secret:plain-secret",
      "https://demo:db-password@example.com/path",
      "mysql -h localhost -P 3306 -uuser -p'mysql-password' -e 'SELECT 1'",
      "mysql -h localhost --password=long-password -e 'SELECT 1'",
      "private static final String JDBC_PASSWORD = \"java-password\";",
    ].join("\n");

    const result = redactManagedLog(raw);

    for (const secret of [
      "abc.def",
      "json-token",
      "json-password",
      "plain-key",
      "plain-secret",
      "db-password",
      "mysql-password",
      "long-password",
      "java-password",
    ]) {
      expect(result).not.toContain(secret);
    }
    expect(result.match(/<redacted>/g)?.length).toBeGreaterThanOrEqual(6);
    expect(result).toContain("-P 3306");
  });

  it("redacts fragmented streaming tool input before persistence", () => {
    const raw = [
      '{"event":{"delta":{"type":"input_json_delta","partial_json":"mysql -u user -p\\\'"}}}',
      '{"event":{"delta":{"type":"input_json_delta","partial_json":"fragmented-secret"}}}',
      '{"event":{"delta":{"type":"input_json_delta","partial_json":"\\\' -e SELECT"}}}',
    ].join("\n");

    const result = redactManagedLog(raw);

    expect(result).not.toContain("fragmented-secret");
    expect(result.match(/<redacted-tool-input>/g)).toHaveLength(3);
  });

  it("removes complete tool inputs and results from persisted JSONL", () => {
    const raw = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Bash",
              input: {
                command: "P=\"database-secret\"; echo \"$P\"",
              },
            },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              content: [
                "password: database-secret",
                "access-key: storage-access-key",
                "secret-key: storage-secret-key",
              ].join("\n"),
            },
          ],
        },
        tool_use_result: {
          stdout: "database-secret",
        },
      }),
    ].join("\n");

    const result = redactManagedLog(raw);

    for (const secret of [
      "database-secret",
      "storage-access-key",
      "storage-secret-key",
    ]) {
      expect(result).not.toContain(secret);
    }
    expect(result).toContain("<redacted-tool-input>");
    expect(result).toContain("<redacted-tool-result>");
  });

  it("redacts hyphenated access and secret keys in plain logs", () => {
    const result = redactManagedLog(
      "access-key: storage-access-key\nsecret-key: storage-secret-key",
    );

    expect(result).not.toContain("storage-access-key");
    expect(result).not.toContain("storage-secret-key");
    expect(result.match(/<redacted>/g)).toHaveLength(2);
  });

  it("removes malformed escaped tool events", () => {
    const raw = [
      'data: {\\"type\\":\\"tool_use\\",'
        + '\\"input\\":{\\"command\\":\\"P=malformed-secret\\"}}',
      'data: {\\"type\\":\\"tool_result\\",'
        + '\\"content\\":\\"malformed-result-secret\\"}',
    ].join("\n");

    const result = redactManagedLog(raw);

    expect(result).not.toContain("malformed-secret");
    expect(result).not.toContain("malformed-result-secret");
    expect(result.match(/<redacted-tool-event>/g)).toHaveLength(2);
  });

  it("separates workspace credential detection from broad log redaction", () => {
    expect(
      containsPlaintextCredential(
        'private static final String JDBC_PASSWORD = "hardcoded-secret";',
      ),
    ).toBe(true);
    expect(
      containsPlaintextCredential(
        "mysql -uuser -p'command-secret' -e 'SELECT 1'",
      ),
    ).toBe(true);
    expect(
      containsPlaintextCredential(
        'token = JwtTokenUtil.generateToken("1");\n'
          + 'private static final String TOKEN_PREFIX = "tk";',
      ),
    ).toBe(false);
    expect(
      containsPlaintextCredential(
        'password: "${DB_PASSWORD}"\nmysql -uuser -p<redacted>',
      ),
    ).toBe(false);
    expect(
      containsPlaintextCredential(
        'redis-cli -p "$R19_REDIS_PORT" PING\n'
          + "mysql -uuser -p'$DB_PASSWORD' -e 'SELECT 1'",
      ),
    ).toBe(false);
    expect(
      containsPlaintextCredential(
        "mysql -uuser -p -h 127.0.0.1 -e 'SELECT 1'",
      ),
    ).toBe(false);
    expect(
      containsPlaintextCredential(
        "mysql -uuser --password=command-secret -e 'SELECT 1'",
      ),
    ).toBe(true);
    expect(
      containsPlaintextCredential(
        'R21_REDIS_PASSWORD="r21-redis-${NONCE}"',
      ),
    ).toBe(false);
    expect(
      containsPlaintextCredential('R22_MYSQL_PASSWORD="r22-$NONCE"'),
    ).toBe(false);
    expect(
      containsPlaintextCredential(
        'REDIS_PASSWORD="shared-redis-${ENVIRONMENT}"',
      ),
    ).toBe(true);
  });

  it("keeps structured executor results valid while redacting nested commands", () => {
    const result = redactManagedValue({
      summary: "R9 delivery",
      commands: [
        "curl -H 'token: temporary-secret' "
          + "-d '{\"name\":\"r9\",\"status\":1}' http://localhost/items",
      ],
      metadata: {
        token: "metadata-secret",
      },
    });

    expect(result.summary).toBe("R9 delivery");
    expect(result.commands[0]).toContain('{"name":"r9","status":1}');
    expect(result.commands[0]).not.toContain("temporary-secret");
    expect(result.metadata.token).toBe("<redacted>");
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
