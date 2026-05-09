import { compile } from "../core/template.js";
import { getGroup, subscribe, update } from "../core/state.js";

const DURATION_RE = /^(\d+(?:\.\d+)?)\s*(s|m|h|d|w|M|y)?$/;
const UNIT_SEC = { s: 1, m: 60, h: 3600, d: 86400, w: 7 * 86400, M: 30 * 86400, y: 365 * 86400 };

function parseDuration(str, fallback) {
  if (str == null) return fallback;
  const s = String(str).trim();
  const m = DURATION_RE.exec(s);
  if (!m) {
    const n = Number(s);
    return Number.isFinite(n) ? n : fallback;
  }
  return parseFloat(m[1]) * (UNIT_SEC[m[2] || "s"]);
}

function parseStart(str, range) {
  if (str == null || str === "") return Math.floor(Date.now() / 1000) - range;
  const s = String(str).trim();
  if (s === "now") return Math.floor(Date.now() / 1000);
  if (s.startsWith("now-")) return Math.floor(Date.now() / 1000) - parseDuration(s.slice(4), 0);
  if (s.startsWith("now+")) return Math.floor(Date.now() / 1000) + parseDuration(s.slice(4), 0);
  // Plain epoch integer/float (check before ISO parse to avoid year-100 misinterpretation)
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  // ISO 8601
  const d = Date.parse(s);
  if (!isNaN(d)) return Math.floor(d / 1000);
  return Math.floor(Date.now() / 1000) - range;
}

const STYLE = `
:host { display: inline-block; position: relative; }
img, canvas { display: block; width: 100%; height: 100%; }
canvas { position: absolute; inset: 0; pointer-events: auto; cursor: grab; }
:host([_dragging]) canvas { cursor: grabbing; }
`;

let privateGroupCounter = 0;

class RrdGraph extends HTMLElement {
  static get observedAttributes() {
    return ["template", "group", "initial-start", "initial-range", "timezone", "canvas-padding", "move-zoom", "auto-update"];
  }

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });

    // happy-dom may not support CSSStyleSheet constructor / adoptedStyleSheets;
    // fall back to a <style> element in the shadow root.
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(STYLE);
      root.adoptedStyleSheets = [sheet];
    } catch (_e) {
      const styleEl = document.createElement("style");
      styleEl.textContent = STYLE;
      root.appendChild(styleEl);
    }

    this._img = document.createElement("img");
    this._canvas = document.createElement("canvas");
    root.appendChild(this._img);
    root.appendChild(this._canvas);

    this._compiled = null;
    this._groupName = null;
    this._unsub = null;
    this._loading = false;
    this._skipped = false;
    this._lastInteraction = 0;

    this._img.addEventListener("load", () => {
      this._loading = false;
      if (this._skipped) {
        this._skipped = false;
        this._refreshImage();
      }
      this.dispatchEvent(new CustomEvent("rrd-load", {
        bubbles: true, composed: true, detail: { url: this._img.getAttribute("src") }
      }));
    });
    this._img.addEventListener("error", (e) => {
      this._loading = false;
      this.dispatchEvent(new CustomEvent("rrd-error", {
        bubbles: true, composed: true, detail: { url: this._img.getAttribute("src"), error: e }
      }));
    });
  }

  connectedCallback() {
    this._reconcile();
  }

  disconnectedCallback() {
    if (this._unsub) this._unsub();
    this._unsub = null;
    // Reset so that re-connection re-initializes properly
    this._groupName = null;
    this._compiled = null;
  }

  /**
   * Reconcile element state with current attributes.
   *
   * In happy-dom (and some real browsers during upgrade), connectedCallback
   * fires before attributes are applied, so attributes may be null at that
   * point. Each observedAttribute then triggers attributeChangedCallback one
   * by one. We defer full initialization until the minimum required attributes
   * (initial-range at minimum) are present so that we do not set up the group
   * with wrong defaults and then overwrite them.
   */
  _reconcile() {
    if (!this.isConnected) return;

    const rangeAttr = this.getAttribute("initial-range");
    // If initial-range is not yet available, defer — more ACCs will follow.
    if (rangeAttr == null) return;

    const range = parseDuration(rangeAttr, 24 * 3600);
    const start = parseStart(this.getAttribute("initial-start"), range);
    const desiredGroup = this.getAttribute("group") || null;

    // Determine the group name: reuse existing private group if we had one,
    // or use the named group, or create a new private group.
    let newGroupName;
    if (desiredGroup) {
      newGroupName = desiredGroup;
    } else if (this._groupName && this._groupName.startsWith("_private_")) {
      // Already have a private group — keep it.
      newGroupName = this._groupName;
    } else {
      newGroupName = `_private_${++privateGroupCounter}`;
    }

    // If the group changed, unsubscribe from the old one.
    if (newGroupName !== this._groupName) {
      if (this._unsub) {
        this._unsub();
        this._unsub = null;
      }
      this._groupName = newGroupName;
    }

    // Compile template if not yet compiled or template changed.
    this._compiled = compile(this.getAttribute("template") || "");

    // Initialize group state only if it hasn't been set yet.
    const existing = getGroup(this._groupName);
    if (existing.start == null) {
      update(this._groupName, { start, range, timezone: this.getAttribute("timezone") || undefined }, "set");
    }

    // Subscribe if not yet subscribed.
    if (!this._unsub) {
      this._unsub = subscribe(this._groupName, (state, source) => {
        this._refreshImage();
        if (source === "set" || source === "preset" || source === "datetime" || source === "pan" || source === "zoom") {
          this.dispatchEvent(new CustomEvent("rrd-change", {
            bubbles: true, composed: true,
            detail: { start: state.start, range: state.range, group: this._groupName, source }
          }));
        }
      });
    }

    this._refreshImage();
  }

  attributeChangedCallback(name, _old, _val) {
    if (!this.isConnected) return;
    this._reconcile();
  }

  get start()    { return getGroup(this._groupName).start; }
  get range()    { return getGroup(this._groupName).range; }
  get template() { return this.getAttribute("template"); }
  set template(v) { this.setAttribute("template", v); }

  setStartRange(start, range) {
    update(this._groupName, { start, range }, "set");
  }

  update() { this._refreshImage(); }

  _refreshImage(zoomOverride) {
    if (!this._compiled) return;
    if (!this._groupName) return;
    const state = getGroup(this._groupName);
    if (state.start == null || state.range == null) return;
    const tz = this.getAttribute("timezone") || state.timezone;
    const now = Math.floor(Date.now() / 1000);
    const end = state.start + state.range;
    const isNow = Math.abs(end - now) <= 1;
    const ctx = {
      start: { epoch: state.start, isNow: false, tz },
      end:   { epoch: end, isNow, tz },
      width:  Math.round(this.clientWidth || this.offsetWidth || 0),
      height: Math.round(this.clientHeight || this.offsetHeight || 0),
      zoom:   zoomOverride ?? 1,
      random: Math.floor(Math.random() * 1e9).toString(36)
    };
    const url = this._compiled(ctx);
    if (!url) return;
    if (this._loading) {
      // A load is already in flight; note that we'll need another refresh once
      // it completes, but go ahead and update the src so the browser cancels
      // the old request and starts the new one immediately.
      this._skipped = false; // the new src IS the latest state
    }
    this._loading = true;
    this._img.setAttribute("src", url);
  }
}

customElements.define("rrd-graph", RrdGraph);
export { RrdGraph };
