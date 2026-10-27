import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { auditOwnerResponse, auditReviewReport } from "./report.js";
import {
  renderOwnerResponseTemplate,
  renderReviewTemplate,
  type ReviewInputReference,
} from "./templates.js";

export interface ReviewPackage {
  directory: string;
  projectRoot: string;
  baseline: string;
  files: string[];
  diff: string;
  sourceManifest: string;
  reportTemplate?: string;
  ownerResponseTemplate?: string;
  reviewInputs?: string;
  dispatchInstructions: string;
  unselectedChanges: string[];
}

// The coverage command owns preparation; this is a disposable input, not a review
// result or a second workflow state. Every source is read before output is created.
export function prepareReviewPackage(
  cwd: string,
  destination: string,
  options: {
    base?: string;
    paths?: string[];
    english: boolean;
    originalReview?: string;
    ownerResponse?: string;
    reviewerChecklist?: string;
  },
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
  if (options.ownerResponse && !options.originalReview) {
    throw new Error(
      "--owner-response requires --original-review and --prepare",
    );
  }
  const references: ReviewInputReference[] = [];
  let findingIds: string[] = [];
  const inputSummary: string[] = [];
  if (options.originalReview) {
    const original = readReviewInput(root, "original", options.originalReview);
    const audited = auditReviewReport(original.content, root, true);
    if (
      audited.issues.length ||
      !audited.findingIds.length ||
      !audited.concerns?.length
    ) {
      throw new Error(
        `Invalid or incomplete original review ${original.path}: ${audited.issues.join("; ") || "requires a valid four-state original with finding IDs and explicit Concerns"}; preserve the original and obtain a new actual reviewer return`,
      );
    }
    references.push(original);
    findingIds = audited.findingIds;
    inputSummary.push(
      "## Original Findings",
      "",
      ...audited.findingEntries.map((finding) => finding.text),
      "",
      "## Original Concerns",
      "",
      ...audited.concerns!,
      "",
    );
    if (options.ownerResponse) {
      const owner = readReviewInput(
        root,
        "owner-response",
        options.ownerResponse,
      );
      if (
        fs.realpathSync(path.join(root, owner.path)) ===
        fs.realpathSync(path.join(root, original.path))
      )
        throw new Error(
          "Original review and Owner response must be separate files",
        );
      const response = auditOwnerResponse(owner.content, findingIds);
      if (response.issues.length)
        throw new Error(
          `Invalid Owner response ${owner.path}: ${response.issues.join("; ")}`,
        );
      references.push(owner);
      inputSummary.push(
        "## Actual Owner Dispositions",
        "",
        "| ID | Disposition | Evidence |",
        "|---|---|---|",
        ...response.dispositions.map((row) => `| ${row.join(" | ")} |`),
        "",
      );
    }
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
  const unselectedChanges = changed
    .filter((file) => !files.includes(file))
    .sort();
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
    "Input identity only; the reviewer must inspect the original goal, diff and real callers before the author's matrix.",
    `Selection: ${options.paths?.length ? "explicit --path" : "all changed and untracked files"}. No ownership or prior-session classification is inferred.`,
    "Snapshot paths: baseline/<Path> and current/<Path>; absent means that side has no file.",
    "Unselected changes are still visible below; Owner must decide task ownership, exclusions and isolation. Local configuration and temporary files are never silently filtered.",
    "",
    "| Path | Change | Baseline SHA-256 | Current SHA-256 |",
    "|---|---|---|---|",
    ...sources.map(
      (s) =>
        `| ${s.file} | ${s.before === null ? "added" : s.current === null ? "deleted" : "modified"} | ${digest(s.before)} | ${digest(s.current)} |`,
    ),
    "",
    "## Unselected Changes",
    "",
    ...unselectedChanges.map((file) => `- ${file}`),
    ...(unselectedChanges.length ? [] : ["None"]),
    "",
  ].join("\n");
  const ownerOnly = Boolean(options.originalReview && !options.ownerResponse);
  const template = ownerOnly
    ? undefined
    : renderReviewTemplate(
        sources
          .filter((source) => source.current !== null)
          .map((source) => ({
            path: source.file,
            sha256: digest(source.current),
          })),
        options.english,
        references,
        findingIds,
      );
  const prepared: ReviewPackage = {
    directory,
    projectRoot: root,
    baseline,
    files,
    unselectedChanges,
    diff: path.join(directory, "diff.patch"),
    sourceManifest: path.join(directory, "source-manifest.md"),
    dispatchInstructions: path.join(directory, "dispatch-instructions.md"),
    ...(template !== undefined
      ? { reportTemplate: path.join(directory, "review-template.md") }
      : {}),
    ...(ownerOnly
      ? {
          ownerResponseTemplate: path.join(
            directory,
            "owner-response-template.md",
          ),
        }
      : {}),
    ...(references.length
      ? { reviewInputs: path.join(directory, "review-inputs.md") }
      : {}),
  };
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
    if (prepared.reportTemplate)
      fs.writeFileSync(prepared.reportTemplate, template!, { flag: "wx" });
    if (prepared.ownerResponseTemplate)
      fs.writeFileSync(
        prepared.ownerResponseTemplate,
        renderOwnerResponseTemplate(findingIds, options.english),
        { flag: "wx" },
      );
    if (prepared.reviewInputs) {
      fs.mkdirSync(path.join(directory, "inputs"));
      for (const input of references) {
        fs.writeFileSync(
          path.join(directory, "inputs", `${input.role}.md`),
          input.content,
          { flag: "wx", mode: 0o444 },
        );
      }
      fs.writeFileSync(
        prepared.reviewInputs,
        [
          "# Original input identities (read-only snapshots)",
          "",
          "Paths below are project-root relative. These are original bytes and historical source identities, not current review conclusions. Never rewrite or rebind their hashes.",
          "",
          "| Role | Path | SHA-256 | Snapshot |",
          "|---|---|---|---|",
          ...references.map(
            (input) =>
              `| ${input.role} | ${input.path} | ${input.sha256} | inputs/${input.role}.md |`,
          ),
          "",
          `Original finding IDs: ${findingIds.join(", ")}`,
          "",
          ...inputSummary,
        ].join("\n"),
        { flag: "wx" },
      );
    }
    fs.writeFileSync(
      prepared.dispatchInstructions,
      dispatchInstructions(
        prepared,
        options.english,
        options.reviewerChecklist,
      ),
      { flag: "wx" },
    );
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return prepared;
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

function readReviewInput(
  root: string,
  role: ReviewInputReference["role"],
  candidate: string,
): ReviewInputReference {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute).split(path.sep).join("/");
  if (
    !relative ||
    relative.startsWith("../") ||
    path.isAbsolute(relative) ||
    /[\r\n|]/.test(relative) ||
    relative.split("/").includes(".git")
  ) {
    throw new Error(`Invalid project-relative ${role} path: ${candidate}`);
  }
  try {
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(absolute);
    const resolved = path.relative(realRoot, realFile);
    if (
      resolved.startsWith("..") ||
      path.isAbsolute(resolved) ||
      !fs.statSync(realFile).isFile()
    ) {
      throw new Error("outside project or not a file");
    }
    const bytes = fs.readFileSync(absolute);
    const content = bytes.toString("utf8");
    if (!Buffer.from(content).equals(bytes))
      throw new Error("report must be complete UTF-8 text");
    return { role, path: relative, sha256: digest(bytes), content };
  } catch (error) {
    throw new Error(
      `Cannot read ${role} input ${candidate}: ${(error as Error).message}`,
    );
  }
}

