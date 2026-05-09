# RRDNavigator Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build RRDNavigator — a zero-dependency, modern-browser, custom-elements library that turns a server-rendered RRD chart image into an interactive pan/zoom widget, plus a navigation bar with range presets.

**Architecture:** Two custom elements (`<rrd-graph>`, `<rrd-graph-nav>`) sharing a small in-memory pub/sub state container indexed by `group` attribute. Pure JS, ESM, Pointer Events API, `Intl.DateTimeFormat`. Single bundled distribution file.

**Tech Stack:** ES2022, Custom Elements v1, Shadow DOM, Pointer Events, `Intl`, vitest + happy-dom for tests, esbuild for bundling, pnpm for dependency management, GNU/POSIX make for orchestration.

**Spec:** `docs/superpowers/specs/2026-05-09-rrdnavigator-rewrite-design.md`

---

## File Structure

```
RRDNavigator/
├── README.md
├── LICENSE
├── Makefile
├── package.json
├── pnpm-lock.yaml
├── .gitignore
├── eslint.config.js
├── vitest.config.js
├── scripts/
│   └── build.mjs                # esbuild driver
├── src/
│   ├── index.js                 # registers elements + built-in formatters/presets, re-exports public API
│   ├── core/
│   │   ├── state.js             # group pub/sub
│   │   ├── template.js          # URL template engine + formatter registry
│   │   ├── time.js              # Intl-based time math
│   │   └── gestures.js          # pointer/wheel/pinch → semantic events
│   └── elements/
│       ├── rrd-graph.js         # <rrd-graph>
│       └── rrd-graph-nav.js     # <rrd-graph-nav>
├── dist/                        # build output (gitignored except .gitkeep)
├── examples/
│   ├── basic.html
│   ├── dashboard.html
│   └── smokeping.html
└── test/
    ├── template.test.js
    ├── time.test.js
    ├── state.test.js
    ├── gestures.test.js
    ├── rrd-graph.test.js
    └── rrd-graph-nav.test.js
```

**Module responsibilities:**

- `core/template.js` — owns the formatter registry and URL compilation. No knowledge of time, DOM, or state. Built-in formatter `epoch` only; richer formatters are registered from `index.js` once `core/time.js` is loaded.
- `core/time.js` — pure functions over epochs and IANA time zones. No DOM. No global state.
- `core/state.js` — `Map<groupName, {start, range, timezone, listeners}>` plus `getGroup`, `subscribe`, `update`. No DOM. No timers.
- `core/gestures.js` — given a target element, dispatches semantic gesture callbacks (`onPan`, `onZoom`, `onPinch`, `onDoubleTap`). Hides Pointer Events plumbing.
- `elements/rrd-graph.js` — the custom element. Composes core modules. Owns its `<img>`, `<canvas>` overlay, and image-loading state machine.
- `elements/rrd-graph-nav.js` — the custom element. Owns its preset buttons, optional date/time inputs, and the auto-snap logic.
- `index.js` — registers built-in formatters/presets, then registers the elements (which self-register on import). Re-exports `registerFormatter`, `registerPreset`.

---

## Task 1: Project scaffolding (Makefile, pnpm, eslint, vitest, .gitignore)

**Files:**
- Create: `package.json`
- Create: `Makefile`
- Create: `eslint.config.js`
- Create: `vitest.config.js`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `README.md` (stub)
- Create: `dist/.gitkeep`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/*
!dist/.gitkeep
.pnpm-store/
*.log
.DS_Store
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "rrdnavigator",
  "version": "0.1.0",
  "description": "Pure-JS interactive RRD graph navigation as web components.",
  "type": "module",
  "main": "dist/rrdnavigator.js",
  "module": "dist/rrdnavigator.js",
  "exports": {
    ".": "./dist/rrdnavigator.js"
  },
  "files": ["dist/", "README.md", "LICENSE"],
  "license": "MIT",
  "author": "Tobias Oetiker",
  "repository": "github:oetiker/RRDNavigator",
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "build": "node scripts/build.mjs",
    "dev": "node scripts/build.mjs --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src test"
  },
  "devDependencies": {
    "esbuild": "^0.21.0",
    "eslint": "^9.0.0",
    "happy-dom": "^14.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Create `eslint.config.js`**

```js
export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        customElements: "readonly",
        HTMLElement: "readonly",
        CustomEvent: "readonly",
        PointerEvent: "readonly",
        Intl: "readonly",
        Map: "readonly",
        Set: "readonly",
        Math: "readonly",
        Date: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        console: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "prefer-const": "warn"
    }
  }
];
```

- [ ] **Step 4: Create `vitest.config.js`**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["test/**/*.test.js"]
  }
});
```

- [ ] **Step 5: Create `Makefile`**

```makefile
PNPM ?= pnpm
NODE ?= node
VERSION := $(shell $(NODE) -p "require('./package.json').version")

.PHONY: all install build dev test lint check examples package release clean distclean check-pnpm

all: build

