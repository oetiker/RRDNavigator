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

describe("built-in formatters (after index import)", () => {
  test("smokeping, iso, iso-local, smokeping-now, rrd are registered", async () => {
    _resetFormatters();
    await import("../src/index.js");
    const fn = compile("a={{x:smokeping}}&b={{y:smokeping-now}}&c={{x:iso}}&d={{x:iso-local}}&e={{x:rrd}}");
    const ctx = {
      x: { epoch: Date.UTC(2026, 4, 9, 0, 18, 0) / 1000, isNow: false, tz: "Europe/Zurich" },
      y: { epoch: Math.floor(Date.now() / 1000), isNow: true, tz: "UTC" }
    };
    const out = fn(ctx);
    expect(out).toMatch(/a=2026-05-09\+02:18/);
    expect(out).toMatch(/b=now/);
    expect(out).toMatch(/c=2026-05-09T00:18:00/);
    expect(out).toMatch(/d=2026-05-09T02:18:00/);
    expect(out).toMatch(/e=\d+/);
  });
});
