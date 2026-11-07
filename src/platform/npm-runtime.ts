import { createRequire } from "node:module";
import { readFileSync, realpathSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { PACKAGE_ROOT } from "./assets.js";
import { runCommand, type SpawnResult } from "./process.js";

interface NpmInvocation {
  executable: string;
  argumentPrefix: string[];
}

const runtime = createRequire(import.meta.url)(
  "../../scripts/npm-runtime.cjs",
) as {
  resolveNpmInvocation(options?: { language?: string }): NpmInvocation;
  npmArguments(args: string[], packageRoot: string): string[];
  userCommandPath(env?: NodeJS.ProcessEnv): string;
  projectDependsOnSuperflow(projectRoot: string): boolean;
  repairGlobalLaunchers(packageRoot: string): void;
};

export const projectDependsOnSuperflow = runtime.projectDependsOnSuperflow;
export const repairGlobalLaunchers = runtime.repairGlobalLaunchers;

export function runNpm(
  args: string[],
  options: Parameters<typeof runCommand>[2] = {},
): Promise<SpawnResult> {
  const invocation = resolveNpmCommand(args);
  return runCommand(invocation.executable, invocation.args, options);
}

// Queries and their cache identities must use the same bound npm owner.
export function resolveNpmCommand(args: string[]) {
  const invocation = runtime.resolveNpmInvocation();
  return {
    executable: invocation.executable,
    args: [
      ...invocation.argumentPrefix,
      ...runtime.npmArguments(args, PACKAGE_ROOT),
    ],
  };
}

export function installationIdentity(packageRoot = PACKAGE_ROOT) {
  const root = realpathSync(packageRoot);
  const cliPath = path.join(root, "dist/app/cli.js");
  const metadata = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const buildFile = path.join(root, "dist/build-info.json");
  return {
    schemaVersion: "superflow.installation.v1",
    packageRoot: root,
    cliPath,
    nodePath: process.execPath,
    nodeVersion: process.versions.node,
    version: metadata.version as string,
    buildCommit: existsSync(buildFile)
      ? (JSON.parse(readFileSync(buildFile, "utf8")).buildCommit ?? null)
      : null,
    cliSha256: createHash("sha256").update(readFileSync(cliPath)).digest("hex"),
  };
}

export async function verifyActiveInstallation(
  packageRoot = PACKAGE_ROOT,
  run = runCommand,
  scope: "global" | "project" = "global",
): Promise<void> {
  const expected = installationIdentity(packageRoot);
  try {
    const result = await run(
      scope === "project" ? process.execPath : "superflow",
      [
        ...(scope === "project" ? [expected.cliPath] : []),
        "doctor",
        "--runtime-only",
        "--json",
      ],
      {
        timeout: 8000,
        env: {
          NO_UPDATE_NOTIFIER: "1",
          PATH: runtime.userCommandPath(),
          ...(process.platform === "win32"
            ? { Path: runtime.userCommandPath() }
            : {}),
        },
      },
    );
    const actual = JSON.parse(result.stdout) as ReturnType<
      typeof installationIdentity
    >;
    if (
      result.code !== 0 ||
      actual.schemaVersion !== expected.schemaVersion ||
      actual.packageRoot !== expected.packageRoot ||
      actual.version !== expected.version ||
      actual.cliSha256 !== expected.cliSha256 ||
      actual.buildCommit !== expected.buildCommit ||
      !(Number(actual.nodeVersion?.split(".")[0]) >= 20) ||
      !actual.nodePath
    ) {
      throw new Error("installation identity mismatch / 安装身份不一致");
    }
  } catch (error) {
    throw new Error(
      `Superflow installation verification failed (${scope === "global" ? "PATH" : "project"}) / Superflow 安装身份核验失败：${expected.cliPath} (${(error as Error).message})`,
    );
  }
}
