import type {
  ManagedCommandEvidence,
  VerificationCategory,
} from "./types.js";

export function verificationCategories(
  command: string,
  result = "",
): VerificationCategory[] {
  const normalized = command.toLowerCase();
  const evidence = result.toLowerCase();
  const categories: VerificationCategory[] = [];
  if (
    /(^|\s)(test|vitest|jest|pytest|phpunit|go\s+test|cargo\s+test)(\s|$)/.test(
      normalized,
    ) ||
    /(?:npm|pnpm|yarn)\s+(?:run\s+)?test/.test(normalized) ||
    /mvn(?:\s+[^\s]+)*\s+test/.test(normalized) ||
    /gradle\w*\s+test/.test(normalized)
  ) {
    categories.push("test");
  }
  if (
    /(?:npm|pnpm|yarn)\s+(?:run\s+)?build/.test(normalized) ||
    /(?:^|[\s/])(?:vite|vue-cli-service)\s+build(?:\s|$)/.test(normalized) ||
    /(^|\s)(tsc|make|cmake|compile)(\s|$)/.test(normalized) ||
    /mvn(?:\s+[^\s]+)*\s+(?:compile|package|verify)/.test(normalized) ||
    /gradle\w*\s+(?:build|assemble)/.test(normalized) ||
    /cargo\s+build|go\s+build/.test(normalized)
  ) {
    categories.push("build");
  }
  if (
    /(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:start|dev|serve)/.test(normalized) ||
    /spring-boot:run|docker\s+compose\s+up|java\s+-jar/.test(normalized) ||
    /(?:spawn(?:ed|ing)?|start(?:ed|ing)?)\b.{0,80}\b(?:real|actual)\b.{0,40}\b(?:application|app|process|server)\b/.test(
      evidence,
    ) ||
    /真实.{0,20}(?:应用|进程|服务).{0,20}(?:启动|运行)/.test(result) ||
    /(?:child_process\.)?spawn(?:sync)?\b.{0,120}\b(?:node|server|application|app)\b/.test(
      evidence,
    ) ||
    /(?:动态端口|dynamic port).{0,120}(?:node|server|进程|服务)/i.test(result)
  ) {
    categories.push("startup", "runtime");
  }
  if (
    /(^|\s)(curl|wget)(\s|$)|health(?:check)?|integration|e2e/.test(
      normalized,
    ) ||
    /\b(?:real|actual)\b.{0,30}\b(?:tcp|http)\b|\b(?:tcp|http)\b.{0,30}\b(?:request|response|status|200|400)\b/.test(
      evidence,
    ) ||
    /真实.{0,20}(?:tcp|http).{0,30}(?:请求|响应|状态码)/i.test(result) ||
    /(?:真实|real).{0,30}curl|curl.{0,80}(?:http|200|400|响应|状态)/i.test(
      result,
    )
  ) {
    categories.push("invocation", "runtime");
  }
  return categories;
}

export function categoriesForCommand(
  command: ManagedCommandEvidence,
): VerificationCategory[] {
  return command.categories ??
    verificationCategories(command.command, command.result);
}
