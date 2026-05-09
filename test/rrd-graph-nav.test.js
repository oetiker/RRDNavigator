import { describe, test, expect, beforeEach } from "vitest";
import "../src/elements/rrd-graph-nav.js";
import { _reset, getGroup, update } from "../src/core/state.js";

function mount(html) {
  document.body.innerHTML = html;
  return document.body.firstElementChild;
}

describe("<rrd-graph-nav> presets", () => {
  beforeEach(() => {
    _reset();
    document.body.innerHTML = "";
  });

  test("registers as a custom element", () => {
    expect(customElements.get("rrd-graph-nav")).toBeDefined();
  });

  test("renders one button per preset", () => {
    const el = mount('<rrd-graph-nav group="g1" presets="60m,24h,7d"></rrd-graph-nav>');
    const buttons = el.shadowRoot.querySelectorAll("button[data-preset]");
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent).toMatch(/60m/);
  });

  test("clicking a rolling preset updates group state", () => {
    const el = mount('<rrd-graph-nav group="g1" presets="60m,24h"></rrd-graph-nav>');
    const buttons = el.shadowRoot.querySelectorAll("button[data-preset]");
    buttons[0].click();
    const state = getGroup("g1");
    expect(state.range).toBe(3600);
    const now = Math.floor(Date.now() / 1000);
    expect(state.start).toBeGreaterThan(now - 3700);
    expect(state.start).toBeLessThan(now + 10);
  });

  test("custom labels via 'Label=spec'", () => {
    const el = mount('<rrd-graph-nav group="g1" presets="Hour=60m,Day=24h"></rrd-graph-nav>');
    const buttons = el.shadowRoot.querySelectorAll("button[data-preset]");
    expect(buttons[0].textContent).toBe("Hour");
    expect(buttons[1].textContent).toBe("Day");
  });

  test("auto-snaps active class when group state matches a preset", () => {
    const el = mount('<rrd-graph-nav group="g1" presets="60m,24h"></rrd-graph-nav>');
    update("g1", { start: Math.floor(Date.now()/1000) - 3600, range: 3600 }, "pan");
    const active = el.shadowRoot.querySelector("button.active[data-preset]");
    expect(active).toBeTruthy();
    expect(active.textContent).toMatch(/60m/);
  });

  test("anchored 'today' preset uses startOf-day in TZ", () => {
    const el = mount('<rrd-graph-nav group="g1" presets="today" timezone="UTC"></rrd-graph-nav>');
    el.shadowRoot.querySelector("button[data-preset]").click();
    const state = getGroup("g1");
    const expectedStart = Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) / 1000);
    expect(state.start).toBeCloseTo(expectedStart, -1);
  });
});
