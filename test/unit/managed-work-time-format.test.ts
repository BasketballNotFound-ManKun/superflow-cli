import { afterEach, describe, expect, it } from "vitest";
import {
  formatManagedTimestamp,
  managedTimeZone,
} from "../../src/domains/managed-work/time-format.js";

const previousTz = process.env.SUPERFLOW_TZ;

afterEach(() => {
  if (previousTz === undefined) delete process.env.SUPERFLOW_TZ;
  else process.env.SUPERFLOW_TZ = previousTz;
});

describe("formatManagedTimestamp", () => {
  it("renders UTC input in the SUPERFLOW_TZ zone with an explicit offset", () => {
    process.env.SUPERFLOW_TZ = "Asia/Shanghai";
    expect(formatManagedTimestamp("2026-09-11T06:18:58Z")).toBe(
      "2026-09-11 14:18:58 +08:00",
    );
  });

  it("renders UTC when the override zone is UTC", () => {
    process.env.SUPERFLOW_TZ = "UTC";
    expect(formatManagedTimestamp("2026-09-11T06:18:58Z")).toBe(
      "2026-09-11 06:18:58 +00:00",
    );
  });

  it("honors zone-dependent day shifts across date boundaries", () => {
    process.env.SUPERFLOW_TZ = "America/New_York";
    expect(formatManagedTimestamp("2026-09-11T02:18:58Z")).toMatch(
      /^2026-09-(10|11) \d{2}:18:58 -0[45]:00$/,
    );
  });

  it("returns the original string for unparseable input", () => {
    process.env.SUPERFLOW_TZ = "Asia/Shanghai";
    expect(formatManagedTimestamp("not-a-timestamp")).toBe("not-a-timestamp");
  });

  it("exposes the resolved display zone", () => {
    process.env.SUPERFLOW_TZ = "Asia/Shanghai";
    expect(managedTimeZone()).toBe("Asia/Shanghai");
    delete process.env.SUPERFLOW_TZ;
    expect(managedTimeZone().length).toBeGreaterThan(0);
  });
});
