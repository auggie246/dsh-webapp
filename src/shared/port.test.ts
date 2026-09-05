import { describe, expect, test } from "vitest";
import { parseAttachInput, parsePortText } from "./port.js";

describe("parsePortText", () => {
  test("reads a bare port", () => {
    expect(parsePortText(" 3080 ")).toBe(3080);
  });

  test("refuses junk and out-of-range ports", () => {
    expect(parsePortText("dsh")).toBeNull();
    expect(parsePortText("0")).toBeNull();
    expect(parsePortText("70000")).toBeNull();
    expect(parsePortText("")).toBeNull();
  });
});

describe("parseAttachInput", () => {
  test("accepts a bare port", () => {
    expect(parseAttachInput("3080")).toEqual({ port: 3080 });
  });

  test("accepts the authenticated URL a 0.1.2-rc.1 Host prints (issue #8)", () => {
    expect(parseAttachInput("http://127.0.0.1:4123/?token=s3cret-token")).toEqual({
      port: 4123,
      token: "s3cret-token",
    });
  });

  test("accepts the whole pasted `dsh web:` line with its LAN suffix", () => {
    expect(
      parseAttachInput(
        "dsh web: http://127.0.0.1:4123/?token=s3cret-token (LAN: http://192.168.1.4:4123/?token=s3cret-token)"
      )
    ).toEqual({ port: 4123, token: "s3cret-token" });
  });

  test("accepts a tokenless URL as a legacy attach", () => {
    expect(parseAttachInput("http://127.0.0.1:4123")).toEqual({ port: 4123 });
  });

  test("refuses a non-loopback URL", () => {
    expect(parseAttachInput("http://192.168.1.4:4123/?token=x")).toBeNull();
  });

  test("refuses URLs without a port and junk", () => {
    expect(parseAttachInput("http://127.0.0.1/?token=x")).toBeNull();
    expect(parseAttachInput("attach me")).toBeNull();
    expect(parseAttachInput("")).toBeNull();
  });
});
