import { describe, expect, test } from "vitest";
import { assessHostCompatibility, MINIMUM_HOST_COMPATIBILITY_VERSION } from "./host-compatibility.js";

describe("assessHostCompatibility", () => {
  test("accepts the version reported by the first supported Host", () => {
    expect(assessHostCompatibility("0.0.1")).toEqual({
      compatible: true,
      minimum: MINIMUM_HOST_COMPATIBILITY_VERSION,
    });
  });

  test("rejects an older Host compatibility version", () => {
    expect(assessHostCompatibility("0.0.0")).toEqual({
      compatible: false,
      minimum: MINIMUM_HOST_COMPATIBILITY_VERSION,
      actual: "0.0.0",
    });
  });

  test("rejects a Host that does not report a usable version", () => {
    expect(assessHostCompatibility(undefined)).toEqual({
      compatible: false,
      minimum: MINIMUM_HOST_COMPATIBILITY_VERSION,
      actual: undefined,
    });
  });

  test("accepts newer prerelease and stable compatibility versions", () => {
    expect(assessHostCompatibility("0.0.2-rc.1").compatible).toBe(true);
    expect(assessHostCompatibility("0.0.2").compatible).toBe(true);
    expect(assessHostCompatibility("0.1.0").compatible).toBe(true);
  });
});
