# RRDNavigator

Pure-JS interactive RRD graph navigation as web components.

Two custom elements work together: `<rrd-graph>` turns a server-rendered chart
image (PNG, SVG, anything `<img>` accepts) into a pan/zoom widget;
`<rrd-graph-nav>` provides preset range buttons and optional date/time entry.

Zero runtime dependencies. Modern browsers (Chrome/Firefox/Safari/Edge, last
~2 years).

## Install

```sh
pnpm add @oetiker/rrdnavigator
# or
npm install @oetiker/rrdnavigator
```

Or use it straight from a CDN with no build step:

```html
<script type="module"
  src="https://cdn.jsdelivr.net/npm/@oetiker/rrdnavigator/dist/rrdnavigator.min.js"></script>
```

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
