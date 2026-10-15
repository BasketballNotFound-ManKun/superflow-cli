import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fixtureProcessEnv } from "../helpers/fixture-process-env.js";
import {
  assertBuildSnapshot,
  resolveNpmInvocation,
} from "../../scripts/verify-changed.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function smoke(snapshotPath: string | undefined): Promise<{
  status: "PASS";
  version: string;
  installedTarball: boolean;
  checks: string[];
}> {
  if (!snapshotPath)
    throw new Error(
      "--build-snapshot is required; run npm run verify:changed -- --full first.",
    );
  assertBuildSnapshot(ROOT, JSON.parse(fs.readFileSync(snapshotPath, "utf8")));
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "superflow package smoke "),
  );
  try {
    const home = path.join(temporary, "isolated home");
    const consumer = path.join(temporary, "clean consumer");
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(consumer);
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !key.toLowerCase().startsWith("npm_config_") &&
          key !== "SUPERFLOW_OPENSPEC_DIR",
      ),
    );
    const env = fixtureProcessEnv(home, inherited);
    for (const name of ["user", "global"])
      fs.writeFileSync(path.join(temporary, `${name}.npmrc`), "");
    Object.assign(env, {
      npm_config_global: "false",
      npm_config_userconfig: path.join(temporary, "user.npmrc"),
      npm_config_globalconfig: path.join(temporary, "global.npmrc"),
      npm_config_cache: path.join(temporary, "npm cache"),
      npm_config_update_notifier: "false",
      CI: "1",
      NO_UPDATE_NOTIFIER: "1",
    });
    const npm = resolveNpmInvocation();
    const run = (
      executable: string,
      args: string[],
      cwd: string,
      expected = 0,
      childEnv = env,
    ) => {
      const result = spawnSync(executable, args, {
        cwd,
        env: childEnv,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 240_000,
        maxBuffer: 16 * 1024 * 1024,
      });
      if (result.stderr) process.stderr.write(result.stderr);
      if (result.error || result.status !== expected) {
        if (result.stdout) process.stderr.write(result.stdout);
        throw new Error(
          `${path.basename(executable)} ${args.join(" ")} failed: ${result.error?.message ?? result.status}`,
        );
      }
      return result;
    };
    // The full owner already built and froze these outputs. Do not run prepack/build twice.
    const pack = run(
      npm.executable,
      [
        ...npm.argumentPrefix,
        "pack",
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        temporary,
      ],
      ROOT,
    );
    const packages = JSON.parse(pack.stdout);
    assert.equal(packages.length, 1);
    const tarball = path.join(temporary, packages[0].filename);
    assert.equal(fs.statSync(tarball).isFile(), true);
    fs.writeFileSync(
      path.join(consumer, "package.json"),
      JSON.stringify({
        name: "isolated-consumer",
        private: true,
        version: "1.0.0",
      }),
    );
    run(
      npm.executable,
      [
        ...npm.argumentPrefix,
        "install",
        "--prefix",
        consumer,
        "--no-global",
        "--no-audit",
        "--no-fund",
        "--registry",
        "https://registry.npmjs.org",
        tarball,
      ],
      consumer,
    );
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
    );
    const installed = path.join(
      consumer,
      "node_modules",
      ...pkg.name.split("/"),
    );
    for (const relative of ["", "dist", "assets"]) {
      const target = path.join(installed, relative);
      assert.equal(fs.lstatSync(target).isSymbolicLink(), false);
      assert.equal(
        fs
          .realpathSync(target)
          .startsWith(fs.realpathSync(consumer) + path.sep),
        true,
      );
    }
    const cli = path.join(installed, "dist", "app", "cli.js");
    assert.equal(
      run(process.execPath, [cli, "--version"], consumer).stdout.trim(),
      pkg.version,
    );
    assert.match(
      run(process.execPath, [cli, "--help"], consumer).stdout,
      /init-docs/,
    );
    run(process.execPath, [cli, "skill-audit", "--strict"], consumer);
    for (const language of ["zh", "en"]) {
      const project = path.join(temporary, `${language} project`);
      const change = path.join(project, "openspec", "changes", "sample-change");
      fs.mkdirSync(change, { recursive: true });
      const args = [
        cli,
        "--language",
        language,
        "init-docs",
        "sample-change",
        "--path",
        project,
      ];
      run(process.execPath, args, consumer);
      const proposal = path.join(change, "proposal.md");
      const content = fs.readFileSync(proposal, "utf8");
      assert.match(content, language === "en" ? /<fill:>/ : /待填写/);
      fs.writeFileSync(proposal, "user-owned content\n");
      run(process.execPath, args, consumer);
      assert.equal(fs.readFileSync(proposal, "utf8"), "user-owned content\n");
      assert.equal(
        fs.existsSync(path.join(change, "prompt", "implementation.md")),
        true,
      );
    }
    // Exercise the installed package's existing deployment owners, never source assets.
    const { deploySkill } = await import(
      pathToFileURL(path.join(installed, "dist/domains/skill/deploy.js")).href
    );
    const { deployScripts } = await import(
      pathToFileURL(path.join(installed, "dist/domains/skill/scripts.js")).href
    );
    const { getManifest, getManifestScripts } = await import(
      pathToFileURL(path.join(installed, "dist/domains/config/manifest.js"))
        .href
    );
    for (const agent of ["codex", "claude"])
      for (const language of ["zh", "en"])
        for (const scope of ["project", "global"]) {
          const matrixRoot = path.join(
            temporary,
            "matrix",
            agent,
            language,
            scope,
          );
          const matrixHome = path.join(matrixRoot, "home");
          const matrixProject = path.join(matrixRoot, "project");
          fs.mkdirSync(matrixHome, { recursive: true });
          const host = path.join(
            scope === "global" ? matrixHome : matrixProject,
            `.${agent}`,
          );
          const skills = path.join(host, "skills");
          const scripts = path.join(
            host,
            agent === "codex" ? "hooks" : "scripts",
          );
          const customSkill = path.join(skills, "custom-skill", "SKILL.md");
          const customScript = path.join(scripts, "custom-script.sh");
          fs.mkdirSync(path.dirname(customSkill), { recursive: true });
          fs.mkdirSync(scripts, { recursive: true });
          fs.writeFileSync(customSkill, "user-owned skill\n");
          fs.writeFileSync(customScript, "user-owned script\n");
          for (let round = 0; round < 2; round++) {
            for (const name of getManifest().skills)
              await deploySkill(
                name,
                path.join(
                  installed,
                  "assets",
                  language === "en" ? "skills-en" : "skills",
                ),
                skills,
                { agent },
              );
            await deployScripts(
              getManifestScripts(agent),
              path.join(installed, "assets/scripts"),
              scripts,
              { agent },
            );
            assert.equal(
              fs.readFileSync(customSkill, "utf8"),
              "user-owned skill\n",
            );
            assert.equal(
              fs.readFileSync(customScript, "utf8"),
              "user-owned script\n",
            );
          }
          for (const name of getManifestScripts(agent))
            assert.equal(fs.statSync(path.join(scripts, name)).isFile(), true);
          for (const name of [
            "document-review-coverage.md",
            "document-templates.md",
            "reviewer-checklist.md",
          ])
            assert.equal(
              fs
                .statSync(path.join(skills, "superflow/references", name))
                .isFile(),
              true,
            );
          const change = path.join(
            matrixProject,
            "openspec/changes/matrix-change",
          );
          fs.mkdirSync(change, { recursive: true });
          const matrixEnv = fixtureProcessEnv(matrixHome, env);
          run(
            process.execPath,
            [
              cli,
              "--language",
              language,
              "init-docs",
              "matrix-change",
              "--path",
              matrixProject,
            ],
            consumer,
            0,
            matrixEnv,
          );
          const pipeline = path.join(skills, "superflow/scripts");
          run(
            "bash",
            [
              path.join(pipeline, "superflow-state.sh"),
              "init",
              change,
              "full",
              "docs",
            ],
            matrixProject,
            0,
            matrixEnv,
          );
          run(
            "bash",
            [path.join(pipeline, "superflow-handoff.sh"), change, "--write"],
            matrixProject,
            0,
            matrixEnv,
          );
          assert.match(
            fs
              .readFileSync(
                path.join(change, ".sdd/handoff/sdd-context.sha256"),
                "utf8",
              )
              .trim(),
            /^[a-f0-9]{64}$/,
          );
          const tasks = run(
            "python3",
            [
              path.join(scripts, "superflow-test-report-lint.py"),
              path.join(change, "tasks.md"),
              "--task-index",
            ],
            matrixProject,
            0,
            matrixEnv,
          );
          assert.equal(JSON.parse(tasks.stdout).ambiguous, false);
          assert.ok(JSON.parse(tasks.stdout).ids.includes("1.1"));
        }
    const project = path.join(temporary, "incomplete project");
    const change = path.join(project, "openspec", "changes", "openspec-only");
    for (const file of [
      "proposal.md",
      "design.md",
      "tasks.md",
      "specs/sample/spec.md",
      ".openspec.yaml",
    ]) {
      const target = path.join(change, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(
        target,
        file === ".openspec.yaml"
          ? "schema: spec-driven\n"
          : "# Basic OpenSpec artifact\n",
      );
    }
    const blocked = run(
      process.execPath,
      [cli, "check", "openspec-only", "--level", "coding-ready", "--json"],
      project,
      1,
    );
    const report = JSON.parse(blocked.stdout);
    assert.ok(report.failed > 0);
    assert.ok(
      report.items.some(
        (item: { file: string; exists: boolean }) =>
          item.file === "api.md" && item.exists === false,
      ),
    );
    return {
      status: "PASS",
      version: pkg.version,
      installedTarball: true,
      checks: [
        "version",
        "help",
        "strict-skill-audit",
        "zh/en-init-docs",
        "preserve-user-content",
        "openspec-only-blocked",
        "installed-dual-host-language-scope-deployment",
      ],
    };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

try {
  const index = process.argv.indexOf("--build-snapshot");
  const result = await smoke(index >= 0 ? process.argv[index + 1] : undefined);
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
