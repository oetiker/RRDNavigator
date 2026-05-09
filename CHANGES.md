# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### New
- `<rrd-graph>` custom element: server-rendered chart image becomes a
  pan/zoom widget with pointer, wheel, and pinch gestures.
- `<rrd-graph-nav>` custom element: preset range buttons, optional
  date/time inputs, group sync.
- URL template engine with named placeholders (`{{start}}`, `{{end}}`,
  `{{width}}`) and a registerable formatter system.
- Built-in formatters: `epoch`, `iso`, `iso-local`, `smokeping`,
  `smokeping-now`, `rrd`.
- Intl-based timezone-aware time helpers (`startOf`, `endOf`, DST-safe).
- Per-group pub/sub state container so charts and nav bars sharing a
  `group` attribute synchronize automatically.
- Follow-now auto-update interval for live charts.
- esbuild driver producing both `dist/rrdnavigator.js` (debuggable ESM)
  and `dist/rrdnavigator.min.js` (minified).

### Changed

### Fixed
