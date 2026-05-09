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
    el.setStartRange(500, 30);
    const img = el.shadowRoot.querySelector("img");
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
});