function dispatchInstructions(
  prepared: ReviewPackage,
  english: boolean,
  checklist?: string,
): string {
  return [
    english ? "# Dispatch instructions" : "# 派发说明",
    "",
    `${english ? "Project root" : "项目根"}: ${prepared.projectRoot}`,
    `${english ? "Exact diff" : "准确差异"}: ${prepared.diff}`,
    `${english ? "Input manifest and explicit scope" : "输入清单与显式范围"}: ${prepared.sourceManifest}`,
    ...(checklist
      ? [
          `${english ? "Canonical reviewer checklist" : "规范评审清单"}: ${checklist}`,
        ]
      : []),
    ...(prepared.reviewInputs
      ? [
          `${english ? "Original inputs and identities" : "原件与身份"}: ${prepared.reviewInputs}`,
        ]
      : []),
    "",
    ...(prepared.reportTemplate
      ? [
          `${english ? "Use this exact report template" : "直接使用此报告模板"}: ${prepared.reportTemplate}`,
          "",
          english
            ? "Send this template path in the actual isolated reviewer dispatch; do not send only the diff and invent another report format later. The reviewer writes a new actual return, filling identity, inspected scope, axes, findings and concerns. Preparation never means review executed."
            : "实际隔离派发必须引用此模板路径，不得仅发 diff 后另造报告格式。Reviewer 新建真实返回，填写身份、实际检查范围、五维、finding 和 concern；准备完成不等于评审已执行。",
        ]
      : [
          `${english ? "Owner response template" : "Owner 响应模板"}: ${prepared.ownerResponseTemplate}`,
          "",
          english
            ? "Fill and save a separate actual Owner response. Then run review-coverage --prepare <new-directory> --original-review <same-original> --owner-response <actual-response> to generate the actual rereview input and exact chain hashes. This step has not dispatched a reviewer."
            : "填写并另存真实 Owner 响应，再运行 review-coverage --prepare <新目录> --original-review <同一原件> --owner-response <实际响应> 生成实际复评输入与准确链哈希；本步尚未派发 Reviewer。",
        ]),
    "",
    english
      ? "Owner supplies confirmed original goal/contract paths, applicable rules and raw evidence paths. Do not include full implementation chat or author business conclusions. Reviewer first investigates goal, diff, unchanged callers, write/SQL/projection consumers and failure counterexamples; only then compare the author's matrix. Record actual reading and expansion reasons in Impact."
      : "Owner 补充已确认原目标/合同路径、适用规则与原始证据路径；不传整段实现聊天或作者业务结论。Reviewer 先核原目标、diff、未改调用者、写入/SQL/投影消费者与失败反例，再对照作者矩阵；实际阅读及扩查理由写 Impact。",
    "",
    english
      ? "Read-only review: no source edits, application startup, business DB operations or nested supervision. Missing inputs remain NEEDS_CONTEXT. Snapshot identities are not claims of actual reading. Owner judges unselected dirty configuration/temporary files and task ownership; no silent exclusion."
      : "只读评审：不改源码、不启动应用、不操作业务库、不启动嵌套监督。缺输入保持 NEEDS_CONTEXT；快照身份不是实际已读声明。Owner 判断未选脏配置/临时文件及任务所有权，不得静默排除。",
    "",
    "superflow review-coverage --report <actual-new-report-file> --json",
    "",
    english
      ? "Audit the first actual return before referencing it. Retain referenced originals verbatim; format errors require a new actual reviewer return, not Owner rewrites. Preserve original findings/concerns and historical source hashes; use new current findings and actual rechecks for new judgments."
      : "首次实际返回在引用前运行审计；引用后逐字保留原件，格式问题取得新的实际 Reviewer 返回，不能由 Owner 改结论。保留原 finding/concern 和历史源码哈希；新判断记录当前 finding 及实际复评。",
    "",
  ].join("\n");
}
