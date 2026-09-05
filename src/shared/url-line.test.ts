import { describe, expect, test } from "vitest";
import { hostWebUrl, parseDshWebLine } from "./url-line.js";

describe("parseDshWebLine", () => {
  test("reads the loopback URL and port from the contract line", () => {
    expect(parseDshWebLine("dsh web: http://127.0.0.1:58778")).toEqual({
      url: "http://127.0.0.1:58778",
      port: 58778,
    });
  });

  test("carries the launch token a 0.1.2-rc.1 Host prints (issue #8)", () => {
    expect(
      parseDshWebLine(
        "dsh web: http://127.0.0.1:4123/?token=Ab12Cd34Ef56 (LAN: http://192.168.1.4:4123/?token=Ab12Cd34Ef56)"
      )
    ).toEqual({
      url: "http://127.0.0.1:4123/?token=Ab12Cd34Ef56",
      port: 4123,
      token: "Ab12Cd34Ef56",
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

  test("returns null for a non-http scheme", () => {
    expect(parseDshWebLine("dsh web: https://127.0.0.1:4123")).toBeNull();
  });

  test("returns null for malformed URL-shaped text", () => {
    expect(parseDshWebLine("dsh web: ://not-a-url")).toBeNull();
  });
});

describe("hostWebUrl", () => {
  test("builds the plain origin for a pre-authentication Host", () => {
    expect(hostWebUrl(4077)).toBe("http://127.0.0.1:4077");
  });

  test("appends the launch token exactly as the Host prints it", () => {
    expect(hostWebUrl(4123, "Ab12Cd34Ef56")).toBe(
      "http://127.0.0.1:4123/?token=Ab12Cd34Ef56"
    );
  });
});
