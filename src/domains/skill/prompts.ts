import { promises as fs } from 'fs';
import path from 'path';

export async function deployPrompts(
  promptNames: string[],
  assetsDir: string,
  promptsDir: string,
  options: { skipExisting?: boolean } = {}
): Promise<void> {
  await fs.mkdir(promptsDir, { recursive: true });

  for (const name of promptNames) {
    const source = path.join(assetsDir, name);
    const dest = path.join(promptsDir, name);
    if (options.skipExisting) {
      try {
        await fs.access(dest);
        continue;
      } catch {
        // prompt does not exist; deploy it below.
      }
    }
    await fs.cp(source, dest, { recursive: false, force: true });
  }
}
