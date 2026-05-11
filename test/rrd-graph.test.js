import { describe, test, expect, beforeEach, vi } from "vitest";
import "../src/elements/rrd-graph.js";
import { _reset, getGroup } from "../src/core/state.js";

function mount(html) {
  document.body.innerHTML = html;
  return document.body.firstElementChild;
}

describe("<rrd-graph> rendering", () => {
  beforeEach(() => {
    _reset();
    document.body.innerHTML = "";
  });

  test("registers as a custom element", () => {
    expect(customElements.get("rrd-graph")).toBeDefined();
  });

  test("renders an <img> in shadow root", () => {
    const el = mount('<rrd-graph template="x?{{start}}" initial-start="100" initial-range="60"></rrd-graph>');
    const img = el.shadowRoot.querySelector("img");
    expect(img).toBeTruthy();
  });

  test("substitutes start/end from initial- attributes", () => {
    const el = mount('<rrd-graph template="x?s={{start}}&e={{end}}" initial-start="100" initial-range="60"></rrd-graph>');
    const img = el.shadowRoot.querySelector("img");
    // image src should reflect start=100, end=160
    expect(img.getAttribute("src")).toMatch(/s=100/);
    expect(img.getAttribute("src")).toMatch(/e=160/);
  });

  test("updates image src when setStartRange is called", () => {
    const el = mount('<rrd-graph template="x?s={{start}}" initial-start="100" initial-range="60"></rrd-graph>');
    const img = el.shadowRoot.querySelector("img");
    // The inflight gate suppresses src changes while a prior fetch is in
    // flight. happy-dom never fires `load` on its own, so simulate the
    // initial image having loaded before triggering the next refresh.
    img.dispatchEvent(new Event("load"));
    el.setStartRange(500, 30);
    expect(img.getAttribute("src")).toMatch(/s=500/);
  });

  test("auto-creates a private group when no group attribute", () => {
    const el = mount('<rrd-graph template="x" initial-start="100" initial-range="60"></rrd-graph>');
    expect(el._groupName).toMatch(/^_private/);
  });

  test("uses named group", () => {
    const el = mount('<rrd-graph group="dash1" template="x" initial-start="100" initial-range="60"></rrd-graph>');
    expect(el._groupName).toBe("dash1");
    expect(getGroup("dash1")).toMatchObject({ start: 100, range: 60 });
  });

  test("emits rrd-change after setStartRange", () => {
    const el = mount('<rrd-graph template="x" initial-start="100" initial-range="60"></rrd-graph>');
    const handler = vi.fn();
    el.addEventListener("rrd-change", handler);
    el.setStartRange(500, 30);
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].detail).toMatchObject({ start: 500, range: 30, source: "set" });
  });

  test("inflight gate: while a fetch is in flight, src is not updated", () => {
    const el = mount('<rrd-graph template="x?s={{start}}" initial-start="100" initial-range="60"></rrd-graph>');
    const img = el.shadowRoot.querySelector("img");
    // After mount, the initial src is set and _loading is true (no load event fired).
    expect(img.getAttribute("src")).toMatch(/s=100/);
    // Subsequent state changes do not update src while the initial fetch is pending.
    el.setStartRange(200, 60);
    expect(img.getAttribute("src")).toMatch(/s=100/);
    el.setStartRange(300, 60);
    expect(img.getAttribute("src")).toMatch(/s=100/);
  });

  test("inflight gate: on load, src is updated to current state (not stale intermediates)", () => {
    const el = mount('<rrd-graph template="x?s={{start}}" initial-start="100" initial-range="60"></rrd-graph>');
    const img = el.shadowRoot.querySelector("img");
    // Queue several state changes while the initial fetch is in flight.
    el.setStartRange(200, 60);
    el.setStartRange(300, 60);
    el.setStartRange(999, 60);
    // Now the initial fetch completes. The element should fire one fresh
    // request for the *current* state — not for any of the queued intermediates.
    img.dispatchEvent(new Event("load"));
    expect(img.getAttribute("src")).toMatch(/s=999/);
  });

  test("inflight gate: error also releases the gate and flushes pending state", () => {
    const el = mount('<rrd-graph template="x?s={{start}}" initial-start="100" initial-range="60"></rrd-graph>');
    const img = el.shadowRoot.querySelector("img");
    el.setStartRange(777, 60);
    expect(img.getAttribute("src")).toMatch(/s=100/);
    img.dispatchEvent(new Event("error"));
    expect(img.getAttribute("src")).toMatch(/s=777/);
  });

  test("inflight gate: no-op when computed URL matches current src", () => {
    const el = mount('<rrd-graph template="x?s={{start}}" initial-start="100" initial-range="60"></rrd-graph>');
    const img = el.shadowRoot.querySelector("img");
    img.dispatchEvent(new Event("load"));
    let changes = 0;
    const obs = new MutationObserver((muts) => {
      for (const m of muts) if (m.attributeName === "src") changes++;
    });
    obs.observe(img, { attributes: true, attributeFilter: ["src"] });
    // Force a refresh with unchanged state — URL is identical, no new fetch.
    el.update();
    // MutationObserver fires asynchronously; flush microtasks.
    return Promise.resolve().then(() => {
      obs.disconnect();
      expect(changes).toBe(0);
    });
  });
});

