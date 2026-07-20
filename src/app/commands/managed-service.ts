import { runManagedService } from "../../domains/managed-work/service.js";

export async function managedServiceCommand(
  options: { once?: boolean } = {},
): Promise<void> {
  await runManagedService(options);
}
