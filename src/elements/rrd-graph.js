import { compile } from "../core/template.js";
import { getGroup, subscribe, update } from "../core/state.js";
import { attach as attachGestures } from "../core/gestures.js";

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
    this._detachGestures = null;
    this._loading = false;
    this._pendingRefresh = false;
    this._lastInteraction = 0;
    this._autoUpdateInterval = null;
    this._autoUpdateLastNow = 0;

    const settle = () => {
      this._loading = false;
      if (this._pendingRefresh) {
        this._pendingRefresh = false;
        this._refreshImage();
      }
    };
    this._img.addEventListener("load", () => {
      settle();
      this.dispatchEvent(new CustomEvent("rrd-load", {
        bubbles: true, composed: true, detail: { url: this._img.getAttribute("src") }
      }));
    });
    this._img.addEventListener("error", (e) => {
      settle();
      this.dispatchEvent(new CustomEvent("rrd-error", {
        bubbles: true, composed: true, detail: { url: this._img.getAttribute("src"), error: e }
      }));
    });
  }

  connectedCallback() {
    this._reconcile();
  }

  disconnectedCallback() {
    if (this._detachGestures) this._detachGestures();
    this._detachGestures = null;
    if (this._autoUpdateInterval) clearInterval(this._autoUpdateInterval);
    this._autoUpdateInterval = null;
    if (this._unsub) this._unsub();
    this._unsub = null;
    // Reset so that re-connection re-initializes properly
    this._groupName = null;
    this._compiled = null;
    this._loading = false;
    this._pendingRefresh = false;
  }

  /**
   * Reconcile element state with current attributes.
   *
   * In happy-dom (and during custom-element upgrade in real browsers),
   * attributeChangedCallback may fire before all attributes are applied.
   * Reconcile is idempotent and safe to call multiple times; missing
   * attributes fall back to their documented defaults.
   */
  _reconcile() {
    if (!this.isConnected) return;

    const rangeAttr = this.getAttribute("initial-range");
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

    // Initialize group state if empty, or re-initialize if our previous
    // init used absent attributes that are now present (happy-dom timing,
    // and real-browser upgrade ordering).
    const existing = getGroup(this._groupName);
    const startAttr = this.getAttribute("initial-start");
    const rangeNowKnown = rangeAttr != null;
    const startNowKnown = startAttr != null;
    const ourInit = this._initFromAttrs;
    const shouldInit = existing.start == null || (
      ourInit != null && (
        (!ourInit.rangeKnown && rangeNowKnown) ||
        (!ourInit.startKnown && startNowKnown)
      )
    );
    if (shouldInit) {
      update(this._groupName, { start, range, timezone: this.getAttribute("timezone") || undefined }, "set");
      this._initFromAttrs = { rangeKnown: rangeNowKnown, startKnown: startNowKnown };
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

    if (!this._detachGestures) {
      this._detachGestures = this._wireGestures();
    }

    this._refreshImage();

    if (this.hasAttribute("auto-update") && !this._autoUpdateInterval) {
      this._autoUpdateLastNow = Math.floor(Date.now() / 1000);
      this._autoUpdateInterval = setInterval(() => this._tickAutoUpdate(), 1000);
    }
  }

  attributeChangedCallback(_name, _old, _val) {
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
    // Floor start/end to integer seconds. RRDtool's resolution is 1s, and
    // fractional epochs in URLs (which arise from zoom math producing
    // fractional ranges) are at best noise and at worst confuse the back
    // end. Keep state.start/range as-is for math precision, but never let
    // fractional values escape into rendered URLs.
    const startEpoch = Math.floor(state.start);
    const endEpoch = Math.floor(state.start + state.range);
    const isNow = Math.abs(endEpoch - now) <= 1;
    const ctx = {
      start: { epoch: startEpoch, isNow: false, tz },
      end:   { epoch: endEpoch, isNow, tz },
      width:  Math.round(this.clientWidth || this.offsetWidth || 0),
      height: Math.round(this.clientHeight || this.offsetHeight || 0),
      zoom:   zoomOverride ?? 1,
      random: Math.floor(Math.random() * 1e9).toString(36)
    };
    const url = this._compiled(ctx);
    if (!url) return;
    // Same URL as currently displayed — no fetch needed.
    if (url === this._img.getAttribute("src")) return;
    // A fetch is already in flight. Mark that newer state needs rendering;
    // when the current request settles (load/error), it will recompute the
    // URL against then-current state and fire one more request. This bounds
    // outstanding requests to at most one per element, preventing the burst
    // floods that make slow back ends (e.g. SmokePing CGI behind Apache)
    // return 503 on the trailing request and leave a broken-image icon.
    if (this._loading) {
      this._pendingRefresh = true;
      return;
    }
    this._loading = true;
    this._pendingRefresh = false;
    this._img.setAttribute("src", url);
  }

  _wireGestures() {
    let initialStart = 0;
    let initialRange = 0;
    let pointerOriginRel = 0;
    let interactionTimeout = null;
    const setInteracting = () => {
      this._lastInteraction = Date.now();
      if (interactionTimeout) clearTimeout(interactionTimeout);
      interactionTimeout = setTimeout(() => {
        this._lastInteraction = 0;
        this._clearGrid();
        this._refreshImage(); // final update at zoom=1
      }, 250);
    };

    const rangeCap = (r) => Math.max(10, Math.min(20 * 365 * 86400, r));
    const moveZoom = parseFloat(this.getAttribute("move-zoom") || "1") || 1;

    const refreshThrottled = throttle(() => this._refreshImage(moveZoom), 120);

    const onPanMove = ({ dx, dy }) => {
      const w = Math.max(1, this.clientWidth - parseFloat(this.getAttribute("canvas-padding") || "100"));
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        // vertical drag → zoom around pointer-origin x position
        const newRange = rangeCap(initialRange * Math.pow(1.02, dy));
        const newStart = Math.round(initialStart + (initialRange - newRange) * pointerOriginRel);
        update(this._groupName, { start: newStart, range: newRange }, "zoom");
      } else {
        const newStart = initialStart - Math.round(initialRange / w * dx);
        update(this._groupName, { start: newStart, range: initialRange }, "pan");
      }
      this._paintGrid(initialStart, initialRange);
      refreshThrottled();
      setInteracting();
    };

    const onPanStart = ({ x }) => {
      const state = getGroup(this._groupName);
      initialStart = state.start;
      initialRange = state.range;
      const rect = this.getBoundingClientRect();
      pointerOriginRel = (x - rect.left) / Math.max(1, rect.width);
      this.setAttribute("_dragging", "");
    };

    const onPanEnd = () => {
      this.removeAttribute("_dragging");
      setInteracting();
    };

    const onZoom = ({ factor, anchorX }) => {
      const state = getGroup(this._groupName);
      const newRange = rangeCap(state.range / factor);
      const rect = this.getBoundingClientRect();
      const rel = anchorX / Math.max(1, rect.width);
      const newStart = Math.round(state.start + (state.range - newRange) * rel);
      update(this._groupName, { start: newStart, range: newRange }, "zoom");
      this._paintGrid(state.start, state.range);
      refreshThrottled();
      setInteracting();
    };

    const onPinch = ({ factor, anchorX }) => onZoom({ factor, anchorX });

    const onDoubleTap = () => {
      const url = this._img.getAttribute("src");
      if (url) window.open(url, "_blank", `width=${this.clientWidth + 10},height=${this.clientHeight + 10}`);
    };

    return attachGestures(this._canvas, { onPanStart, onPanMove, onPanEnd, onZoom, onPinch, onDoubleTap });
  }

  _paintGrid(initialStart, initialRange) {
    const state = getGroup(this._groupName);
    const w = this.clientWidth || 0;
    const h = this.clientHeight || 0;
    if (!w || !h) return;
    this._canvas.width = w;
    this._canvas.height = h;
    if (typeof this._canvas.getContext !== "function") return;
    const ctx = this._canvas.getContext("2d");
    if (!ctx) return;
    const skip = 100;
    const xIncr = Math.max(1, Math.round(initialRange / state.range * skip));
    const xOff = Math.round((w / state.range * (initialStart - state.start)) % xIncr);
    const xWidth = Math.round(xIncr / 2);
    const a = getComputedStyle(this).getPropertyValue("--rrd-grid-a") || "rgba(0,0,0,0.08)";
    const b = getComputedStyle(this).getPropertyValue("--rrd-grid-b") || "rgba(255,255,255,0.08)";
    ctx.clearRect(0, 0, w, h);
    for (let x = -xIncr + xOff; x < w; x += xIncr) {
      ctx.fillStyle = a; ctx.fillRect(x, 0, xWidth, h);
      ctx.fillStyle = b; ctx.fillRect(x + xWidth, 0, xWidth, h);
    }
  }

  _clearGrid() {
    if (typeof this._canvas.getContext !== "function") return;
    const ctx = this._canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }

  _tickAutoUpdate() {
    if (this._lastInteraction && Date.now() - this._lastInteraction < 1500) return;
    const state = getGroup(this._groupName);
    if (state.start == null) return;
    const now = Math.floor(Date.now() / 1000);
    const end = state.start + state.range;
    if (now > state.start && now < end) {
      if (!this._autoUpdateLastNow) {
        this._autoUpdateLastNow = now;
        return;
      }
      const inc = now - this._autoUpdateLastNow;
      const w = this.clientWidth || 1;
      if (state.range / w < inc) {
        this._autoUpdateLastNow = now;
        update(this._groupName, { start: state.start + inc }, "set");
      }
    } else {
      this._autoUpdateLastNow = 0;
    }
  }
}

function throttle(fn, ms) {
  let last = 0;
  let queued = null;
  return function (...args) {
    const now = Date.now();
    const elapsed = now - last;
    if (elapsed >= ms) {
      last = now;
      fn(...args);
    } else {
      if (queued) clearTimeout(queued);
      queued = setTimeout(() => { last = Date.now(); queued = null; fn(...args); }, ms - elapsed);
    }
  };
}

customElements.define("rrd-graph", RrdGraph);
export { RrdGraph };
