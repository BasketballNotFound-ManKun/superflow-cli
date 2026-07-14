import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function runGit(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function findPreviousTag(tag, cwd) {
  try {
    return runGit(["describe", "--tags", "--abbrev=0", `${tag}^`], cwd);
  } catch {
    return "";
  }
}

export function validateReleaseMetadata(metadata) {
  const { tag, objectType, subject, body, previousTag } = metadata;
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error(`版本标签格式错误：${tag}，应使用 vX.Y.Z`);
  }
  if (objectType !== "tag") {
    throw new Error(`版本标签 ${tag} 必须是 annotated tag，不能是轻量标签`);
  }

  const version = tag.slice(1);
  if (!subject.includes(version)) {
    throw new Error(`标签标题必须包含当前版本 ${version}`);
  }
  if (!body) {
    throw new Error(`标签 ${tag} 缺少版本升级说明`);
  }
  if (!/(升级内容|upgrade from|changes since)/i.test(body)) {
    throw new Error("版本说明必须明确标注“升级内容”或对应英文表述");
  }

  const requiredSections = [
    ["升级摘要", /^## (升级摘要|Upgrade Summary)$/im],
    ["主要更新", /^## (主要更新|Highlights|What's Changed)$/im],
    ["验证结果", /^## (验证结果|Quality Verification|Validation)$/im],
    ["升级方式", /^## (升级方式|Upgrade)$/im],
  ];
  for (const [label, pattern] of requiredSections) {
    if (!pattern.test(body)) {
      throw new Error(`版本说明缺少“## ${label}”章节`);
    }
  }
  const bulletCount = body.match(/^[-*] .+/gm)?.length ?? 0;
  if (bulletCount < 3) {
    throw new Error("版本说明的主要更新和验证结果至少需要 3 条清晰条目");
  }

  if (previousTag) {
    const previousVersion = previousTag.replace(/^v/, "");
    if (!body.includes(previousVersion)) {
      throw new Error(`版本说明必须包含上一版本 ${previousVersion}`);
    }
  }
}

export function inspectReleaseTag(tag, cwd = process.cwd()) {
  const ref = `refs/tags/${tag}`;
  const metadata = {
    tag,
    objectType: runGit(["cat-file", "-t", ref], cwd),
    subject: runGit(["for-each-ref", ref, "--format=%(contents:subject)"], cwd),
    body: runGit(["for-each-ref", ref, "--format=%(contents:body)"], cwd),
    previousTag: findPreviousTag(tag, cwd),
  };
  validateReleaseMetadata(metadata);
  return metadata;
}

function currentPackageTag() {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  return `v${packageJson.version}`;
}

function main() {
  const tag = process.argv[2] ?? currentPackageTag();
  const metadata = inspectReleaseTag(tag);
  const from = metadata.previousTag || "首个版本";
  process.stdout.write(`版本发布说明校验通过：${from} → ${tag}\n`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`版本发布说明校验失败：${message}\n`);
    process.exitCode = 1;
  }
}
