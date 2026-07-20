import { describe, expect, it } from "vitest";
import { isNewerVersion } from "../../src/platform/version-check.js";

describe("version update comparison", () => {
  it("does not report an older registry version as an update", () => {
    expect(isNewerVersion("0.3.0", "0.3.1")).toBe(false);
  });

  it("reports greater patch, minor, and major versions", () => {
    expect(isNewerVersion("0.3.2", "0.3.1")).toBe(true);
    expect(isNewerVersion("0.4.0", "0.3.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
  });

  it("treats a stable version as newer than the matching prerelease", () => {
    expect(isNewerVersion("1.0.0", "1.0.0-beta.1")).toBe(true);
    expect(isNewerVersion("1.0.0-beta.2", "1.0.0")).toBe(false);
  });
});
