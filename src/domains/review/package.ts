import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

export interface ReviewPackage {
  directory: string;
  projectRoot: string;
  baseline: string;
  files: string[];
  diff: string;
  sourceManifest: string;
  reportTemplate: string;
}

// The coverage command owns preparation; this is a disposable input, not a review
// result or a second workflow state. Every source is read before output is created.
export function prepareReviewPackage(
  cwd: string,
  destination: string,
  options: { base?: string; paths?: string[]; english: boolean },
): ReviewPackage {
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const root = git("rev-parse", "--show-toplevel").toString().trim();
  const directory = path.resolve(cwd, destination);
  if (fs.existsSync(directory))
    throw new Error(`Review package already exists: ${directory}`);
  if (
    directory === path.join(root, ".git") ||
    directory.startsWith(path.join(root, ".git") + path.sep)
  ) {
    throw new Error("Review package cannot be written inside .git");
  }
  const baseline = git(
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${options.base ?? "HEAD"}^{commit}`,
  )
    .toString()
    .trim();
  const run = (...args: string[]) =>
    execFileSync("git", ["--literal-pathspecs", ...args], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const names = (data: Buffer) => data.toString().split("\0").filter(Boolean);
  const changed = [
    ...new Set([
      ...names(
        run("diff", "--name-only", "--no-renames", "-z", baseline, "--"),
      ),
      ...names(run("ls-files", "--others", "--exclude-standard", "-z")),
    ]),
  ];
  const files = [
    ...new Set(
      (options.paths?.length ? options.paths : changed).map((file) =>
        path.normalize(file).split(path.sep).join("/"),
      ),
    ),
  ].sort();
  const tracked = new Set(
    names(run("ls-tree", "-r", "--name-only", "-z", baseline)),
  );
  const indexed = new Set(names(run("ls-files", "--cached", "-z")));
  const sources = files.map((file) =>
    readSource(root, baseline, file, tracked, run),
  );
  const expanded = files.length
    ? names(
        run(
          "diff",
          "--name-only",
          "--no-renames",
          "-z",
          baseline,
          "--",
          ...files,
        ),
      )
    : [];
  const undeclared = expanded.filter((file) => !files.includes(file));
  if (undeclared.length) {
    throw new Error(
      `Git selection expands to undeclared sources: ${undeclared.join(", ")}; select each exact file or omit --path`,
    );
  }
  let patch = files.length
    ? run(
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--binary",
        baseline,
        "--",
        ...files,
      ).toString()
    : "";
  for (const source of sources) {
    if (indexed.has(source.file) || source.current === null) continue;
    const added = spawnSync(
      "git",
      [
        "diff",
        "--no-index",
        "--no-ext-diff",
        "--no-textconv",
        "--binary",
        "--",
        "/dev/null",
        source.file,
      ],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (added.error || added.status !== 1)
      throw new Error(`Cannot capture added source: ${source.file}`);
    patch += added.stdout;
  }
  const manifest = [
    "# Source manifest",
    "",
    `Baseline: ${baseline}`,
    "",
    "Input identity only; the reviewer must inspect the diff and real callers.",
    "",
    "| Path | Change | Baseline SHA-256 | Current SHA-256 |",
    "|---|---|---|---|",
    ...sources.map(
      (s) =>
        `| ${s.file} | ${s.before === null ? "added" : s.current === null ? "deleted" : "modified"} | ${digest(s.before)} | ${digest(s.current)} |`,
    ),
    "",
  ].join("\n");
  const template = reportTemplate(sources, options.english);
  // mkdir is exclusive even if another invocation creates the destination after
  // validation. Never replace an existing reviewer return or its original hash.
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  fs.mkdirSync(directory);
  try {
    for (const source of sources) {
      for (const [side, content] of [
        ["baseline", source.before],
        ["current", source.current],
      ] as const) {
        if (content === null) continue;
        const target = path.join(directory, side, source.file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, { flag: "wx" });
      }
    }
    fs.writeFileSync(path.join(directory, "diff.patch"), patch, { flag: "wx" });
    fs.writeFileSync(path.join(directory, "source-manifest.md"), manifest, {
      flag: "wx",
    });
    fs.writeFileSync(path.join(directory, "review-template.md"), template, {
      flag: "wx",
    });
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    directory,
    projectRoot: root,
    baseline,
    files,
    diff: path.join(directory, "diff.patch"),
    sourceManifest: path.join(directory, "source-manifest.md"),
    reportTemplate: path.join(directory, "review-template.md"),
  };
}

interface SourceInput {
  file: string;
  before: Buffer | null;
  current: Buffer | null;
}
function readSource(
  root: string,
  baseline: string,
  file: string,
  tracked: Set<string>,
  run: (...args: string[]) => Buffer,
): SourceInput {
  const absolute = path.resolve(root, file);
  if (
    path.isAbsolute(file) ||
    absolute === root ||
    !absolute.startsWith(root + path.sep) ||
    file.split(/[\\/]/).some((part) => part === ".git" || part === "..") ||
    /[\r\n|]/.test(file)
  ) {
    throw new Error(`Invalid project-relative review source: ${file}`);
  }
  let current: Buffer | null = null;
  let stat: fs.Stats | undefined;
  try {
    stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOTDIR") throw error;
    // An ancestor became a regular file: the baseline child was deleted.
  }
  if (stat) {
    if (stat.isSymbolicLink() || fs.realpathSync(absolute) !== absolute) {
      throw new Error(`Symbolic link review source is not allowed: ${file}`);
    }
    if (stat.isFile()) current = fs.readFileSync(absolute);
    else if (!stat.isDirectory())
      throw new Error(`Review source is not a file: ${file}`);
    // A directory replacing a baseline file is a deletion, not file contents.
  }
  const before = tracked.has(file) ? run("show", `${baseline}:${file}`) : null;
  if (current === null && before === null)
    throw new Error(`Review source is missing: ${file}`);
  return { file, before, current };
}

function digest(content: Buffer | null): string {
  return content === null
    ? "absent"
    : createHash("sha256").update(content).digest("hex");
}

function reportTemplate(sources: SourceInput[], english: boolean): string {
  const note = english
    ? "Template only. Read the original goal, diff and callers before the author's checklist. Replace identity placeholders with actual dispatch/return references; never turn an unread manifest into reviewed evidence."
    : "这只是模板。先读原目标、diff和真实调用者，再看作者清单。身份占位必须替换为实际派发/返回引用；输入清单不代表已阅读或已通过。";
  return [
    "NEEDS_CONTEXT",
    "",
    note,
    "",
    "## Review Identity",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Role | independent-reviewer |",
    "| Dispatch | <actual-dispatch-reference> |",
    "| Return | <actual-return-reference> |",
    "",
    "## Impact",
    "",
    "<goal, actual diff, unchanged callers, failure paths and test sufficiency>",
    "",
    "## Axes",
    "",
    "<actual coverage and evidence; CHECKED is not correctness>",
    "",
    "## Findings",
    "",
    "<anchored findings or explicit None after actual review>",
    "",
    "## Concerns",
    "",
    "<unresolved concerns or explicit None>",
    "",
    "## Reviewed Sources",
    "",
    "| Path | SHA-256 |",
    "|---|---|",
    ...sources
      .filter((s) => s.current !== null)
      .map((s) => `| ${s.file} | ${digest(s.current)} |`),
    "",
  ].join("\n");
}
