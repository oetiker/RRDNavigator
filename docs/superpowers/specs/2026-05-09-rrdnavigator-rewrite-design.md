# RRDNavigator — Pure-JS Rewrite of RrdGraphJS

**Date:** 2026-05-09
**Status:** Design (pending user approval)
**Predecessor:** [RrdGraphJS](https://github.com/oetiker/RrdGraphJS) (qooxdoo-Website-based, 2015)

## Goals

1. Zero runtime dependencies. Pure modern JS, ESM, custom elements v1, Pointer
   Events API, `Intl.DateTimeFormat`. No qooxdoo, no moment, no moment-timezone,
   no d3.
2. Format-agnostic backend — server can return PNG, SVG, or anything else an
   `<img>` element can display. The original library was named `rrdGraphPng`;
   the new code drops "PNG" from naming.
3. Drop-in for HTML pages. Just `<script type="module" src="rrdnavigator.js">`
   plus custom-element markup. No init code on the host page is required.
4. Preserve the navigation feel of the original: drag-to-pan, drag-y-to-zoom,
   ctrl+wheel zoom, pinch zoom, grid overlay during interaction, auto-shift
   when "now" is in view.
5. Templated URLs with pluggable formatters so backends like SmokePing
   integrate trivially.

## Non-Goals

- In-browser rendering of RRD data (the broken `rrdGraphSvg.js` from the old
  repo). Server-side rendering of any image format is sufficient.
- Backwards compatibility with the qxWeb-based JS API of RrdGraphJS. Template
  string keys (`{{start}}`, `{{end}}`, `{{width}}`, `{{height}}`, `{{zoom}}`,
  `{{random}}`) are kept compatible; everything else is new.
- Support for Internet Explorer or other legacy browsers. Modern evergreen
  only.

## Browser Targets

Chrome, Firefox, Safari, Edge — last ~2 years. We rely on:

- Custom elements v1 + Shadow DOM
- ES modules in the browser (`<script type="module">`)
- Pointer Events API (`pointerdown`, `pointermove`, `pointerup`, plus pinch via
  multiple active pointers)
- `Intl.DateTimeFormat` with `timeZone` option and `formatToParts`
- `adoptedStyleSheets` / `CSSStyleSheet` constructor
- Native `<input type="date">` and `<input type="time">`

No build step is required for users. (A build step is used internally to roll
the source up into a single distribution file; it is not exposed.)

## Public Surface — Custom Elements

Two elements register themselves on import:

| Element | Purpose |
|---|---|
| `<rrd-graph>` | The interactive image. Wraps an internal `<img>` and a `<canvas>` for the grid overlay. Pan/zoom navigation, throttled URL refresh, group sync. |
| `<rrd-graph-nav>` | Range-preset buttons (primary), optional date/time inputs (secondary), bound to a chart group. Default layout is a horizontal flex bar designed to sit above or below wide graphs. |

### `<rrd-graph>`

```html
<rrd-graph
  template="smokeping.cgi?start={{start:smokeping}}&end={{end:smokeping-now}}&target=Local.Localhost&width={{width}}"
  group="dash1"
  initial-start="now-24h"
  initial-range="24h"
  timezone="Europe/Zurich"
  canvas-padding="100"
  move-zoom="2"
  auto-update
  style="width:1300px; aspect-ratio: 1300 / 240;"
></rrd-graph>
```

**Attributes** (all reactive via `attributeChangedCallback`):

| Attribute | Type | Default | Purpose |
|---|---|---|---|
| `template` | string | required | URL template (mustache-like, see Template Engine). |
| `group` | string | private auto-generated | Multi-chart sync key. Charts and nav bars sharing a `group` share state. |
| `initial-start` | duration / epoch / iso | `now - initial-range` | Start of initial visible range. Accepts `1234567890`, `2026-05-09T00:00:00Z`, `now`, `now-24h`, `now-7d`. If omitted, defaults to one `initial-range` before `now` (so the chart shows up-to-now by default). |
| `initial-range` | duration | `24h` | Initial visible range length. Accepts `60m`, `24h`, `7d`, `4w`, `12M`, `1y`, or raw seconds. |
| `timezone` | IANA TZ name | browser local | Used for date/time math. |
| `canvas-padding` | int | `100` | Pixels at left+right edges of the image not part of the chart canvas, so x-axis math snaps to the actual plot area. |
| `move-zoom` | number | `1` | Value substituted into `{{zoom}}` while interacting (lets backend render a faster low-res image during drag). |
| `auto-update` | boolean | on | When "now" is in the visible range, periodically shift to keep up with real time. |

**JS properties:** `start`, `range`, `template`, `timezone`. Mirror attributes
where it makes sense. Setting `start` / `range` properties does **not** reflect
back to attributes (avoids feedback loops with framework two-way binding).

**Methods:** `setStartRange(start, range)`, `update()`.

**Events** (CustomEvent, `bubbles: true, composed: true`):

| Event | `detail` | When |
|---|---|---|
| `rrd-change` | `{start, range, group, source: 'pan'\|'zoom'\|'set'\|'preset'}` | After a user-initiated or programmatic change settles. |
| `rrd-load` | `{url}` | A new image successfully loaded. |
| `rrd-error` | `{url, error}` | Image failed to load. |

### `<rrd-graph-nav>`

```html
<rrd-graph-nav
  group="dash1"
  presets="60m,24h,7d,30d,1y,today,this-week,this-month,this-year"
  initial-preset="24h"
  show-datetime="advanced"
  timezone="Europe/Zurich"
></rrd-graph-nav>
```

**Attributes:**

| Attribute | Type | Default | Purpose |
|---|---|---|---|
| `group` | string | required | Which chart group to control. |
| `presets` | string | sensible default | Comma-separated preset specs. Two flavors: rolling (`60m`, `24h`, `7d`, `1y`) and anchored (`today`, `this-week`, `this-month`, `this-year`, `yesterday`). Custom labels: `presets="Hour=60m,Day=24h,Week=7d,Today=today"`. |
| `initial-preset` | string | first preset | Which preset to apply on attach. |
| `show-datetime` | `none` \| `always` \| `advanced` | `advanced` | Date+time inputs visibility. `advanced` puts them behind a small toggle. |
| `match-precision` | number | `0.05` | Snap-to-preset tolerance when user pans/zooms. |
| `timezone` | IANA TZ | browser local | Should match charts in the group. |

**Slot:** Default slot for arbitrary extra controls in the nav bar (e.g. a
custom refresh button).

**Programmatic preset registration:**
```js
import { registerPreset } from './rrdnavigator.js';
registerPreset('last-shift', { label: '8h shift', kind: 'rolling', seconds: 8*3600 });
```

### Self-registration

Importing the script registers both elements globally. No init call needed.

```html
<script type="module" src="rrdnavigator.js"></script>
```

## Template Engine

**Syntax:** `{{key}}` or `{{key:formatter}}`. Anything else passes through. No
conditionals, no loops — keeps it tiny.

**Built-in keys:**

| Key | Value passed to formatter |
|---|---|
| `start` | `{ epoch, isNow: false, tz }` |
| `end` | `{ epoch, isNow: boolean, tz }` (`isNow` true when end coincides with current real time within ~1s) |
| `width` | integer (CSS pixel width of the element) |
| `height` | integer |
| `zoom` | `move-zoom` during interaction, otherwise `1` |
| `random` | base36 random number, fresh per fetch |

**Built-in formatters:**

| Formatter | Output | Used for |
|---|---|---|
| `epoch` (default for `start`/`end`) | `1714867200` | Generic backends |
| `iso` | `2026-05-09T00:00:00Z` | ISO 8601 backends |
| `iso-local` | `2026-05-09T02:00:00` (no Z, in `tz`) | TZ-naive backends |
| `smokeping` | `2026-05-09+02:18` (in `tz`) | SmokePing |
| `smokeping-now` | `now` if `isNow`, else same as `smokeping` | SmokePing end time |
| `rrd` | `epoch` if not now, `now` if now | RRDtool AT-style |

**User-registered formatters:**
```js
import { registerFormatter } from './rrdnavigator.js';
registerFormatter('mything', ({ epoch, isNow, tz }) => isNow ? '!' : String(epoch));
```

**SmokePing example, complete:**
```
smokeping.cgi?displaymode=n&start={{start:smokeping}}&end={{end:smokeping-now}}&target=Local.Localhost&width={{width}}
```
Yields, while panning:
```
smokeping.cgi?displaymode=n&start=2026-05-09+02:18&end=now&target=Local.Localhost&width=1300
```

URL-encoding of formatter output is the user's responsibility inside the
template; output is inserted verbatim. The original library behaved the same way.

**Implementation:** `template.compile(tplString)` returns a function
`(ctx) => url`. Compiled once per chart, reused on every fetch. Single regex
split, ~30 lines.

## Navigation Logic (Preserved)

The behavior carried over from the original `rrdGraphPng.js`, translated from
qxWeb to native APIs:

**Pointer interactions (Pointer Events API):**

| Gesture | Effect |
|---|---|
| Drag horizontally | Pan: shift `start` while keeping `range`. |
| Drag vertically (mouse only — touch is reserved for page scroll) | Zoom: change `range` around the pointer's x-position. Lock to whichever axis dominates after a 10px deadband. |
| `ctrl + wheel` | Zoom around pointer x-position. Plain wheel passes through to page scroll. |
| Pinch (two-pointer touch) | Zoom around the pinch midpoint. |
| Double-tap / dblclick | Open current image URL in a popup window. |

**Grid overlay during interaction:** A `<canvas>` sibling to the `<img>` is
painted with the alternating-bar grid (`--rrd-grid-a` / `--rrd-grid-b`)
reflecting how far the chart has moved/zoomed since the interaction started.
Cleared after a debounce (~1s) when the gesture ends. Algorithm lifted from
the original `__paintGridReal` and `__clearGrid`.

**Image refresh throttling:** During interaction, image URL updates throttled
to ~120ms (leading-edge), so the server is not hammered. After the interaction
settles (~200ms debounce), one final fetch is issued with `zoom=1`.

**Image loader semantics:** Single-flight loading. While one image is in
flight, mark a "skipped" flag; on load, if skipped, fire one more update.
Errors do not auto-retry.

**Auto-shift ("follow now"):** When `auto-update` is on AND "now" is currently
inside the visible range, a 1-second `setInterval` advances `start` by elapsed
seconds, but only if the per-pixel time is smaller than the elapsed time
(avoids visual stalls). Disabled while interacting.

**Range cap:** `range` clamped to `[10s, 20 years]`.

**Cursors:** Native CSS only. `cursor: grab` on the canvas overlay, `cursor:
grabbing` while dragging. The original library shipped `.cur` files as a 2015
workaround for inconsistent cursor support; that is no longer needed.

## Multi-Chart Sync

A tiny per-group state container handles synchronization without anyone owning
the data.

```js
// core/state.js
const groups = new Map();  // group name → { start, range, timezone, listeners: Set }

export function getGroup(name) { /* lazily create */ }
export function subscribe(name, fn)   { /* returns unsubscribe */ }
export function update(name, patch, source) { /* mutates + notifies */ }
```

**`<rrd-graph>`:**
- `connectedCallback`: read attributes, subscribe to its group (or a private
  one if no `group` attribute). Initialize the group from `initial-start` /
  `initial-range` if first chart in group.
- On user pan/zoom: call `update(group, {start, range}, 'pan'|'zoom')`.
- `disconnectedCallback`: unsubscribe. Group is garbage-collected when last
  subscriber leaves.

**`<rrd-graph-nav>`:**
- Subscribes to its group on connect.
- Preset button click → `update(group, {start, range}, 'preset')`.
- Date/time input change → `update(group, {start: ...}, 'datetime')`.
- Incoming updates → reflect into date/time inputs and select the matching
  preset (using `match-precision`).

**Standalone graph:** A `<rrd-graph>` without `group` gets a private
auto-generated group. Behavior identical, just isolated.

**No DOM events for sync.** The state container is the single source of truth.
DOM events (`rrd-change`, etc.) are output-only, for the host page to listen
to.

## Time, Presets, Time Zone

`core/time.js` wraps three primitives, all using `Intl.DateTimeFormat`:

| Function | Behavior |
|---|---|
| `formatEpoch(epoch, tz)` | Returns `{year, month, day, hour, minute, second}` for an epoch in a TZ. |
| `epochFromParts({year, month, day, hour, minute, second}, tz)` | The inverse. Uses the standard `Intl`-based offset trick. |
| `endOf(epoch, unit, tz)` / `startOf(epoch, unit, tz)` | unit ∈ `minute` \| `hour` \| `day` \| `week` \| `month` \| `year`. |

These are 60–80 lines total. No moment, no Luxon.

**Range preset specs** (in the `presets` attribute):

| Spec | Meaning |
|---|---|
| `60m`, `12h`, `7d`, `4w`, `1M`, `1y` | Rolling: `start = now - N`, `end = now` |
| `today`, `yesterday`, `this-week`, `this-month`, `this-year` | Anchored to TZ-aware calendar boundary |
| `Label=spec` | Custom button label |

**Default `presets`:** `60m,24h,7d,30d,today,this-week,this-month,this-year`.
Buttons render in declaration order; the first one is the `initial-preset`
unless overridden.

**Auto-snap on pan/zoom:** When the active preset is rolling, panning/zooming
switches to a "Custom" pseudo-preset. When the resulting range matches a
defined preset within `match-precision`, snap the selection back. Same logic
as the original `__addRangePicker`'s `onChangeStartRange`.

**Date/time inputs (when `show-datetime="advanced"` or `"always"`):**
- `<input type="date">` for the start date in the chart's timezone.
- `<input type="time" step="1">` for time.
- A small "Apply" button (or `change`/`blur`) commits — sets `start`, leaves
  `range` alone.
- In `advanced` mode the inputs are hidden behind a small toggle button so
  they do not take prime real estate.

## Styling, Theming, Layout

- **Cursors:** native CSS — `grab`, `grabbing`. Drop `.cur` files entirely.
- **Styling:** Both elements use Shadow DOM with sensible defaults. Custom
  properties for theming:
  - `--rrd-grid-a` (default `rgba(0,0,0,0.08)`)
  - `--rrd-grid-b` (default `rgba(255,255,255,0.08)`)
  - `--rrd-button-bg`, `--rrd-button-active-bg`, `--rrd-button-fg`
  - `--rrd-font-size`
- **Layout defaults:**
  - `<rrd-graph>` is `display: inline-block`; the host page sizes it via CSS
    width/height.
  - `<rrd-graph-nav>` is `display: flex; align-items: center; gap: 0.5em;
    flex-wrap: wrap` so it lays out cleanly above or below a wide graph.
- **No external CSS file.** CSS is bundled in JS as inline template strings,
  attached to the shadow root via `adoptedStyleSheets`.

## File Layout

```
RRDNavigator/
├── README.md
├── LICENSE                       # MIT
├── Makefile                      # canonical build/test/package entry points
├── package.json                  # dev tooling only: vitest, eslint, esbuild; no runtime deps
├── src/
│   ├── index.js                  # entry; imports both elements; re-exports registerFormatter, registerPreset
│   ├── core/
│   │   ├── state.js
│   │   ├── template.js
│   │   ├── time.js
│   │   └── gestures.js
│   └── elements/
│       ├── rrd-graph.js
│       └── rrd-graph-nav.js
├── dist/
│   ├── rrdnavigator.js           # rolled-up ESM (single file, what users include)
│   └── rrdnavigator.min.js       # minified
├── examples/
│   ├── basic.html                # one chart, no nav bar
│   ├── dashboard.html            # several charts in a group + nav bar
│   └── smokeping.html            # SmokePing-style template
└── test/
    ├── template.test.js
    ├── time.test.js
    ├── state.test.js
    └── gestures.test.js          # synthetic PointerEvent dispatch
```

Build is driven by `esbuild` (invoked from a tiny `scripts/build.mjs`) that
bundles `src/index.js` → `dist/rrdnavigator.js` and a minified
`dist/rrdnavigator.min.js`. Dev cycle and CI both go through the Makefile.

## Makefile

The Makefile is the canonical entry point for build, test, and packaging. The
underlying `pnpm`/`node` invocations are an implementation detail; contributors
and CI both call `make`. The package manager is **pnpm** — `package.json` sets
`"packageManager": "pnpm@<version>"` and a `pnpm-lock.yaml` is committed; `npm`
and `yarn` are not supported.

| Target | Purpose |
|---|---|
| `make` / `make all` | Default. Equivalent to `make build`. |
| `make install` | Install dev dependencies via `pnpm install --frozen-lockfile` (or `pnpm install` if no lockfile yet). Idempotent. |
| `make build` | Bundle `src/index.js` → `dist/rrdnavigator.js` + minified `dist/rrdnavigator.min.js`. Depends on `install`. |
| `make dev` | Watch `src/` and rebuild on change. Useful while editing. |
| `make test` | Run the full test suite (vitest). Depends on `install`. |
| `make lint` | Run ESLint over `src/` and `test/`. |
| `make check` | Run `lint` and `test` together. What CI invokes on PRs. |
| `make examples` | Sanity-build every HTML in `examples/` against the freshly built `dist/rrdnavigator.js` (verifies the file resolves; visual checking is manual). |
| `make package` | Produce `dist/rrdnavigator-<version>.tgz` via `pnpm pack`. Contains `dist/`, `README.md`, `LICENSE`, and `package.json`. Version is read from `package.json`. |
| `make release` | Run `check`, then `build`, then `package`. The pre-publish gate. |
| `make clean` | Remove `dist/`. Leaves `node_modules/` alone. |
| `make distclean` | `clean` plus remove `node_modules/` and `pnpm-store` (if local). |

A bootstrap helper at the top of the Makefile checks that `pnpm` is on `$PATH`
and emits a clear error pointing at <https://pnpm.io/installation> if it is not.

Phony targets are declared with `.PHONY:` so the Makefile works even on systems
where `make` is BSD make (macOS) rather than GNU make. The Makefile uses only
POSIX-compatible shell features.

## Testing Strategy

- **Unit tests** (vitest, jsdom): `core/template`, `core/time`, `core/state` —
  pure logic, easy.
- **Component tests** (vitest with happy-dom or playwright headless): mount
  `<rrd-graph>`, dispatch synthetic PointerEvents, assert state updates and
  emitted events. Same for `<rrd-graph-nav>` preset buttons.
- **Visual sanity:** the `examples/` HTMLs double as manual smoke tests against
  a running SmokePing or rrdcgi backend.
- **No tests against a real RRDtool server in CI.** Those are manual.

## Migration / Compatibility

- The original `RrdGraphJS` repo is **not** modified. New code lives in
  `RRDNavigator`. Existing users keep using the old library until they
  migrate.
- The new library is intentionally **not API-compatible** at the JS level (web
  component instead of qxWeb plugin). Migration guide in README documents the
  mapping.
- Template syntax is broadly compatible: same `{{start}}`, `{{end}}`,
  `{{width}}`, `{{height}}`, `{{zoom}}`, `{{random}}` keys; new `:formatter`
  syntax is additive. Existing templates that only use these keys keep working.
- Cursor `.cur` files are dropped — visual change only; behavior preserved via
  CSS.

## Decisions Recorded

- **License:** MIT. (RrdGraphJS was GPL-2; the new code is a clean rewrite, so
  switching to MIT for wider adoption is fine.)
- **Package manager:** pnpm. `package.json` declares `packageManager` field;
  `pnpm-lock.yaml` is committed; CI and Makefile both use pnpm.
- **Distribution:** ESM only. All targeted browsers natively support
  `<script type="module">`. UMD/IIFE is not shipped in v1; can be added later
  if a concrete need surfaces.

## Out of Scope

- In-browser RRD rendering (the broken `rrdGraphSvg.js`). Server-side image
  rendering is sufficient for the use cases this library targets.
- Annotation/marker overlays on charts. Future work.
- Server-side adapters or proxies. Backend integration is purely template-based.
