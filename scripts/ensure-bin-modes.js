import { chmodSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

if (process.platform !== "win32") {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const file of ["dist/app/cli.js", "dist/mcp/server.js"]) {
    const target = path.join(root, file);
    if (existsSync(target)) chmodSync(target, 0o755);
  }
}
