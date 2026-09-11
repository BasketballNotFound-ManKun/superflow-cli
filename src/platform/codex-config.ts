import { existsSync, readFileSync } from "fs";
import os from "os";
import path from "path";
import type {
  ManagedExecutorConfig,
  ManagedReasoningEffort,
} from "../domains/managed-work/types.js";

const REASONING_EFFORTS = new Set<ManagedReasoningEffort>([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]);

export function resolveCodexExecutorConfig(
  env: NodeJS.ProcessEnv = process.env,
): ManagedExecutorConfig {
  const home = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  const file = path.join(home, "config.toml");
  if (!existsSync(file)) {
    return {
      model: null,
      reasoningEffort: null,
      provider: null,
      source: "unknown",
      confirmed: false,
    };
  }
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return {
      model: null,
      reasoningEffort: null,
      provider: null,
      source: "unknown",
      confirmed: false,
    };
  }
  const model = tomlString(content, "model");
  const reasoning = tomlString(content, "model_reasoning_effort");
  const provider = tomlString(content, "model_provider");
  return {
    model,
    reasoningEffort:
      reasoning && REASONING_EFFORTS.has(reasoning as ManagedReasoningEffort)
        ? (reasoning as ManagedReasoningEffort)
        : null,
    provider,
    source: "codex_config",
    confirmed: false,
  };
}

export function resolveClaudeExecutorConfig(
  env: NodeJS.ProcessEnv = process.env,
): ManagedExecutorConfig {
  const claudeHome = env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), ".claude");
  const file = path.join(claudeHome, "settings.json");
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    // Claude supports environment-only configuration; absent or invalid local
    // settings must remain visible as unknown instead of being guessed.
  }
  const settingsEnv = objectValue(settings.env);
  const model =
    stringValue(env.ANTHROPIC_MODEL) ??
    stringValue(settingsEnv.ANTHROPIC_MODEL) ??
    stringValue(settings.model);
  const effort =
    stringValue(env.CLAUDE_CODE_EFFORT_LEVEL) ??
    stringValue(settingsEnv.CLAUDE_CODE_EFFORT_LEVEL);
  return {
    model,
    reasoningEffort:
      effort && REASONING_EFFORTS.has(effort as ManagedReasoningEffort)
        ? (effort as ManagedReasoningEffort)
        : null,
    provider:
      stringValue(env.ANTHROPIC_BASE_URL) ??
      stringValue(settingsEnv.ANTHROPIC_BASE_URL),
    source: model || effort ? "claude_config" : "unknown",
    confirmed: false,
  };
}

function tomlString(content: string, key: string): string | null {
  const match = content.match(
    new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, "m"),
  );
  return match?.[1]?.trim() || null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
