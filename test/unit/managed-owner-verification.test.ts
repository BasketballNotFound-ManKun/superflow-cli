import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("managed owner verification template", () => {
  it("provides fingerprint creation and owner revalidation before signals", () => {
    const script = fs.readFileSync(
      path.resolve("assets/scripts/superflow-managed-owner-verification.sh"),
      "utf8",
    );

    expect(script).toContain("通过可配置路径 source");
    expect(script).toContain("禁止复制后分叉维护");
    expect(script).toContain("superflow_write_fingerprint()");
    expect(script).toContain("superflow_signal_owner()");
    const signalBody = script.slice(script.indexOf("superflow_signal_owner()"));
    expect(signalBody.indexOf("superflow_owner_matches")).toBeGreaterThan(-1);
    expect(signalBody.indexOf("superflow_owner_matches")).toBeLessThan(
      signalBody.indexOf('kill "-$signal" "$pid"'),
    );
  });

  it("provides one owner-verified Docker and runtime cleanup path", () => {
    const script = fs.readFileSync(
      path.resolve("assets/scripts/superflow-managed-owner-verification.sh"),
      "utf8",
    );

    expect(script).toContain("superflow_docker_labels_equal()");
    expect(script).toContain("superflow_docker_remove_verified()");
    expect(script).toContain('rm -f -v "$resource"');
    expect(script).toContain("superflow_runtime_remove_verified()");
    expect(script).not.toContain("docker volume prune");
  });
});