check-pnpm:
	@command -v $(PNPM) >/dev/null 2>&1 || { \
		echo "ERROR: pnpm not found in PATH. Install from https://pnpm.io/installation"; \
		exit 1; \
	}

install: check-pnpm
	@if [ -f pnpm-lock.yaml ]; then \
		$(PNPM) install --frozen-lockfile; \
	else \
		$(PNPM) install; \
	fi

build: install
	$(NODE) scripts/build.mjs

dev: install
	$(NODE) scripts/build.mjs --watch

test: install
	$(PNPM) test

lint: install
	$(PNPM) lint

check: lint test

examples: build
	@for f in examples/*.html; do \
		echo "Checking $$f..."; \
		grep -q 'rrdnavigator' "$$f" || { echo "  missing reference"; exit 1; }; \
	done
	@echo "All examples reference the bundle."

package: build
	$(PNPM) pack --pack-destination dist

release: check build package

clean:
	rm -rf dist/*
	@touch dist/.gitkeep

distclean: clean
	rm -rf node_modules .pnpm-store
```

- [ ] **Step 6: Create `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 Tobias Oetiker, OETIKER+PARTNER AG

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 7: Create stub `README.md`**

```markdown
# RRDNavigator

Pure-JS interactive RRD graph navigation as web components.

See `docs/superpowers/specs/2026-05-09-rrdnavigator-rewrite-design.md` for design rationale.

## Quick start

```html
<script type="module" src="dist/rrdnavigator.js"></script>

<rrd-graph
  template="graph.cgi?start={{start}}&end={{end}}&width={{width}}"
  initial-range="24h"
  style="width:800px; aspect-ratio: 800/240;"
></rrd-graph>
```

## Build / test

```
make install
make build
make test
```
```

- [ ] **Step 8: Create empty `dist/.gitkeep`**

```bash
touch dist/.gitkeep
```

- [ ] **Step 9: Install dependencies and verify make works**

```bash
make install
make lint || true   # OK if it complains about empty src
```
Expected: `pnpm install` succeeds; `node_modules/` populated; `pnpm-lock.yaml` written.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat: scaffold pnpm/Makefile/eslint/vitest project"
```

---

## Task 2: `core/template.js` — template engine

**Files:**
- Create: `src/core/template.js`
- Test: `test/template.test.js`

- [ ] **Step 1: Write the failing tests**

`test/template.test.js`:
```js
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
```

- [ ] **Step 2: Run tests; confirm they fail**

```bash
make test
```
Expected: all `template engine` tests fail with "Cannot find module" or similar.

- [ ] **Step 3: Implement `src/core/template.js`**

```js
const builtins = new Map([
  ["epoch", (v) => String(v.epoch)]
]);
const formatters = new Map(builtins);

export function registerFormatter(name, fn) {
  if (typeof fn !== "function") throw new TypeError("formatter must be a function");
  formatters.set(name, fn);
}

export function _resetFormatters() {
  formatters.clear();
  for (const [k, v] of builtins) formatters.set(k, v);
}

const RE = /\{\{\s*([a-zA-Z_][\w-]*)\s*(?::\s*([a-zA-Z_][\w-]*)\s*)?\}\}/g;

export function compile(template) {
  return (ctx) => template.replace(RE, (_, key, fmtName) => {
    const value = ctx[key];
    if (value === undefined || value === null) return "";
    let fmt = fmtName;
    if (!fmt && typeof value === "object" && "epoch" in value) fmt = "epoch";
    if (fmt) {
      const fn = formatters.get(fmt);
      if (!fn) throw new Error(`Unknown formatter: ${fmt}`);
      return fn(value);
    }
    return String(value);
  });
}
```

- [ ] **Step 4: Run tests; confirm pass**

```bash
make test
```
Expected: all template tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/template.js test/template.test.js
git commit -m "feat(template): URL template engine with formatter registry"
```

---

## Task 3: `core/time.js` — Intl-based time math

**Files:**
- Create: `src/core/time.js`
- Test: `test/time.test.js`

- [ ] **Step 1: Write the failing tests**

`test/time.test.js`:
```js
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
```

- [ ] **Step 2: Run tests; confirm they fail**

```bash
make test
```
Expected: time tests fail with module-not-found.

- [ ] **Step 3: Implement `src/core/time.js`**

```js
const PART_KEYS = ["year", "month", "day", "hour", "minute", "second"];

const formatterCache = new Map();
function getFormatter(tz) {
  let f = formatterCache.get(tz);
  if (f) return f;
  f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  formatterCache.set(tz, f);
  return f;
}

export function formatEpoch(epoch, tz) {
  const date = new Date(epoch * 1000);
  const parts = getFormatter(tz).formatToParts(date);
  const map = {};
  for (const { type, value } of parts) {
    if (PART_KEYS.includes(type)) map[type] = parseInt(value, 10);
  }
  // Intl returns hour=24 for midnight in some locales/zones; normalize.
  if (map.hour === 24) map.hour = 0;
  return map;
}

export function epochFromParts({ year, month, day, hour = 0, minute = 0, second = 0 }, tz) {
  // Initial guess: treat parts as UTC
  let utc = Date.UTC(year, month - 1, day, hour, minute, second) / 1000;
  // Find offset by formatting that UTC instant in the TZ and computing difference
  for (let i = 0; i < 3; i++) {
    const p = formatEpoch(utc, tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000;
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second) / 1000;
    const diff = desiredAsUtc - asUtc;
    if (diff === 0) break;
    utc += diff;
  }
  return utc;
}

export function startOf(epoch, unit, tz) {
  const p = formatEpoch(epoch, tz);
  switch (unit) {
    case "minute": return epochFromParts({ ...p, second: 0 }, tz);
    case "hour":   return epochFromParts({ ...p, minute: 0, second: 0 }, tz);
    case "day":    return epochFromParts({ ...p, hour: 0, minute: 0, second: 0 }, tz);
    case "week": {
      // Week starts Monday in ISO; compute weekday via UTC of the day's local-midnight
      const dayStart = epochFromParts({ ...p, hour: 0, minute: 0, second: 0 }, tz);
      const weekday = new Date(dayStart * 1000).getUTCDay(); // 0=Sun..6=Sat
      const back = weekday === 0 ? 6 : weekday - 1;
      return dayStart - back * 86400;
    }
    case "month":  return epochFromParts({ ...p, day: 1, hour: 0, minute: 0, second: 0 }, tz);
    case "year":   return epochFromParts({ ...p, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, tz);
    default: throw new Error(`Unknown unit: ${unit}`);
  }
}

export function endOf(epoch, unit, tz) {
  const start = startOf(epoch, unit, tz);
  switch (unit) {
    case "minute": return start + 59;
    case "hour":   return start + 3599;
    case "day":    return start + 86399;
    case "week":   return start + 7 * 86400 - 1;
    case "month": {
      const p = formatEpoch(start, tz);
      const nextMonth = epochFromParts({ year: p.year + (p.month === 12 ? 1 : 0), month: p.month === 12 ? 1 : p.month + 1, day: 1, hour: 0, minute: 0, second: 0 }, tz);
      return nextMonth - 1;
    }
    case "year": {
      const p = formatEpoch(start, tz);
      const nextYear = epochFromParts({ year: p.year + 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, tz);
      return nextYear - 1;
    }
    default: throw new Error(`Unknown unit: ${unit}`);
  }
}

const pad2 = (n) => String(n).padStart(2, "0");

export function formatSmokeping(epoch, tz) {
  const p = formatEpoch(epoch, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}+${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function formatIsoLocal(epoch, tz) {
  const p = formatEpoch(epoch, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}
```

- [ ] **Step 4: Run tests; confirm pass**

```bash
make test
```
Expected: all time tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/time.js test/time.test.js
git commit -m "feat(time): Intl-based timezone-aware time helpers"
```

---

## Task 4: `core/state.js` — group pub/sub

**Files:**
- Create: `src/core/state.js`
- Test: `test/state.test.js`

- [ ] **Step 1: Write the failing tests**

`test/state.test.js`:
```js
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
```

- [ ] **Step 2: Run tests; confirm they fail**

```bash
make test
```

- [ ] **Step 3: Implement `src/core/state.js`**

```js
const groups = new Map();

function ensure(name) {
  let g = groups.get(name);
  if (!g) {
    g = { listeners: new Set() };
    groups.set(name, g);
  }
  return g;
}

export function getGroup(name) {
  const g = ensure(name);
  // return a snapshot without listeners exposed
  const { listeners: _, ...state } = g;
  return state;
}

export function subscribe(name, fn) {
  const g = ensure(name);
  g.listeners.add(fn);
  return () => {
    g.listeners.delete(fn);
    if (g.listeners.size === 0 && Object.keys(g).length === 1) {
      groups.delete(name);
    }
  };
}

export function update(name, patch, source) {
  const g = ensure(name);
  Object.assign(g, patch);
  const { listeners: _, ...state } = g;
  for (const fn of g.listeners) fn(state, source);
}

export function _reset() {
  groups.clear();
}
```

- [ ] **Step 4: Run tests; confirm pass**

```bash
make test
```

- [ ] **Step 5: Commit**

```bash
git add src/core/state.js test/state.test.js
git commit -m "feat(state): per-group pub/sub container"
```

---

## Task 5: `core/gestures.js` — semantic gesture events

**Files:**
- Create: `src/core/gestures.js`
- Test: `test/gestures.test.js`

`gestures.attach(target, callbacks)` listens for native pointer/wheel events on `target` and calls semantic callbacks. The callbacks signal **deltas** since the gesture started, plus the originating `event` for `preventDefault`. State (single-pointer drag, ctrl+wheel zoom, two-pointer pinch) is owned by this module.

Callbacks: `onPanStart({x, y})`, `onPanMove({dx, dy, x, y})`, `onPanEnd({})`, `onZoom({factor, anchorX})`, `onPinch({factor, anchorX})`, `onDoubleTap()`. Returns a `detach()` function.

- [ ] **Step 1: Write the failing tests**

`test/gestures.test.js`:
```js
import { describe, test, expect, vi } from "vitest";
import { attach } from "../src/core/gestures.js";

function pe(type, init = {}) {
  // happy-dom may not implement PointerEvent constructor with all init members; fall back to MouseEvent
  const Ctor = typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
  return new Ctor(type, { bubbles: true, cancelable: true, ...init });
}

describe("gestures.attach", () => {
  test("emits onPanStart/onPanMove/onPanEnd on horizontal drag", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const onPanStart = vi.fn();
    const onPanMove = vi.fn();
    const onPanEnd = vi.fn();
    const detach = attach(el, { onPanStart, onPanMove, onPanEnd });

    el.dispatchEvent(pe("pointerdown", { clientX: 10, clientY: 20, pointerId: 1, isPrimary: true, pointerType: "mouse" }));
    document.dispatchEvent(pe("pointermove", { clientX: 30, clientY: 22, pointerId: 1, pointerType: "mouse" }));
    document.dispatchEvent(pe("pointerup", { clientX: 30, clientY: 22, pointerId: 1, pointerType: "mouse" }));

    expect(onPanStart).toHaveBeenCalledTimes(1);
    expect(onPanMove).toHaveBeenCalledTimes(1);
    expect(onPanMove).toHaveBeenCalledWith(expect.objectContaining({ dx: 20, dy: 2 }));
    expect(onPanEnd).toHaveBeenCalledTimes(1);

    detach();
    document.body.removeChild(el);
  });

  test("emits onZoom on ctrl+wheel", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const onZoom = vi.fn();
    attach(el, { onZoom });

    el.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true, cancelable: true, clientX: 50, deltaY: -100, ctrlKey: true
    }));

    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0][0].factor).toBeGreaterThan(0);
    expect(onZoom.mock.calls[0][0]).toHaveProperty("anchorX");

    document.body.removeChild(el);
  });

  test("ignores wheel without ctrl", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const onZoom = vi.fn();
    attach(el, { onZoom });
    el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -100 }));
    expect(onZoom).not.toHaveBeenCalled();
    document.body.removeChild(el);
  });

  test("emits onDoubleTap on dblclick", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const onDoubleTap = vi.fn();
    attach(el, { onDoubleTap });
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    document.body.removeChild(el);
  });
});
```

- [ ] **Step 2: Run tests; confirm fail**

```bash
make test
```

- [ ] **Step 3: Implement `src/core/gestures.js`**

```js
export function attach(target, cb) {
  const pointers = new Map(); // pointerId → {x, y, startX, startY}
  let panActive = false;

  function onPointerDown(e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    if (pointers.size === 1) {
      panActive = true;
      cb.onPanStart && cb.onPanStart({ x: e.clientX, y: e.clientY, event: e });
      document.addEventListener("pointermove", onPointerMove, true);
      document.addEventListener("pointerup", onPointerUp, true);
      document.addEventListener("pointercancel", onPointerUp, true);
    }
  }

  function onPointerMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2 && cb.onPinch) {
      const ps = [...pointers.values()];
      const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      const startDist = Math.hypot(ps[0].startX - ps[1].startX, ps[0].startY - ps[1].startY) || 1;
      cb.onPinch({ factor: dist / startDist, anchorX: (ps[0].x + ps[1].x) / 2, event: e });
      return;
    }
    if (panActive && pointers.size === 1) {
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      cb.onPanMove && cb.onPanMove({ dx, dy, x: e.clientX, y: e.clientY, event: e });
    }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0 && panActive) {
      panActive = false;
      cb.onPanEnd && cb.onPanEnd({ event: e });
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
    }
  }

  function onWheel(e) {
    if (!e.ctrlKey) return;
    if (!cb.onZoom) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY / 500);
    const rect = target.getBoundingClientRect();
    cb.onZoom({ factor, anchorX: e.clientX - rect.left, event: e });
  }

  function onDblClick(e) {
    cb.onDoubleTap && cb.onDoubleTap({ event: e });
  }

  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("wheel", onWheel, { passive: false });
  target.addEventListener("dblclick", onDblClick);

  return function detach() {
    target.removeEventListener("pointerdown", onPointerDown);
    target.removeEventListener("wheel", onWheel);
    target.removeEventListener("dblclick", onDblClick);
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", onPointerUp, true);
  };
}
```

- [ ] **Step 4: Run tests; confirm pass**

```bash
make test
```
Expected: all 4 gesture tests pass. If happy-dom lacks `PointerEvent`, the test's `pe()` helper falls back to `MouseEvent`, which still carries `clientX/Y/pointerId/pointerType` for our purposes.

- [ ] **Step 5: Commit**

```bash
git add src/core/gestures.js test/gestures.test.js
git commit -m "feat(gestures): pointer/wheel/pinch → semantic gesture events"
```

---

## Task 6: `<rrd-graph>` — element skeleton, attribute parsing, image rendering

**Files:**
- Create: `src/elements/rrd-graph.js`
- Test: `test/rrd-graph.test.js`

This task builds the element with shadow DOM, attribute observation, template-driven image src updates, and group state subscription. **No interaction yet** — pan/zoom/grid added in Task 7.

- [ ] **Step 1: Write the failing tests**

`test/rrd-graph.test.js`:
```js
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
```

- [ ] **Step 2: Run tests; confirm fail**

```bash
make test
```

- [ ] **Step 3: Implement `src/elements/rrd-graph.js`**

```js
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
  // ISO 8601
  const d = Date.parse(s);
  if (!isNaN(d)) return Math.floor(d / 1000);
  // Plain epoch
  const n = Number(s);
  if (Number.isFinite(n)) return n;
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
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLE);
    root.adoptedStyleSheets = [sheet];
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
    const range = parseDuration(this.getAttribute("initial-range"), 24 * 3600);
    const start = parseStart(this.getAttribute("initial-start"), range);

    this._groupName = this.getAttribute("group") || `_private_${++privateGroupCounter}`;
    this._compiled = compile(this.getAttribute("template") || "");

    const existing = getGroup(this._groupName);
    if (existing.start == null) {
      update(this._groupName, { start, range, timezone: this.getAttribute("timezone") || undefined }, "set");
    }
    this._unsub = subscribe(this._groupName, (state, source) => {
      this._refreshImage();
      if (source === "set" || source === "preset" || source === "datetime" || source === "pan" || source === "zoom") {
        this.dispatchEvent(new CustomEvent("rrd-change", {
          bubbles: true, composed: true,
          detail: { start: state.start, range: state.range, group: this._groupName, source }
        }));
      }
    });

    this._refreshImage();
  }

  disconnectedCallback() {
    if (this._unsub) this._unsub();
    this._unsub = null;
  }

  attributeChangedCallback(name, _old, _val) {
    if (!this.isConnected) return;
    if (name === "template") this._compiled = compile(this.getAttribute("template") || "");
    this._refreshImage();
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
      this._skipped = true;
      return;
    }
    this._loading = true;
    this._img.setAttribute("src", url);
  }
}

customElements.define("rrd-graph", RrdGraph);
export { RrdGraph };
```

- [ ] **Step 4: Run tests; confirm pass**

```bash
make test
```

- [ ] **Step 5: Commit**

```bash
git add src/elements/rrd-graph.js test/rrd-graph.test.js
git commit -m "feat(rrd-graph): element skeleton with template-driven img rendering"
```

---

## Task 7: `<rrd-graph>` — pan, zoom, grid overlay, throttling

**Files:**
- Modify: `src/elements/rrd-graph.js`
- Modify: `test/rrd-graph.test.js`

This task wires up `core/gestures.js`. After it lands: drag pans, drag-y or ctrl+wheel zooms, pinch zooms, dbltap opens the URL, and a grid is painted on `<canvas>` during interaction.

- [ ] **Step 1: Add interaction tests**

Append to `test/rrd-graph.test.js`:
```js
describe("<rrd-graph> interaction", () => {
  beforeEach(() => {
    _reset();
    document.body.innerHTML = "";
  });

  test("horizontal drag pans start", () => {
    const el = mount('<rrd-graph template="x" initial-start="1000" initial-range="60" style="width:600px;height:200px"></rrd-graph>');
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
    canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -200, clientX: 300, clientY: 100 }));
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
```

- [ ] **Step 2: Run tests; confirm new tests fail**

```bash
make test
```
Expected: the three interaction tests fail (no handlers wired yet).

- [ ] **Step 3: Wire gestures in `src/elements/rrd-graph.js`**

Add at the top of the file (after existing imports):
```js
import { attach as attachGestures } from "../core/gestures.js";
```

Replace the `connectedCallback` body, keeping the existing logic plus appending the gesture wiring at the end:

In `connectedCallback`, after the `this._unsub = subscribe(...)` block and before `this._refreshImage()`, add:
```js
this._detachGestures = this._wireGestures();
```

In `disconnectedCallback`, before `this._unsub = null`, add:
```js
if (this._detachGestures) this._detachGestures();
this._detachGestures = null;
```

Add a `_wireGestures` method after `_refreshImage`:
```js
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

  const onPanMove = ({ dx, dy, x }) => {
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
  const ctx = this._canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
}
```

Add a small `throttle` helper at the bottom of the file (above the `customElements.define` call):
```js
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
```

- [ ] **Step 4: Run tests; confirm pass**

```bash
make test
```
Expected: all `<rrd-graph>` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/elements/rrd-graph.js test/rrd-graph.test.js
git commit -m "feat(rrd-graph): pan/zoom/wheel/pinch interaction with grid overlay"
```

---

## Task 8: `<rrd-graph>` — auto-update (follow-now)

**Files:**
- Modify: `src/elements/rrd-graph.js`
- Modify: `test/rrd-graph.test.js`

- [ ] **Step 1: Add the failing test**

Append to `test/rrd-graph.test.js`:
```js
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
```

- [ ] **Step 2: Run tests; confirm new tests fail**

```bash
make test
```

- [ ] **Step 3: Add auto-update to `src/elements/rrd-graph.js`**

In `connectedCallback`, at the end:
```js
if (this.hasAttribute("auto-update")) {
  this._autoUpdateLastNow = 0;
  this._autoUpdateInterval = setInterval(() => this._tickAutoUpdate(), 1000);
}
```

In `disconnectedCallback`, before `this._unsub = null`:
```js
if (this._autoUpdateInterval) clearInterval(this._autoUpdateInterval);
this._autoUpdateInterval = null;
```

Add a `_tickAutoUpdate` method:
```js
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
```

- [ ] **Step 4: Run tests; confirm pass**

```bash
make test
```

- [ ] **Step 5: Commit**

```bash
git add src/elements/rrd-graph.js test/rrd-graph.test.js
git commit -m "feat(rrd-graph): follow-now auto-update interval"
```

---

## Task 9: `<rrd-graph-nav>` — preset buttons + auto-snap

**Files:**
- Create: `src/elements/rrd-graph-nav.js`
- Test: `test/rrd-graph-nav.test.js`

The element renders preset buttons, applies a preset on click, and updates the active button when the group state changes. It uses `core/time.js` for anchored presets (`today`, `this-week`, etc.).

- [ ] **Step 1: Write the failing tests**

`test/rrd-graph-nav.test.js`:
```js
import { describe, test, expect, beforeEach } from "vitest";
import "../src/elements/rrd-graph-nav.js";
import { _reset, getGroup, update, subscribe } from "../src/core/state.js";

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
```

- [ ] **Step 2: Run tests; confirm fail**

```bash
make test
```

- [ ] **Step 3: Implement `src/elements/rrd-graph-nav.js`**

```js
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
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLE);
    root.adoptedStyleSheets = [sheet];
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
    this._renderButtons();
    this._renderDtVisibility();
    const group = this.getAttribute("group");
    if (!group) return;
    const initial = this.getAttribute("initial-preset");
    if (initial) {
      const spec = this._presetMap.get(initial) || initial;
      const r = evalPreset(spec, this._tz());
      if (r) update(group, { start: r.start, range: r.range }, "preset");
    }
    this._unsub = subscribe(group, (state) => this._reflectState(state));
  }

  disconnectedCallback() {
    if (this._unsub) this._unsub();
    this._unsub = null;
  }

  attributeChangedCallback(name) {
    if (!this.isConnected) return;
    if (name === "presets" || name === "initial-preset") this._renderButtons();
    if (name === "show-datetime") this._renderDtVisibility();
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
      // reuse epochFromParts via dynamic import-not-ideal, do small inline
      const utc = Date.UTC(y, m - 1, d, hh, mm, ss) / 1000;
      // single-iteration offset correction
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
```

- [ ] **Step 4: Run tests; confirm pass**

```bash
make test
```
Expected: all 6 nav-bar tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/elements/rrd-graph-nav.js test/rrd-graph-nav.test.js
git commit -m "feat(rrd-graph-nav): preset buttons, auto-snap, datetime inputs"
```

---

## Task 10: `index.js` — register built-in formatters and elements

**Files:**
- Create: `src/index.js`
- Modify: `test/template.test.js` (add a test that built-in formatters are registered)

- [ ] **Step 1: Add a test for built-in formatters**

Append to `test/template.test.js`:
```js
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
```

- [ ] **Step 2: Run tests; confirm fail**

```bash
make test
```

- [ ] **Step 3: Create `src/index.js`**

```js
import { registerFormatter } from "./core/template.js";
import { formatSmokeping, formatIsoLocal } from "./core/time.js";
import "./elements/rrd-graph.js";
import "./elements/rrd-graph-nav.js";

registerFormatter("iso", ({ epoch }) => new Date(epoch * 1000).toISOString().replace(/\.\d+Z$/, "Z"));
registerFormatter("iso-local", ({ epoch, tz }) => formatIsoLocal(epoch, tz || "UTC"));
registerFormatter("smokeping", ({ epoch, tz }) => formatSmokeping(epoch, tz || "UTC"));
registerFormatter("smokeping-now", ({ epoch, isNow, tz }) => isNow ? "now" : formatSmokeping(epoch, tz || "UTC"));
registerFormatter("rrd", ({ epoch, isNow }) => isNow ? "now" : String(epoch));

export { registerFormatter } from "./core/template.js";
export { registerPreset } from "./elements/rrd-graph-nav.js";
```

- [ ] **Step 4: Run tests; confirm pass**

```bash
make test
```

- [ ] **Step 5: Commit**

```bash
git add src/index.js test/template.test.js
git commit -m "feat(index): register built-in formatters and elements"
```

---

## Task 11: `scripts/build.mjs` — esbuild bundler

**Files:**
- Create: `scripts/build.mjs`

- [ ] **Step 1: Create the build script**

`scripts/build.mjs`:
```js
import * as esbuild from "esbuild";
import { mkdirSync, existsSync } from "node:fs";

const watch = process.argv.includes("--watch");
if (!existsSync("dist")) mkdirSync("dist", { recursive: true });

const common = {
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  target: ["chrome110", "firefox110", "safari16", "edge110"],
  sourcemap: true,
  logLevel: "info"
};

async function buildOnce() {
  await esbuild.build({ ...common, outfile: "dist/rrdnavigator.js" });
  await esbuild.build({ ...common, outfile: "dist/rrdnavigator.min.js", minify: true });
  console.log("Built dist/rrdnavigator.js and dist/rrdnavigator.min.js");
}

if (watch) {
  const ctx = await esbuild.context({ ...common, outfile: "dist/rrdnavigator.js" });
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await buildOnce();
}
```

- [ ] **Step 2: Build and inspect output**

```bash
make build
ls -la dist/
```
Expected: `dist/rrdnavigator.js` and `dist/rrdnavigator.min.js` exist.

- [ ] **Step 3: Quick smoke test — bundle imports cleanly**

```bash
node --input-type=module -e "import('./dist/rrdnavigator.js').then(m => console.log(Object.keys(m)))"
```
Expected: prints something like `[ 'registerFormatter', 'registerPreset' ]` (and may log custom-element registration warnings under Node, which is fine).

- [ ] **Step 4: Commit**

```bash
git add scripts/build.mjs
git commit -m "build: esbuild driver for ESM bundle + minified variant"
```

---

## Task 12: Examples

**Files:**
- Create: `examples/basic.html`
- Create: `examples/dashboard.html`
- Create: `examples/smokeping.html`

- [ ] **Step 1: Create `examples/basic.html`**

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>RRDNavigator basic</title>
<style>
  body { font: 14px sans-serif; max-width: 1100px; margin: 2em auto; padding: 0 1em; }
  rrd-graph { width: 100%; aspect-ratio: 1100 / 240; border: 1px solid #ddd; }
</style>
</head><body>
<h1>RRDNavigator — basic</h1>
<rrd-graph
  template="https://example.com/graph.cgi?start={{start}}&end={{end}}&width={{width}}&height={{height}}&zoom={{zoom}}&rand={{random}}"
  initial-range="24h"
  auto-update></rrd-graph>
<script type="module" src="../dist/rrdnavigator.js"></script>
</body></html>
```

- [ ] **Step 2: Create `examples/dashboard.html`**

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>RRDNavigator dashboard</title>
<style>
  body { font: 14px sans-serif; max-width: 1300px; margin: 2em auto; padding: 0 1em; }
  rrd-graph { width: 100%; aspect-ratio: 1300 / 240; border: 1px solid #ddd; }
  rrd-graph-nav { margin: 1em 0; }
</style>
</head><body>
<h1>Synced dashboard</h1>
<rrd-graph-nav group="dash1" presets="60m,24h,7d,30d,today,this-week" initial-preset="24h"></rrd-graph-nav>
<rrd-graph group="dash1" template="https://example.com/cpu.cgi?start={{start}}&end={{end}}&width={{width}}"></rrd-graph>
<rrd-graph group="dash1" template="https://example.com/mem.cgi?start={{start}}&end={{end}}&width={{width}}"></rrd-graph>
<script type="module" src="../dist/rrdnavigator.js"></script>
</body></html>
```

- [ ] **Step 3: Create `examples/smokeping.html`**

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>RRDNavigator + SmokePing</title>
<style>
  body { font: 14px sans-serif; max-width: 1300px; margin: 2em auto; padding: 0 1em; }
  rrd-graph { width: 100%; aspect-ratio: 1300 / 240; border: 1px solid #ddd; }
</style>
</head><body>
<h1>SmokePing target</h1>
<rrd-graph-nav group="sp" presets="60m,12h,24h,7d,30d" initial-preset="24h"></rrd-graph-nav>
<rrd-graph
  group="sp"
  timezone="Europe/Zurich"
  template="/smokeping.cgi?displaymode=n&start={{start:smokeping}}&end={{end:smokeping-now}}&target=Local.Localhost&width={{width}}"
  auto-update></rrd-graph>
<script type="module" src="../dist/rrdnavigator.js"></script>
</body></html>
```

- [ ] **Step 4: Verify make examples passes**

```bash
make examples
```
Expected: prints "All examples reference the bundle."

- [ ] **Step 5: Commit**

```bash
git add examples/
git commit -m "docs: add basic, dashboard, and smokeping example pages"
```

---

## Task 13: Polish README and run release pipeline

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the stub `README.md`**

```markdown
# RRDNavigator

Pure-JS interactive RRD graph navigation as web components.

Two custom elements work together: `<rrd-graph>` turns a server-rendered chart
image (PNG, SVG, anything `<img>` accepts) into a pan/zoom widget;
`<rrd-graph-nav>` provides preset range buttons and optional date/time entry.

Zero runtime dependencies. Modern browsers (Chrome/Firefox/Safari/Edge, last
~2 years).

## Quick start

```html
<script type="module" src="dist/rrdnavigator.js"></script>

<rrd-graph
  template="graph.cgi?start={{start}}&end={{end}}&width={{width}}"
  initial-range="24h"
  auto-update
  style="width: 800px; aspect-ratio: 800 / 240;"
></rrd-graph>
```

## Synced dashboard

Charts and nav bars sharing a `group` attribute synchronize automatically.

```html
<rrd-graph-nav group="dash1" presets="60m,24h,7d,today"></rrd-graph-nav>
<rrd-graph group="dash1" template="cpu.cgi?start={{start}}&end={{end}}&width={{width}}"></rrd-graph>
<rrd-graph group="dash1" template="mem.cgi?start={{start}}&end={{end}}&width={{width}}"></rrd-graph>
```

## SmokePing example

```html
<rrd-graph
  timezone="Europe/Zurich"
  template="/smokeping.cgi?displaymode=n&start={{start:smokeping}}&end={{end:smokeping-now}}&target=Local.Localhost&width={{width}}"
></rrd-graph>
```

`{{start:smokeping}}` formats as `2026-05-09+02:18` in the configured TZ;
`{{end:smokeping-now}}` emits the literal `now` when the chart is following
real time, otherwise the same date format.

## Built-in formatters

| Formatter | Output |
|---|---|
| `epoch` (default) | `1714867200` |
| `iso` | `2026-05-09T00:18:00Z` |
| `iso-local` | `2026-05-09T02:18:00` (in `timezone` attr) |
| `smokeping` | `2026-05-09+02:18` (in `timezone`) |
| `smokeping-now` | `now` if at real-time, else `smokeping` format |
| `rrd` | epoch, or `now` if at real-time |

Register your own:

```js
import { registerFormatter } from "./dist/rrdnavigator.js";
registerFormatter("mything", ({ epoch, isNow, tz }) => isNow ? "!" : String(epoch));
```

## Build / test

```
make install
make build
make test
make check        # lint + test
make package      # produces dist/rrdnavigator-<version>.tgz
```

## License

MIT
```

- [ ] **Step 2: Run the release gate**

```bash
make release
```
Expected: lint passes, tests pass, build runs, `dist/rrdnavigator-0.1.0.tgz` is produced.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with quick-start, dashboard, SmokePing, formatters"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| `<rrd-graph>` element + attributes | Task 6, 7, 8 |
| `<rrd-graph-nav>` element + attributes | Task 9 |
| Self-registration | Task 10 |
| Template engine + formatters | Task 2, 10 |
| Pan/zoom/wheel/pinch/dbltap navigation | Task 7 |
| Grid overlay | Task 7 |
| Throttled refresh + single-flight loader | Task 6 (loader), Task 7 (throttle) |
| Auto-shift / follow-now | Task 8 |
| Multi-chart sync via group attribute | Task 4, 6 |
| Time / TZ helpers | Task 3 |
| Preset specs (rolling + anchored) | Task 9 |
| Auto-snap to preset on pan/zoom | Task 9 |
| Date/time advanced inputs | Task 9 |
| Theming via CSS custom properties | Task 6, 7, 9 (inline in shadow stylesheet) |
| Makefile / pnpm / build | Task 1, 11 |
| Examples | Task 12 |
| README | Task 13 |
| MIT license | Task 1 |
| Tests | every task that creates code |

**Placeholder scan:** No "TBD", "TODO", or "fill in details" remain. Every code step contains the verbatim code to write.

**Type/name consistency:**
- `getGroup`, `subscribe`, `update`, `_reset` — same names in all callers.
- `compile`, `registerFormatter`, `_resetFormatters` — same.
- `attach` (gestures) — same.
- `setStartRange`, `_groupName`, `_refreshImage`, `_paintGrid`, `_clearGrid`, `_tickAutoUpdate` — consistent across rrd-graph tasks.
- `evalPreset`, `parsePresetSpec`, `_reflectState`, `_applyDateTime` — consistent in rrd-graph-nav.

**Risks/notes for the executor:**
- The pinch test path in `core/gestures.js` is not exercised in unit tests because happy-dom does not generate two-pointer pointer events naturally. It will be sanity-checked manually in `examples/` on a touch device. Acceptable for v1.
- The auto-update test relies on `Date.now` mocking and synchronous `_tickAutoUpdate`. The interval timer itself is not unit-tested.
- The dblclick popup test stubs `window.open`. happy-dom's default `window.open` is a no-op; the stub is sufficient.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-rrdnavigator-rewrite.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans with batch checkpoints.

Which approach?
