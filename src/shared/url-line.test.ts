import { describe, expect, test } from "vitest";
import { parseDshWebLine } from "./url-line.js";

describe("parseDshWebLine", () => {
  test("reads the loopback URL and port from the contract line", () => {
    expect(parseDshWebLine("dsh web: http://127.0.0.1:58778")).toEqual({
      url: "http://127.0.0.1:58778",
      port: 58778,
    });
  });

  test("tolerates the LAN suffix printed when the Host binds all interfaces", () => {
    expect(
      parseDshWebLine(
        "dsh web: http://127.0.0.1:4123 (LAN: http://192.168.1.4:4123)"
      )
    ).toEqual({ url: "http://127.0.0.1:4123", port: 4123 });
  });

  test("returns null for any other stdout line", () => {
    expect(parseDshWebLine("opening the default browser")).toBeNull();
  });

  test("returns null for a non-loopback URL", () => {
    expect(parseDshWebLine("dsh web: http://10.0.0.2:4123")).toBeNull();
  });

  test("returns null for a URL without a port", () => {
    expect(parseDshWebLine("dsh web: http://127.0.0.1")).toBeNull();
  });
});
