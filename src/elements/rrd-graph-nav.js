import { getGroup, subscribe, update } from "../core/state.js";
import { startOf, endOf } from "../core/time.js";

const STYLE = `
:host { display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; font: inherit; }
button {
  background: var(--rrd-button-bg, #f4f4f4);
  color: var(--rrd-button-fg, inherit);
  border: 1px solid var(--rrd-button-border, #ccc);
  padding: 0.25em 0.6em;
  cursor: pointer;
  font: inherit;
  border-radius: 3px;
}
button.active {
  background: var(--rrd-button-active-bg, #2b7);
  color: var(--rrd-button-active-fg, #fff);
  border-color: var(--rrd-button-active-bg, #2b7);
}
button:hover:not(.active) { background: var(--rrd-button-hover-bg, #eaeaea); }
.dt {
  display: none;
  align-items: center;
  gap: 0.25em;
}
:host([show-datetime="always"]) .dt,
:host([show-datetime="advanced"][_dt-open]) .dt {
  display: inline-flex;
}
input[type=date], input[type=time] {
  font: inherit;
  padding: 0.15em 0.3em;
}
`;

const ROLLING_RE = /^(\d+(?:\.\d+)?)\s*(s|m|h|d|w|M|y)$/;
const UNIT_SEC = { s: 1, m: 60, h: 3600, d: 86400, w: 7 * 86400, M: 30 * 86400, y: 365 * 86400 };
const ANCHORED = new Set(["today", "yesterday", "this-week", "this-month", "this-year"]);

const customPresets = new Map();
export function registerPreset(name, def) {
  customPresets.set(name, def);
}

function parsePresetSpec(raw) {
  // "Label=spec" or "spec"
  const m = /^([^=]+)=(.+)$/.exec(raw.trim());
  const label = m ? m[1].trim() : raw.trim();
  const spec  = m ? m[2].trim() : raw.trim();
  return { label, spec };
}

function evalPreset(spec, tz) {
  if (customPresets.has(spec)) {
    const def = customPresets.get(spec);
    if (def.kind === "rolling") {
      const end = Math.floor(Date.now() / 1000);
      return { start: end - def.seconds, range: def.seconds };
    }
  }
  const r = ROLLING_RE.exec(spec);
  if (r) {
    const range = parseFloat(r[1]) * UNIT_SEC[r[2]];
    return { start: Math.floor(Date.now() / 1000) - range, range };
  }
  if (ANCHORED.has(spec)) {
    const now = Math.floor(Date.now() / 1000);
    if (spec === "today") {
      const start = startOf(now, "day", tz);
      return { start, range: 86400 };
    }
    if (spec === "yesterday") {
      const start = startOf(now - 86400, "day", tz);
      return { start, range: 86400 };
    }
    if (spec === "this-week") {
      const start = startOf(now, "week", tz);
      return { start, range: 7 * 86400 };
    }
    if (spec === "this-month") {
      const start = startOf(now, "month", tz);
      const end = endOf(now, "month", tz) + 1;
      return { start, range: end - start };
    }
    if (spec === "this-year") {
      const start = startOf(now, "year", tz);
      const end = endOf(now, "year", tz) + 1;
      return { start, range: end - start };
    }
  }
  return null;
}

