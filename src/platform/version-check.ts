import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { PACKAGE_ROOT } from "./assets.js";
import { resolveNpmCommand, runNpm } from "./npm-runtime.js";

const PACKAGE_NAME = "@chenmk/superflow";
const CHECK_INTERVAL_MS = 1000 * 60 * 60 * 24; // 一天检查一次
const FAILURE_INTERVAL_MS = 1000 * 60 * 5;
const QUERY_TIMEOUT_MS = 1500;
const SCHEMA = "superflow.version-check.v1";
const MAX_FILE_BYTES = 64 * 1024;

interface CheckRecord {
  schemaVersion: typeof SCHEMA;
  identity: string;
  checkedAt: number;
  latest: string | null;
}

/**
 * 启动时检查 npm registry 是否有新版本。
 * 非阻塞：失败静默跳过，不影响命令执行。
 */
export async function checkForUpdates(currentVersion: string): Promise<void> {
  if (
    process.env.NO_UPDATE_NOTIFIER ||
    /^(?:1|true)$/i.test(process.env.CI ?? "")
  )
    return;

  let release: (() => void) | undefined;
  try {
    const root = fs.realpathSync(PACKAGE_ROOT);
    const identity = queryIdentity(root);
    const directory = path.join(
      process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local/state"),
      "superflow",
    );
    const file = path.join(directory, `version-check-${digest(root)}.json`);
    const cached = readRecord(file);
    if (useCached(cached, identity, currentVersion)) return;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!fs.lstatSync(directory).isDirectory()) return;
    release = acquireQueryLock(file + ".lock");
    if (!release) return; // Optional notification never waits for another CLI.
    const lockedRecord = readRecord(file);
    if (useCached(lockedRecord, identity, currentVersion)) return;

    let latest: string | null = null;
    try {
      const result = await runNpm(["view", PACKAGE_NAME, "version"], {
        timeout: QUERY_TIMEOUT_MS,
      });
      const value = result.stdout.trim();
      if (result.code === 0 && safeVersion(value)) latest = value;
    } catch {
      // npm view failed（无网络、npm 未安装等），静默跳过
    }
    // Preserve malformed, foreign-schema and user-owned files verbatim.
    if (lockedRecord !== undefined)
      writeRecord(file, {
        schemaVersion: SCHEMA,
        identity,
        checkedAt: Date.now(),
        latest,
      });
    if (latest && isNewerVersion(latest, currentVersion))
      printUpdateHint(currentVersion, latest);
  } catch {
    // Cache/config/runtime failures must never change the primary command result.
  } finally {
    release?.();
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Read only bounded regular files: FIFOs, oversized and unreadable config fail open.
function smallFile(file: string): string | null {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES)
      throw new Error("Unsafe file");
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function queryIdentity(root: string): string {
  const invocation = resolveNpmCommand(["view", PACKAGE_NAME, "version"]);
  const globalArgs = resolveNpmCommand(["-g"]).args;
  const prefixIndex = globalArgs.indexOf("--prefix");
  const prefix =
    prefixIndex < 0
      ? path.resolve(path.dirname(invocation.executable), "..")
      : globalArgs[prefixIndex + 1];
  const env = Object.entries(process.env)
    .filter(([key]) => /^npm_config_/i.test(key))
    .sort(([left], [right]) => left.localeCompare(right));
  const setting = (key: string) =>
    env.find(([name]) => name.toLowerCase() === `npm_config_${key}`)?.[1];
  const files = new Set([
    path.join(path.dirname(invocation.args[0]), "../npmrc"),
    setting("userconfig") || path.join(os.homedir(), ".npmrc"),
    setting("globalconfig") ||
      path.join(setting("prefix") || prefix, "etc/npmrc"),
  ]);
  // npm may find a project root above cwd; hash ancestor configs conservatively.
  let directory = process.cwd();
  for (let depth = 0; ; depth++) {
    if (depth > 64) throw new Error("Config ancestry exceeds bound");
    files.add(path.join(directory, ".npmrc"));
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  const configs = [...files]
    .map((file) => {
      const content = smallFile(file);
      const substitutions = [
        ...(content?.matchAll(/\$\{([^}]+)\}/g) ?? []),
      ].map((match) => [match[1], process.env[match[1]]]);
      return content === null ? null : [file, content, substitutions];
    })
    .filter((entry) => entry !== null);
  return digest(
    JSON.stringify({
      schema: SCHEMA,
      comparator: 1,
      root,
      prefix,
      node: [fs.realpathSync(invocation.executable), process.versions.node],
      npm: [fs.realpathSync(invocation.args[0]), smallFile(invocation.args[0])],
      env,
      configs,
      packageVersion: JSON.parse(smallFile(path.join(root, "package.json"))!)
        .version,
    }),
  );
}

// null means missing; undefined means unknown data that must not be replaced.
function readRecord(file: string): CheckRecord | null | undefined {
  try {
    try {
      if (!fs.lstatSync(file).isFile()) return undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined;
    }
    const raw = smallFile(file);
    if (raw === null) return null;
    const value = JSON.parse(raw) as CheckRecord;
    return value?.schemaVersion === SCHEMA &&
      /^[a-f0-9]{64}$/.test(value.identity) &&
      Number.isSafeInteger(value.checkedAt) &&
      value.checkedAt > 0 &&
      (value.latest === null || safeVersion(value.latest))
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function safeVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    /^v?\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(value)
  );
}

function useCached(
  record: CheckRecord | null | undefined,
  identity: string,
  current: string,
): boolean {
  if (!record || record.identity !== identity) return false;
  const age = Date.now() - record.checkedAt;
  const ttl = record.latest ? CHECK_INTERVAL_MS : FAILURE_INTERVAL_MS;
  if (age < 0 || age >= ttl) return false;
  if (record.latest && isNewerVersion(record.latest, current))
    printUpdateHint(current, record.latest);
  return true;
}

function writeRecord(file: string, record: CheckRecord): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(record), {
      flag: "wx",
      mode: 0o600,
    });
    // Recheck after the query: an external user edit remains theirs.
    if (readRecord(file) !== undefined) fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function acquireQueryLock(directory: string): (() => void) | undefined {
  const token = randomUUID();
  const ownerFile = path.join(directory, `${token}.json`);
  try {
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" ||
        !fs.lstatSync(directory).isDirectory()
      )
        return;
      const entries = fs.readdirSync(directory);
      if (entries.length !== 1 || !/^[\w-]+\.json$/.test(entries[0])) return;
      const previousFile = path.join(directory, entries[0]);
      if (!fs.lstatSync(previousFile).isFile()) return;
      const previous = JSON.parse(smallFile(previousFile) || "null");
      if (
        previous?.schemaVersion !== SCHEMA ||
        `${previous.token}.json` !== entries[0] ||
        !Number.isSafeInteger(previous.createdAt) ||
        Date.now() - previous.createdAt < QUERY_TIMEOUT_MS * 4
      )
        return;
      // Remove the observed token only. A competing stale reader cannot delete
      // a new owner: its distinct token keeps the replacement directory nonempty.
      fs.unlinkSync(previousFile);
      fs.rmdirSync(directory);
      fs.mkdirSync(directory, { mode: 0o700 });
    }
    fs.writeFileSync(
      ownerFile,
      JSON.stringify({
        schemaVersion: SCHEMA,
        token,
        createdAt: Date.now(),
      }),
      { flag: "wx", mode: 0o600 },
    );
    return () => {
      try {
        fs.unlinkSync(ownerFile);
        fs.rmdirSync(directory);
      } catch {
        /* Lost/replaced locks belong to the next owner. */
      }
    };
  } catch {
    return;
  }
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const left = parseVersion(candidate);
  const right = parseVersion(current);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return left.prerelease === null && right.prerelease !== null;
}

function parseVersion(value: string):
  | ([number, number, number] & {
      prerelease: string | null;
    })
  | null {
  const match = value
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.+)?$/);
  if (!match) return null;
  const result = [Number(match[1]), Number(match[2]), Number(match[3])] as [
    number,
    number,
    number,
  ] & { prerelease: string | null };
  result.prerelease = match[4] ?? null;
  return result;
}

function printUpdateHint(current: string, latest: string): void {
  // 只在终端输出（stderr 避免干扰 --json 输出）
  const msg = [
    "",
    `\x1b[33m⚠  superflow ${latest} 可用（当前 ${current}）\x1b[0m`,
    `   升级: \x1b[36mnpm install -g ${PACKAGE_NAME}@latest\x1b[0m`,
    `   或: \x1b[36msuperflow update\x1b[0m`,
    "",
  ].join("\n");
  process.stderr.write(msg + "\n");
}
