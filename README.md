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