describe("<rrd-graph> interaction", () => {
  beforeEach(() => {
    _reset();
    document.body.innerHTML = "";
  });

  test("horizontal drag pans start", () => {
    const el = mount('<rrd-graph template="x" initial-start="1000" initial-range="60" canvas-padding="0" style="width:600px;height:200px"></rrd-graph>');
    // simulate width
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 600 });
    Object.defineProperty(el, "offsetWidth", { configurable: true, value: 600 });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 200 });
    Object.defineProperty(el, "offsetHeight", { configurable: true, value: 200 });
    const canvas = el.shadowRoot.querySelector("canvas");
    canvas.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 300, clientY: 100, pointerId: 1 }));
    document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 200, clientY: 100, pointerId: 1 }));
    document.dispatchEvent(new MouseEvent("pointerup",   { bubbles: true, clientX: 200, clientY: 100, pointerId: 1 }));
    // 100px right-to-left drag on 600px wide / 60s range = +10s start
    const state = getGroup(el._groupName);
    expect(state.start).toBeCloseTo(1010, 0);
  });

  test("ctrl+wheel zooms", () => {
    const el = mount('<rrd-graph template="x" initial-start="1000" initial-range="60" style="width:600px;height:200px"></rrd-graph>');
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 600 });
    Object.defineProperty(el, "offsetWidth", { configurable: true, value: 600 });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 200 });
    Object.defineProperty(el, "offsetHeight", { configurable: true, value: 200 });
    const canvas = el.shadowRoot.querySelector("canvas");
    const wheelEvt = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -200, clientX: 300, clientY: 100 });
    // happy-dom's WheelEvent doesn't inherit MouseEvent so ctrlKey isn't set from init; patch it.
    if (!wheelEvt.ctrlKey) Object.defineProperty(wheelEvt, "ctrlKey", { value: true, configurable: true });
    canvas.dispatchEvent(wheelEvt);
    const state = getGroup(el._groupName);
    expect(state.range).toBeLessThan(60);
    expect(state.range).toBeGreaterThan(0);
  });

  test("dblclick opens current src in a new window", () => {
    const el = mount('<rrd-graph template="img.png?s={{start}}" initial-start="1000" initial-range="60"></rrd-graph>');
    const opened = [];
    const realOpen = window.open;
    window.open = (url) => { opened.push(url); return null; };
    const canvas = el.shadowRoot.querySelector("canvas");
    canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    window.open = realOpen;
    expect(opened.length).toBe(1);
    expect(opened[0]).toMatch(/img\.png\?s=1000/);
  });
});

describe("<rrd-graph> auto-update", () => {
  beforeEach(() => {
    _reset();
    document.body.innerHTML = "";
  });

  test("auto-update advances start when 'now' is in range", () => {
    const realNow = Date.now;
    let nowMs = 1_700_000_000_000;
    Date.now = () => nowMs;
    try {
      const initialStart = Math.floor(nowMs / 1000) - 30;
      const el = mount(`<rrd-graph template="x" initial-start="${initialStart}" initial-range="60" auto-update style="width:600px;height:200px"></rrd-graph>`);
      Object.defineProperty(el, "clientWidth", { configurable: true, value: 600 });
      Object.defineProperty(el, "offsetWidth", { configurable: true, value: 600 });
      const startBefore = getGroup(el._groupName).start;
      // advance 'now' by 10s
      nowMs += 10_000;
      el._tickAutoUpdate();
      const startAfter = getGroup(el._groupName).start;
      expect(startAfter).toBeGreaterThan(startBefore);
    } finally {
      Date.now = realNow;
    }
  });

  test("auto-update does nothing when 'now' is outside range", () => {
    const initialStart = 1; // far in the past
    const el = mount(`<rrd-graph template="x" initial-start="${initialStart}" initial-range="60" auto-update></rrd-graph>`);
    const before = getGroup(el._groupName).start;
    el._tickAutoUpdate();
    expect(getGroup(el._groupName).start).toBe(before);
  });
});
