import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildMcpAddCommand,
  buildMcpRemoveCommand,
  parseMcpAgents,
  resolveMcpNodePath,
} from "../../src/app/commands/mcp.js";

describe("mcp command", () => {
  it("builds Codex and Claude stdio registration commands", () => {
    expect(
      buildMcpAddCommand("codex", "/opt/superflow/mcp.js", "/usr/bin/node"),
    ).toEqual([
      "mcp",
      "add",
      "superflow",
      "--",
      "/usr/bin/node",
      "/opt/superflow/mcp.js",
    ]);
    expect(
      buildMcpAddCommand("claude", "/opt/superflow/mcp.js", "/usr/bin/node"),
    ).toEqual([
      "mcp",
      "add",
      "--scope",
      "user",
      "superflow",
      "--",
      "/usr/bin/node",
      "/opt/superflow/mcp.js",
    ]);
  });

  it("builds idempotent removal commands for each host", () => {
    expect(buildMcpRemoveCommand("codex")).toEqual([
      "mcp",
      "remove",
      "superflow",
    ]);
    expect(buildMcpRemoveCommand("claude")).toEqual([
      "mcp",
      "remove",
      "--scope",
      "user",
      "superflow",
    ]);
  });

  it("uses the stable Homebrew node entry for durable MCP registration", () => {
    expect(
      resolveMcpNodePath(
        "/opt/homebrew/Cellar/node/25.6.0/bin/node",
        (candidate) => candidate === "/opt/homebrew/bin/node",
      ),
    ).toBe("/opt/homebrew/bin/node");
    expect(
      resolveMcpNodePath(
        "/Users/demo/.nvm/versions/node/v22.0.0/bin/node",
        () => false,
      ),
    ).toBe("/Users/demo/.nvm/versions/node/v22.0.0/bin/node");
  });

  it("supports Codex, Claude, or both", () => {
    expect(parseMcpAgents("both", "zh")).toEqual(["codex", "claude"]);
    expect(parseMcpAgents("codex", "zh")).toEqual(["codex"]);
    expect(parseMcpAgents("claude", "en")).toEqual(["claude"]);
    expect(parseMcpAgents("claude codex", "en")).toEqual([
      "codex",
      "claude",
    ]);
    expect(() => parseMcpAgents("codex,unknown", "zh")).toThrow(
      "MCP 支持",
    );
  });

  it("keeps source installers on the canonical CLI and MCP entries", () => {
    const root = process.cwd();
    const shellInstaller = fs.readFileSync(
      path.join(root, "install.sh"),
      "utf-8",
    );
    const powershellInstaller = fs.readFileSync(
      path.join(root, "install.ps1"),
      "utf-8",
    );

    expect(shellInstaller).toContain("dist/app/cli.js");
    expect(shellInstaller).toContain("dist/mcp/server.js");
    expect(powershellInstaller).toContain("dist\\app\\cli.js");
    expect(powershellInstaller).toContain("dist\\mcp\\server.js");
    expect(shellInstaller).toContain('command -v codex');
    expect(shellInstaller).toContain("mcp install $AGENT_FLAG");
    expect(shellInstaller).toContain("mcp status $AGENT_FLAG");
    expect(powershellInstaller).toContain(
      '@("mcp", "install", "--agent", $agentValue)',
    );
    expect(powershellInstaller).toContain("Get-Command codex");
    expect(powershellInstaller).toContain(
      "mcp status --agent $agentValue",
    );
    expect(`${shellInstaller}\n${powershellInstaller}`).not.toContain(
      "dist/cli/index.js",
    );
    expect(`${shellInstaller}\n${powershellInstaller}`).not.toContain(
      "dist\\cli\\index.js",
    );
  });
});
