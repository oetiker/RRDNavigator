# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### New

### Changed
- npm releases now publish via [trusted publishing (OIDC)](https://docs.npmjs.com/trusted-publishers) with build provenance attestation — no long-lived `NPM_TOKEN` is held in GitHub.

### Fixed
- Bump dev dependencies (`happy-dom` 14 → 20.9, `esbuild` 0.21 → 0.28, `vitest` 1.6 → 4.1, `eslint` 9 → 10, `vite` pinned to 8) to clear Dependabot advisories. No effect on the published bundle or its consumers.

## 0.1.0 - 2026-05-09
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
