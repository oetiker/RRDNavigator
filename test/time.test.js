import { describe, test, expect } from "vitest";
import {
  formatEpoch,
  epochFromParts,
  startOf,
  endOf,
  formatSmokeping,
  formatIsoLocal
} from "../src/core/time.js";

describe("time helpers", () => {
  test("formatEpoch returns parts in the given TZ", () => {
    // 2026-05-09T12:00:00Z = 14:00 in Europe/Zurich (DST)
    const epoch = Date.UTC(2026, 4, 9, 12, 0, 0) / 1000;
    const p = formatEpoch(epoch, "Europe/Zurich");
    expect(p).toEqual({ year: 2026, month: 5, day: 9, hour: 14, minute: 0, second: 0 });
  });

  test("formatEpoch UTC", () => {
    const epoch = Date.UTC(2026, 4, 9, 12, 0, 0) / 1000;
    expect(formatEpoch(epoch, "UTC"))
      .toEqual({ year: 2026, month: 5, day: 9, hour: 12, minute: 0, second: 0 });
  });

  test("epochFromParts is the inverse of formatEpoch", () => {
    const p = { year: 2026, month: 5, day: 9, hour: 14, minute: 30, second: 0 };
    const tz = "Europe/Zurich";
    const e = epochFromParts(p, tz);
    expect(formatEpoch(e, tz)).toEqual(p);
  });

  test("startOf('day') in TZ", () => {
    const epoch = Date.UTC(2026, 4, 9, 12, 0, 0) / 1000; // mid-day UTC, 14:00 Zurich
    const start = startOf(epoch, "day", "Europe/Zurich");
    expect(formatEpoch(start, "Europe/Zurich"))
      .toEqual({ year: 2026, month: 5, day: 9, hour: 0, minute: 0, second: 0 });
  });

  test("endOf('day') is one second before next midnight", () => {
    const epoch = Date.UTC(2026, 4, 9, 12, 0, 0) / 1000;
    const end = endOf(epoch, "day", "Europe/Zurich");
    expect(formatEpoch(end, "Europe/Zurich"))
      .toEqual({ year: 2026, month: 5, day: 9, hour: 23, minute: 59, second: 59 });
  });

  test("formatSmokeping renders YYYY-MM-DD+HH:mm in TZ", () => {
    const epoch = Date.UTC(2026, 4, 9, 0, 18, 0) / 1000; // 02:18 Zurich (DST)
    expect(formatSmokeping(epoch, "Europe/Zurich")).toBe("2026-05-09+02:18");
  });

  test("formatIsoLocal renders YYYY-MM-DDTHH:mm:ss in TZ (no Z)", () => {
    const epoch = Date.UTC(2026, 4, 9, 0, 18, 5) / 1000;
    expect(formatIsoLocal(epoch, "Europe/Zurich")).toBe("2026-05-09T02:18:05");
  });
});
