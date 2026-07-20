import os from "os";
import path from "path";

export function managedHome(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(
    env.SUPERFLOW_HOME ?? path.join(os.homedir(), ".superflow"),
  );
}

export function managedRegistryPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(managedHome(env), "managed", "registry.json");
}

export function managedServicePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(managedHome(env), "managed", "service.json");
}

export function managedTaskDir(projectRoot: string, taskId: string): string {
  return path.join(projectRoot, ".superflow", "tasks", taskId);
}

export function managedRunDir(
  projectRoot: string,
  taskId: string,
  runId: string,
): string {
  return path.join(managedTaskDir(projectRoot, taskId), "runs", runId);
}
