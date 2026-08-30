import { describe, expect, test } from "vitest";
import { assessHostCompatibility, MINIMUM_HOST_VERSION } from "./host-compatibility.js";

describe("assessHostCompatibility", () => {
  test("accepts the first supported Host version", () => {
    expect(assessHostCompatibility("0.1.1-rc.2")).toEqual({
      compatible: true,
      minimum: MINIMUM_HOST_VERSION,
    });
  });

  test("rejects an older Host version", () => {
    expect(assessHostCompatibility("0.1.1-rc.1")).toEqual({
      compatible: false,
      minimum: MINIMUM_HOST_VERSION,
      actual: "0.1.1-rc.1",
    });
  });

  test("rejects a Host that does not report a usable version", () => {
    expect(assessHostCompatibility(undefined)).toEqual({
      compatible: false,
      minimum: MINIMUM_HOST_VERSION,
      actual: undefined,
    });
  });

  test("accepts newer prerelease and stable versions", () => {
    expect(assessHostCompatibility("0.1.1-rc.3").compatible).toBe(true);
    expect(assessHostCompatibility("0.1.1").compatible).toBe(true);
    expect(assessHostCompatibility("0.2.0").compatible).toBe(true);
  });
});
