import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  assertMcpRuntimeCurrent,
  createMcpRuntimeIdentity,
} from "../../src/mcp/runtime-identity.js";

describe("MCP runtime identity", () => {
  it("fails closed when the installed runtime changes after MCP startup", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-runtime-"));
    const cli = path.join(root, "dist", "mcp", "server.js");
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.writeFileSync(cli, "console.log('v1');\n");
    const identity = createMcpRuntimeIdentity(root, "0.0.0", "fixed");

    expect(() => assertMcpRuntimeCurrent(identity)).not.toThrow();
    fs.writeFileSync(cli, "console.log('v2');\n");

    expect(() => assertMcpRuntimeCurrent(identity)).toThrow(
      /MCP 运行时已过期/,
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
});
