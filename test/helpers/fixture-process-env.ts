import os from "node:os";
import { vi } from "vitest";

// Disposable Git repositories must not inherit host hooks or Git overrides.
export function fixtureProcessEnv(
  home: string,
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...inherited };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_")) delete env[key];
  }
  return {
    ...env,
    HOME: home,
    XDG_CONFIG_HOME: `${home}/.config`,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: os.devNull,
  };
}

// In-process audits launch Git internally; scope their environment as well.
export function withFixtureProcessEnv<T>(
  env: NodeJS.ProcessEnv,
  run: () => T,
): T {
  const keys = new Set([...Object.keys(process.env), ...Object.keys(env)]);
  try {
    for (const key of keys) {
      if (key === "HOME" || key === "XDG_CONFIG_HOME" || key.startsWith("GIT_"))
        vi.stubEnv(key, env[key]);
    }
    return run();
  } finally {
    vi.unstubAllEnvs();
  }
}
