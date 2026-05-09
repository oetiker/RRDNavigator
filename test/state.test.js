import { describe, test, expect, beforeEach } from "vitest";
import { getGroup, subscribe, update, _reset } from "../src/core/state.js";

describe("group state", () => {
  beforeEach(() => _reset());

  test("getGroup creates a group lazily", () => {
    const g = getGroup("dash1");
    expect(g.start).toBeUndefined();
    expect(g.range).toBeUndefined();
  });

  test("update notifies subscribers", () => {
    const events = [];
    subscribe("dash1", (state, source) => events.push({ ...state, source }));
    update("dash1", { start: 100, range: 60 }, "set");
    expect(events).toEqual([{ start: 100, range: 60, source: "set" }]);
  });

  test("update merges into existing state", () => {
    update("dash1", { start: 100, range: 60 }, "set");
    update("dash1", { range: 120 }, "zoom");
    expect(getGroup("dash1")).toMatchObject({ start: 100, range: 120 });
  });

  test("subscribe returns unsubscribe", () => {
    const events = [];
    const unsub = subscribe("dash1", (s) => events.push(s));
    update("dash1", { start: 1 }, "set");
    unsub();
    update("dash1", { start: 2 }, "set");
    expect(events.length).toBe(1);
  });

  test("groups are isolated", () => {
    const a = [];
    const b = [];
    subscribe("a", (s) => a.push(s.start));
    subscribe("b", (s) => b.push(s.start));
    update("a", { start: 1 }, "set");
    update("b", { start: 2 }, "set");
    expect(a).toEqual([1]);
    expect(b).toEqual([2]);
  });
});
