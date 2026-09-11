import {
  executeManagedTaskCleanup,
  planManagedTaskCleanup,
} from "../../domains/managed-work/cleanup.js";
import type { ManagedRetention } from "../../domains/managed-work/types.js";

export interface CleanupCommandOptions {
  project?: string;
  retention?: ManagedRetention;
  dryRun?: boolean;
  json?: boolean;
}

export function cleanupCommand(
  taskId: string,
  options: CleanupCommandOptions = {},
): void {
  const plan = planManagedTaskCleanup(
    options.project ?? ".",
    taskId,
    options.retention,
  );
  const result = executeManagedTaskCleanup(plan, options.dryRun === true);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const mode = result.dryRun ? "dry-run" : "已执行";
  console.log(
    `托管清理${mode}：${result.taskId}；候选 ${result.actions.length} 个文件，` +
      `预计释放 ${result.totalBytes} 字节；实际删除 ${result.deletedFiles} 个，` +
      `释放 ${result.releasedBytes} 字节。`,
  );
  for (const action of result.actions) {
    console.log(`- ${action.path} (${action.bytes} 字节，${action.reason})`);
  }
}
