import { existsSync } from "fs";
import path from "path";

export function resolveExecutableShim(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  pathExists: (candidate: string) => boolean = existsSync,
): string {
  if (platform !== "win32" || hasPathComponent(command)) return command;
  const pathValue = env.Path ?? env.PATH ?? "";
  const extensions = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean)
    .map((extension) =>
      extension.startsWith(".") ? extension : `.${extension}`,
    );
  const candidates = path.extname(command)
    ? [command]
    : [command, ...extensions.map((extension) => `${command}${extension}`)];
  for (const directory of pathValue.split(";").filter(Boolean)) {
    for (const candidate of candidates) {
      const full = path.join(directory, candidate);
      if (pathExists(full)) return full;
    }
  }
  return command;
}

function hasPathComponent(command: string): boolean {
  return (
    path.isAbsolute(command) ||
    command.includes("/") ||
    command.includes("\\")
  );
}
