import { describe, test, expect, beforeEach } from "vitest";
import { compile, registerFormatter, _resetFormatters } from "../src/core/template.js";

describe("template engine", () => {
  beforeEach(() => _resetFormatters());

  test("substitutes a plain string key", () => {
    expect(compile("hello {{name}}")({ name: "world" })).toBe("hello world");
  });

  test("substitutes integer keys", () => {
    expect(compile("w={{width}}")({ width: 800 })).toBe("w=800");
  });

  test("uses default 'epoch' formatter when value is an object with epoch field", () => {
    const out = compile("s={{start}}")({ start: { epoch: 12345, isNow: false, tz: "UTC" } });
    expect(out).toBe("s=12345");
  });

  test("invokes a named formatter", () => {
    registerFormatter("upper", (v) => String(v).toUpperCase());
    expect(compile("{{x:upper}}")({ x: "abc" })).toBe("ABC");
  });

  test("throws on unknown formatter", () => {
    expect(() => compile("{{x:nope}}")({ x: "a" }))
      .toThrow(/unknown formatter: nope/i);
  });

  test("missing keys collapse to empty string", () => {
    expect(compile("a={{missing}}b")({})).toBe("a=b");
  });

  test("compile is reusable across calls", () => {
    const fn = compile("{{n}}");
    expect(fn({ n: 1 })).toBe("1");
    expect(fn({ n: 2 })).toBe("2");
  });
});
