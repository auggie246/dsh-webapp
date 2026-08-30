import { describe, expect, test } from "vitest";
import { windowCloseAction } from "./window-close-policy.js";

describe("windowCloseAction", () => {
  test("hides when the Tray is usable", () => {
    expect(windowCloseAction(true)).toBe("hide");
  });

  test("quits when the Tray is unavailable", () => {
    expect(windowCloseAction(false)).toBe("quit");
  });
});
