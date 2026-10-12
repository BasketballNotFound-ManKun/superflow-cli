import { chmodSync, existsSync, realpathSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "win32") {
  for (const file of ["dist/app/cli.js", "dist/mcp/server.js"]) {
    const target = path.join(root, file);
    if (existsSync(target)) chmodSync(target, 0o755);
  }
}

// Provenance is diagnostic only. An npm package or a dirty source tree must not
// inherit an unrelated checkout's HEAD or pretend to be a reproducible build.
function cleanBuildCommit() {
  try {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
    );
    const git = (...args) =>
      execFileSync("git", args, {
        cwd: root,
        env,
        encoding: "utf8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    if (
      realpathSync(git("rev-parse", "--show-toplevel")) !== realpathSync(root)
    ) {
      return null;
    }
    const commit = git("rev-parse", "--verify", "HEAD");
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) return null;
    if (git("status", "--porcelain", "--untracked-files=normal")) return null;
    return git("rev-parse", "--verify", "HEAD") === commit ? commit : null;
  } catch {
    return null;
  }
}

writeFileSync(
  path.join(root, "dist", "build-info.json"),
  `${JSON.stringify({ buildCommit: cleanBuildCommit() })}\n`,
);
