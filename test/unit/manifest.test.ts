import { describe, expect, it } from "vitest";
import {
  getManifestHooks,
  getManifest,
  getManifestRules,
  getManifestScripts,
  getManifestSkillNames,
} from "../../src/domains/config/manifest.js";

describe("core/manifest", () => {
  it("manifest exposes SDD, OpenSpec, and verify skill assets", () => {
    const skills = getManifestSkillNames();
    expect(skills).toContain("superflow-pipeline");
    expect(skills).toContain("superflow-design");
    expect(skills).toContain("superflow-verify");
    expect(skills).not.toContain("sdd-spec-pipeline");
    expect(skills).toContain("openspec-propose");
    expect(skills).toContain("openspec-apply-change");
  });

  it("manifest exposes common and agent-specific scripts", () => {
    const codexScripts = getManifestScripts("codex");
    const claudeScripts = getManifestScripts("claude");
    expect(codexScripts).toContain("superflow-hook-guard.sh");
    expect(codexScripts).toContain("superflow-archive-command-hook.sh");
    expect(codexScripts).toContain("superflow-dependency-update-hook.sh");
    expect(codexScripts).toContain("superflow-managed-work-check.mjs");
    expect(codexScripts).toContain("superflow-managed-work-guard.sh");
    expect(codexScripts).toContain("codex-auto-backup-hook.sh");
    expect(claudeScripts).toContain("claude-auto-backup-hook.sh");
    expect(getManifestScripts("opencode")).toContain("superflow-hook-guard.sh");
    expect(getManifestScripts("opencode")).not.toContain(
      "codex-auto-backup-hook.sh",
    );
    expect(getManifestScripts("opencode")).not.toContain(
      "claude-auto-backup-hook.sh",
    );
  });

  it("registers the direct archive command gate for native-hook agents", () => {
    expect(getManifestHooks("codex")).toContain(
      "superflow-archive-command-hook.sh",
    );
    expect(getManifestHooks("claude")).toContain(
      "superflow-archive-command-hook.sh",
    );
    expect(getManifestHooks("codex")).toContain(
      "superflow-managed-work-guard.sh",
    );
  });

  it("manifest declares Codex, Claude, and OpenCode agents", () => {
    expect(getManifest().agents).toEqual(["claude", "codex", "opencode"]);
  });

  it("OpenCode does not inherit Codex or Claude hook registration", () => {
    expect(getManifestHooks("opencode")).toEqual([]);
  });

  it("manifest exposes SDD anti-drift rules", () => {
    expect(getManifestRules()).toContain("superflow-phase-guard.md");
  });
});
