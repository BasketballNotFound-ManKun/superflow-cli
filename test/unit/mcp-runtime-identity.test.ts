import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  assertMcpRuntimeCurrent,
  createMcpRuntimeIdentity,
} from "../../src/mcp/runtime-identity.js";

describe("MCP runtime identity", () => {
  it.each([
    "package.json",
    "assets/scripts/gate.py",
    "assets/skills/superflow-pipeline/scripts/owner.sh",
  ])("rejects a package closure change in %s after startup", (relative) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-closure-"));
    try {
      fs.mkdirSync(path.join(root, "dist/mcp"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "dist/mcp/server.js"),
        "// stable server\n",
      );
      fs.writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ name: "@chenmk/superflow", version: "0.0.1" }),
      );
      const target = path.join(root, relative);
      if (relative !== "package.json") {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, "old gate\n");
      }
      const identity = createMcpRuntimeIdentity(root, "0.0.1");
      fs.writeFileSync(
        target,
        relative === "package.json"
          ? JSON.stringify({ name: "@chenmk/superflow", version: "0.0.2" })
          : "new gate\n",
      );
      expect(() => assertMcpRuntimeCurrent(identity)).toThrow(
        /MCP 运行时已过期/,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it("captures build commit once without making metadata the stale gate", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-build-"));
    try {
      fs.mkdirSync(path.join(root, "dist/mcp"), { recursive: true });
      fs.writeFileSync(path.join(root, "dist/mcp/server.js"), "// server\n");
      const metadata = path.join(root, "dist/build-info.json");
      const commit = "a".repeat(40);
      fs.writeFileSync(metadata, JSON.stringify({ buildCommit: commit }));
      const identity = createMcpRuntimeIdentity(root, "0.0.0");
      expect(identity).toHaveProperty("buildCommit", commit);
      fs.writeFileSync(
        metadata,
        JSON.stringify({ buildCommit: "b".repeat(40) }),
      );
      expect(identity).toHaveProperty("buildCommit", commit);
      expect(() => assertMcpRuntimeCurrent(identity)).not.toThrow();
      expect(createMcpRuntimeIdentity(root, "0.0.0")).toHaveProperty(
        "buildCommit",
        "b".repeat(40),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    undefined,
    "bad json",
    '{"buildCommit":"short"}',
    '{"buildCommit":123}',
    '{"buildCommit":null}',
  ])("reports unknown for missing or malformed metadata %s", (data) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-build-invalid-"));
    try {
      fs.mkdirSync(path.join(root, "dist/mcp"), { recursive: true });
      fs.writeFileSync(path.join(root, "dist/mcp/server.js"), "// server\n");
      if (data !== undefined) {
        fs.writeFileSync(path.join(root, "dist/build-info.json"), data);
      }
      expect(createMcpRuntimeIdentity(root, "0.0.0")).toHaveProperty(
        "buildCommit",
        null,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when the installed runtime changes after MCP startup", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-runtime-"));
    const cli = path.join(root, "dist", "mcp", "server.js");
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, "console.log('v1');\n");
    const identity = createMcpRuntimeIdentity(root, "0.0.0", "fixed");

    expect(() => assertMcpRuntimeCurrent(identity)).not.toThrow();
    fs.writeFileSync(cli, "console.log('v2');\n");

    expect(() => assertMcpRuntimeCurrent(identity)).toThrow(/MCP 运行时已过期/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
