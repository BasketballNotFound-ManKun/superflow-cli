#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cliText, resolveCliLanguage } from '../core/cli-help.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgPath = join(__dirname, '..', '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

const program = new Command();
const helpText = cliText(resolveCliLanguage());

function resolveTargetPathArg(
  value: unknown,
  command: unknown,
  commandName: string
): string {
  if (typeof value === 'string' && value.length > 0 && value !== '.') return value;
  const args = (command as { args?: unknown[] } | undefined)?.args;
  const first = args?.[0];
  if (typeof first === 'string' && first.length > 0) return first;

  const index = process.argv.indexOf(commandName);
  if (index >= 0) {
    const valueOptions = new Set([
      '--agent',
      '--scope',
    ]);
    for (let i = index + 1; i < process.argv.length; i++) {
      const arg = process.argv[i];
      if (valueOptions.has(arg)) {
        i++;
        continue;
      }
      if (!arg.startsWith('-')) return arg;
    }
  }
  return '.';
}

function commandOptions(options: unknown): Record<string, unknown> {
  const opts = (options as { opts?: () => Record<string, unknown> } | undefined)?.opts;
  return {
    ...program.opts(),
    ...(typeof opts === 'function' ? opts.call(options) : { ...(options as object) }),
  };
}

program
  .name('superflow')
  .description(helpText.programDescription)
  .option('--language <language>', helpText.languageOption)
  .option('--lang <language>', helpText.languageOption)
  .version(pkg.version);

program
  .command('init [targetPath]')
  .description(helpText.initDescription)
  .option('--dry-run', helpText.dryRun)
  .option('--agent <agent>', helpText.agentOption)
  .option('--scope <scope>', helpText.scopeOption, 'global')
  .option('--language <language>', helpText.languageOption)
  .option('--yes', helpText.yesOption)
  .option('--json', helpText.jsonOption)
  .option('--resume', helpText.resumeOption)
  .option('--skip-existing', helpText.skipExistingOption)
  .option('--overwrite', helpText.overwriteOption)
  .option('--no-hooks', helpText.noHooksOption)
  .option('--no-openspec-init', helpText.noOpenspecInitOption)
  .option('--no-scan', helpText.noScanOption)
  .action(async (targetPath, options) => {
    const { initCommand } = await import('../commands/init.js');
    await initCommand({
      ...commandOptions(options),
      targetPath: resolveTargetPathArg(targetPath, options, 'init'),
    });
  });

program
  .command('scan')
  .description(helpText.scanDescription)
  .option('--dry-run', helpText.dryRun)
  .option('--force', helpText.forceOption)
  .option('--language <language>', helpText.languageOption)
  .action(async (options) => {
    const { scanCommand } = await import('../commands/scan.js');
    await scanCommand(commandOptions(options));
  });

program
  .command('clarify [feature]')
  .description(helpText.clarifyDescription)
  .option('--agent <agent>', helpText.agentOption, 'both')
  .action(async (feature, options) => {
    const { clarifyCommand } = await import('../commands/clarify.js');
    await clarifyCommand(feature, options);
  });

program
  .command('docs [change]')
  .description(helpText.docsDescription)
  .option('--agent <agent>', helpText.agentOption, 'both')
  .action(async (change, options) => {
    const { docsCommand } = await import('../commands/docs.js');
    await docsCommand(change, options);
  });

program
  .command('design [change]')
  .description(helpText.designDescription)
  .option('--agent <agent>', helpText.agentOption, 'both')
  .action(async (change, options) => {
    const { designCommand } = await import('../commands/design.js');
    await designCommand(change, options);
  });

program
  .command('implement [task]')
  .description(helpText.implementDescription)
  .option('--agent <agent>', helpText.agentOption, 'both')
  .action(async (task, options) => {
    const { implementCommand } = await import('../commands/implement.js');
    await implementCommand(task, options);
  });

program
  .command('pipeline')
  .description(helpText.pipelineDescription)
  .option('--agent <agent>', helpText.agentOption, 'both')
  .action(async (options) => {
    const { pipelineCommand } = await import('../commands/pipeline.js');
    await pipelineCommand(options);
  });

program
  .command('verify [change]')
  .description(helpText.verifyDescription)
  .option('--agent <agent>', helpText.agentOption, 'both')
  .action(async (change, options) => {
    const { verifyCommand } = await import('../commands/verify.js');
    await verifyCommand(change, options);
  });

program
  .command('archive [change]')
  .description(helpText.archiveDescription)
  .option('--agent <agent>', helpText.agentOption, 'both')
  .action(async (change, options) => {
    const { archiveCommand } = await import('../commands/archive.js');
    await archiveCommand(change, options);
  });

program
  .command('status [path]')
  .description(helpText.statusDescription)
  .option('--json', helpText.jsonOption)
  .action(async (targetPath = '.', options) => {
    const { statusCommand } = await import('../commands/status.js');
    await statusCommand(targetPath, options);
  });

program
  .command('update [targetPath]')
  .description(helpText.updateDescription)
  .option('--agent <agent>', helpText.agentOption, 'both')
  .option('--scope <scope>', helpText.updateScopeOption, 'auto')
  .option('--dry-run', helpText.dryRun)
  .option('--json', helpText.jsonOption)
  .option('--no-hooks', helpText.noHooksUpdateOption)
  .option('--with-package', helpText.withPackageOption)
  .action(async (targetPath, options) => {
    const { updateCommand } = await import('../commands/update.js');
    await updateCommand({
      ...commandOptions(options),
      targetPath: resolveTargetPathArg(targetPath, options, 'update'),
    });
  });

program
  .command('doctor [targetPath]')
  .description(helpText.doctorDescription)
  .option('--agent <agent>', helpText.agentOption, 'both')
  .option('--scope <scope>', helpText.commandScopeOption, 'global')
  .option('--json', helpText.jsonOption)
  .action(async (targetPath, options) => {
    const { doctorCommand } = await import('../commands/doctor.js');
    await doctorCommand({
      ...commandOptions(options),
      targetPath: resolveTargetPathArg(targetPath, options, 'doctor'),
    });
  });

program
  .command('uninstall [targetPath]')
  .description(helpText.uninstallDescription)
  .option('--agent <agent>', helpText.agentOption, 'both')
  .option('--scope <scope>', helpText.commandScopeOption, 'global')
  .option('--dry-run', helpText.dryRun)
  .option('--json', helpText.jsonOption)
  .option('--force', helpText.uninstallForceOption)
  .option('--with-deps', helpText.withDepsOption)
  .action(async (targetPath, options) => {
    const { uninstallCommand } = await import('../commands/uninstall.js');
    await uninstallCommand({
      ...commandOptions(options),
      targetPath: resolveTargetPathArg(targetPath, options, 'uninstall'),
    });
  });

program.parse();
