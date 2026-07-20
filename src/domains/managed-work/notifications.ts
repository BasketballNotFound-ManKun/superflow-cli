import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { managedHome } from "./paths.js";

export type ManagedNotificationType =
  | "delivery_ready"
  | "human_required"
  | "budget_exhausted"
  | "service_failed";

export interface ManagedNotification {
  key: string;
  taskId: string;
  type: ManagedNotificationType;
  title: string;
  message: string;
  createdAt: string;
}

export function notifyManagedTask(
  notification: Omit<ManagedNotification, "key" | "createdAt">,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const file = path.join(managedHome(env), "managed", "notifications.jsonl");
  mkdirSync(path.dirname(file), { recursive: true });
  const contentHash = createHash("sha256")
    .update(`${notification.title}\n${notification.message}`)
    .digest("hex")
    .slice(0, 16);
  const key = `${notification.taskId}:${notification.type}:${contentHash}`;
  if (existingKeys(file).has(key)) return false;

  const event: ManagedNotification = {
    ...notification,
    key,
    createdAt: new Date().toISOString(),
  };
  appendFileSync(file, `${JSON.stringify(event)}\n`, "utf-8");
  if (
    process.platform === "darwin" &&
    env.SUPERFLOW_DISABLE_OS_NOTIFICATIONS !== "1"
  ) {
    sendMacNotification(event.title, event.message);
  }
  return true;
}

function existingKeys(file: string): Set<string> {
  if (!existsSync(file)) return new Set();
  return new Set(
    readFileSync(file, "utf-8")
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [(JSON.parse(line) as ManagedNotification).key];
        } catch {
          return [];
        }
      }),
  );
}

function sendMacNotification(title: string, message: string): void {
  const script = `display notification ${appleString(message)} with title ${appleString(title)}`;
  spawnSync("osascript", ["-e", script], {
    stdio: "ignore",
    timeout: 5_000,
  });
}

function appleString(value: string): string {
  return JSON.stringify(value.slice(0, 300));
}
