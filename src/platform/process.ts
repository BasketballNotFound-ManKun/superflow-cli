import spawn from 'cross-spawn';

export interface SpawnResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    const timeout = options.timeout ?? 120_000;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeout}ms: ${command} ${args.join(' ')}`));
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