class RrdGraphNav extends HTMLElement {
  static get observedAttributes() {
    return ["group", "presets", "initial-preset", "show-datetime", "match-precision", "timezone"];
  }

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });

    // happy-dom may not support adoptedStyleSheets; fall back to <style> element.
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(STYLE);
      root.adoptedStyleSheets = [sheet];
    } catch (_e) {
      const styleEl = document.createElement("style");
      styleEl.textContent = STYLE;
      root.appendChild(styleEl);
    }

    this._buttons = document.createElement("span");
    root.appendChild(this._buttons);

    this._dtToggle = document.createElement("button");
    this._dtToggle.type = "button";
    this._dtToggle.textContent = "▾";
    this._dtToggle.title = "Show date/time inputs";
    this._dtToggle.addEventListener("click", () => {
      if (this.hasAttribute("_dt-open")) this.removeAttribute("_dt-open");
      else this.setAttribute("_dt-open", "");
    });
    root.appendChild(this._dtToggle);

    this._dt = document.createElement("span");
    this._dt.className = "dt";
    this._dateInput = document.createElement("input"); this._dateInput.type = "date";
    this._timeInput = document.createElement("input"); this._timeInput.type = "time"; this._timeInput.step = 1;
    this._applyBtn = document.createElement("button"); this._applyBtn.type = "button"; this._applyBtn.textContent = "Apply";
    this._dt.appendChild(this._dateInput);
    this._dt.appendChild(this._timeInput);
    this._dt.appendChild(this._applyBtn);
    root.appendChild(this._dt);

    this._applyBtn.addEventListener("click", () => this._applyDateTime());
    this._unsub = null;
    this._slot = document.createElement("slot");
    root.appendChild(this._slot);
  }

  connectedCallback() {
    this._reconcile();
  }

  disconnectedCallback() {
    if (this._unsub) this._unsub();
    this._unsub = null;
    this._subscribedGroup = null;
  }

  attributeChangedCallback(name) {
    if (!this.isConnected) return;
    if (name === "presets" || name === "initial-preset") this._renderButtons();
    if (name === "show-datetime") this._renderDtVisibility();
    // Re-run reconcile on group changes so subscription is set up even if
    // connectedCallback fired before attributes were applied (happy-dom).
    this._reconcile();
  }

  _reconcile() {
    if (!this.isConnected) return;
    this._renderButtons();
    this._renderDtVisibility();
    const group = this.getAttribute("group");
    if (!group) return;
    // Set up subscription only once (or when group changes).
    if (group !== this._subscribedGroup) {
      if (this._unsub) {
        this._unsub();
        this._unsub = null;
      }
      this._subscribedGroup = group;
      const initial = this.getAttribute("initial-preset");
      if (initial) {
        const spec = this._presetMap.get(initial) || initial;
        const r = evalPreset(spec, this._tz());
        if (r) update(group, { start: r.start, range: r.range }, "preset");
      }
      this._unsub = subscribe(group, (state) => this._reflectState(state));
    }
  }

  _tz() { return this.getAttribute("timezone") || undefined; }

  _renderButtons() {
    const presetsAttr = this.getAttribute("presets") || "60m,24h,7d,30d,today,this-week,this-month,this-year";
    const presets = presetsAttr.split(",").map((s) => parsePresetSpec(s));
    this._presetMap = new Map(presets.map(p => [p.label, p.spec]));
    this._buttons.innerHTML = "";
    for (const { label, spec } of presets) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.dataset.preset = spec;
      b.addEventListener("click", () => {
        const r = evalPreset(spec, this._tz());
        if (!r) return;
        const group = this.getAttribute("group");
        if (group) update(group, { start: r.start, range: r.range }, "preset");
      });
      this._buttons.appendChild(b);
    }
  }

  _renderDtVisibility() {
    const mode = this.getAttribute("show-datetime") || "advanced";
    this._dtToggle.style.display = mode === "advanced" ? "" : "none";
    if (mode === "always") this.setAttribute("_dt-open", "");
    if (mode === "none") {
      this.removeAttribute("_dt-open");
      this._dt.style.display = "none";
    }
  }

  _reflectState(state) {
    if (state.start == null) return;
    const precision = parseFloat(this.getAttribute("match-precision") || "0.05");
    let activeSpec = null;
    for (const btn of this._buttons.querySelectorAll("button[data-preset]")) {
      const spec = btn.dataset.preset;
      const r = evalPreset(spec, this._tz());
      if (!r) continue;
      const rangeOk = Math.abs(r.range - state.range) / r.range <= precision;
      const startOk = Math.abs(r.start - state.start) / Math.max(state.range, 1) <= precision;
      if (rangeOk && startOk) { activeSpec = spec; break; }
    }
    for (const btn of this._buttons.querySelectorAll("button[data-preset]")) {
      btn.classList.toggle("active", btn.dataset.preset === activeSpec);
    }
    // reflect into date/time inputs
    const d = new Date(state.start * 1000);
    const tz = this._tz();
    let parts;
    if (tz) {
      const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
      const ps = fmt.formatToParts(d);
      parts = Object.fromEntries(ps.map(p => [p.type, p.value]));
    } else {
      parts = {
        year: String(d.getFullYear()),
        month: String(d.getMonth()+1).padStart(2,"0"),
        day:   String(d.getDate()).padStart(2,"0"),
        hour:  String(d.getHours()).padStart(2,"0"),
        minute:String(d.getMinutes()).padStart(2,"0"),
        second:String(d.getSeconds()).padStart(2,"0")
      };
    }
    if (parts.year) this._dateInput.value = `${parts.year}-${parts.month}-${parts.day}`;
    if (parts.hour) this._timeInput.value = `${parts.hour}:${parts.minute}:${parts.second}`;
  }

  _applyDateTime() {
    const dateStr = this._dateInput.value;
    const timeStr = this._timeInput.value || "00:00:00";
    if (!dateStr) return;
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh, mm, ss = 0] = timeStr.split(":").map(Number);
    const tz = this._tz();
    let epoch;
    if (tz) {
      // compute epoch via offset correction
      const utc = Date.UTC(y, m - 1, d, hh, mm, ss) / 1000;
      const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
      const parts = Object.fromEntries(f.formatToParts(new Date(utc * 1000)).map(p => [p.type, p.value]));
      const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) / 1000;
      const desired = Date.UTC(y, m - 1, d, hh, mm, ss) / 1000;
      epoch = utc + (desired - asUtc);
    } else {
      epoch = Math.floor(new Date(y, m - 1, d, hh, mm, ss).getTime() / 1000);
    }
    const group = this.getAttribute("group");
    if (group) update(group, { start: epoch }, "datetime");
  }
}

customElements.define("rrd-graph-nav", RrdGraphNav);
export { RrdGraphNav };
