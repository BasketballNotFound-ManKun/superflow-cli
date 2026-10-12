import os from "node:os";
import path from "node:path";

const USER_DIRECTORY_KEYS = new Set([
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
]);

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
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
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
  const previous = new Map<string, string | undefined>();
  try {
    for (const key of keys) {
      if (!USER_DIRECTORY_KEYS.has(key) && !key.startsWith("GIT_")) continue;
      previous.set(key, process.env[key]);
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
