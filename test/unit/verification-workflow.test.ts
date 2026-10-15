import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Reuse the YAML parser already locked by ESLint; no new runtime dependency.
const { load } = createRequire(import.meta.url)("js-yaml");
const file = path.resolve(
  __dirname,
  "../../.github/workflows/verification.yml",
);
const workflow = () => load(fs.readFileSync(file, "utf8"));

describe("delivery verification workflow", () => {
  it("publication delegates to the same full owner after release validation", () => {
    const scripts = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"),
    ).scripts;
    const commands = scripts.prepublishOnly.split(/\s*&&\s*/);
    expect(commands[0]).toBe("npm run release:check");
    expect(commands[1]).toMatch(/^npm run verify:changed -- --full(?:\s|$)/);
    expect(commands).toHaveLength(2);
    expect(scripts["test:package"]).toBe(
      "tsx test/acceptance/package-smoke.ts",
    );
  });

  it("verifies pushes and pull requests with read-only permissions and cancels obsolete work", () => {
    const config = workflow();
    expect(Object.keys(config.on).sort()).toEqual(["pull_request", "push"]);
    expect(config.on.push.branches).toEqual(["**"]);
    expect(config.permissions).toEqual({ contents: "read" });
    expect(config.concurrency["cancel-in-progress"]).toBe(true);
    expect(config.concurrency.group).toContain("github.ref");
  });
  it("runs the same full owner across Linux/macOS and Node 20/24 with explicit tools", () => {
    const job = workflow().jobs.verify;
    expect(job.strategy.matrix).toEqual({
      os: ["ubuntu-latest", "macos-latest"],
      node: [20, 24],
    });
    const steps = job.steps;
    expect(
      steps.find((step: any) => step.uses?.startsWith("actions/checkout@"))
        ?.with["fetch-depth"],
    ).toBe(0);
    expect(
      steps.find((step: any) => step.uses?.startsWith("actions/setup-python@"))
        ?.with["python-version"],
    ).toBe("3.12");
    const preparation = steps.findIndex((step: any) => step.id === "evidence");
    expect(preparation).toBeGreaterThanOrEqual(0);
    expect(preparation).toBeLessThan(
      steps.findIndex((step: any) =>
        step.uses?.startsWith("actions/setup-node@"),
      ),
    );
    expect(steps[preparation].run).toContain("verify:changed");
    const dependencies = steps.find(
      (step: any) => step.id === "dependencies",
    ).run;
    expect(dependencies).toContain("npm ci");
    expect(dependencies).toContain("setup.log");
    const tools = steps.find((step: any) => step.id === "tools").run;
    expect(tools).toContain("@fission-ai/openspec@1.14.1");
    expect(tools).toContain("--prefix");
    expect(tools).not.toMatch(/--global|npm i -g/);
    const command = steps.find((step: any) => step.id === "verification").run;
    expect(command).toContain(
      "npm run --silent verify:changed -- --full --json --report",
    );
    expect(command).not.toContain("--plan");
    expect(command).not.toMatch(/continue-on-error|\|\| true/);
  });
  it("retains the report and detailed logs on failure without publication rights", () => {
    const config = workflow();
    const steps = config.jobs.verify.steps;
    const upload = steps.find((step: any) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    );
    expect(upload.if).toBe("always()");
    expect(upload.with.path).toContain("runner.temp");
    const command = steps.find((step: any) => step.id === "verification").run;
    expect(command).toContain("summary.json");
    expect(command).toContain("details.log");
    expect(JSON.stringify(config)).not.toMatch(
      /secrets\.|pull_request_target|contents.*write|npm publish/,
    );
  });
});
