export interface ReviewRule {
  path: string;
  rule: string;
  source?: "project" | "user" | "system";
}

export interface ReviewFile {
  path: string;
  included: boolean;
  reason?: string;
  bundle?: string;
  rules: string[];
}

export interface ReviewCoverage {
  coverage: { total: number; included: number; excluded: number };
  files: ReviewFile[];
  bundles: Record<string, string[]>;
  risk: { tier: "low" | "medium" | "high"; reasons: string[] };
  errors: string[];
}

const DEFAULT_EXCLUDES = [
  "**/*Test.java",
  "**/*Tests.java",
  "**/src/test/**",
  "**/*.test.js",
  "**/*.test.ts",
  "**/*.spec.js",
  "**/*.spec.ts",
  "**/__tests__/**",
  "**/generated/**",
  "**/node_modules/**",
  "**/target/**",
  "**/build/**",
  ".sdd/**",
  "**/review.md",
];

export function resolveReviewCoverage(
  changedFiles: string[],
  rules: ReviewRule[],
  options: { excludes?: string[] } = {},
): ReviewCoverage {
  const files: ReviewFile[] = [];
  const bundles: Record<string, string[]> = {};
  const errors: string[] = [];
  const seen = new Set<string>();
  const excludes = [...DEFAULT_EXCLUDES, ...(options.excludes ?? [])];
  let included = 0;

  for (const rawPath of changedFiles) {
    const filePath = rawPath.replaceAll("\\", "/");
    if (seen.has(filePath)) {
      errors.push(`duplicate changed file: ${filePath}`);
    }
    seen.add(filePath);
    const excludedBy = excludes.find((pattern) => matchGlob(pattern, filePath));
    if (excludedBy) {
      files.push({
        path: filePath,
        included: false,
        reason: `default exclude: ${excludedBy}`,
        rules: [],
      });
      continue;
    }
    included += 1;
    const bundle = bundleName(filePath);
    const rulesForFile = resolveRules(filePath, rules);
    files.push({
      path: filePath,
      included: true,
      bundle,
      rules: rulesForFile,
    });
    (bundles[bundle] ??= []).push(filePath);
  }

  for (const paths of Object.values(bundles)) paths.sort();
  const realBundles = Object.fromEntries(
    Object.entries(bundles).filter(([, paths]) => paths.length > 1),
  );
  return {
    coverage: { total: changedFiles.length, included, excluded: changedFiles.length - included },
    files,
    bundles: realBundles,
    risk: classifyRisk(files),
    errors,
  };
}

function classifyRisk(files: ReviewFile[]): ReviewCoverage["risk"] {
  const included = files.filter((file) => file.included);
  const highPaths = included.filter((file) =>
    /(?:^|\/)(?:sql|migration|migrations|security|auth)(?:\/|$)|Mapper\.xml$|(?:^|\/)[^/]*Controller\.java$/i
      .test(file.path),
  );
  if (highPaths.length > 0) {
    return {
      tier: "high",
      reasons: highPaths.map((file) => `high-impact path: ${file.path}`),
    };
  }
  if (included.length >= 3) {
    return { tier: "medium", reasons: [`${included.length} included files`] };
  }
  return { tier: "low", reasons: ["small path-scoped diff"] };
}

function resolveRules(filePath: string, rules: ReviewRule[]): string[] {
  const matching = rules.filter((rule) => matchGlob(rule.path, filePath));
  const project = matching.find((rule) => rule.source === "project");
  if (project) return [project.rule];
  const user = matching.find((rule) => rule.source === "user");
  if (user) return [user.rule];
  return matching.length > 0 ? [matching[0].rule] : [];
}

function bundleName(filePath: string): string {
  const parts = filePath.split("/");
  const module = parts[0] === "src" || parts.length === 1 ? "" : `${parts[0]}:`;
  const base = filePath.split("/").pop() ?? filePath;
  return module + base.split(".")[0].replace(/_[a-z]{2}(?:_[A-Z]{2})?$/, "");
}

function matchGlob(pattern: string, filePath: string): boolean {
  let expression = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") {
        expression += "(?:.*/)?";
        i += 2;
      } else {
        expression += ".*";
        i += 1;
      }
    } else if (char === "*") {
      expression += "[^/]*";
    } else if (char === "?") {
      expression += "[^/]";
    } else {
      expression += /[\\^$|+()[\]{}]/.test(char) ? `\\${char}` : char;
    }
  }
  return new RegExp(`^${expression}$`).test(filePath);
}
