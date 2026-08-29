import { describe, expect, test } from "vitest";
import { LineAssembler } from "./lines.js";

describe("LineAssembler", () => {
  test("emits a complete line once its newline arrives", () => {
    const assembler = new LineAssembler();
    expect(assembler.push("dsh web: http://127.0.0.1:4123\n")).toEqual([
      "dsh web: http://127.0.0.1:4123",
    ]);
  });

  test("reassembles a line split across chunks", () => {
    const assembler = new LineAssembler();
    expect(assembler.push("dsh web: http://127.0.0")).toEqual([]);
    expect(assembler.push(".1:4123\n")).toEqual([
      "dsh web: http://127.0.0.1:4123",
    ]);
  });

  test("strips the carriage return of CRLF endings", () => {
    const assembler = new LineAssembler();
    expect(assembler.push("line one\r\nline two\r\n")).toEqual([
      "line one",
      "line two",
    ]);
  });

  test("emits every line carried by one chunk", () => {
    const assembler = new LineAssembler();
    expect(assembler.push("a\nb\nc\n")).toEqual(["a", "b", "c"]);
  });

  test("holds a trailing partial line until its newline arrives", () => {
    const assembler = new LineAssembler();
    expect(assembler.push("partial")).toEqual([]);
    expect(assembler.push(" rest\nnext\n")).toEqual(["partial rest", "next"]);
  });

  test("skips whitespace-only lines", () => {
    const assembler = new LineAssembler();
    expect(assembler.push("\n  \nreal\n")).toEqual(["real"]);
  });
});
