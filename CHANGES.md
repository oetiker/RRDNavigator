# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### New

### Changed

### Fixed

## 0.1.2 - 2026-05-10
### Changed
- `<rrd-graph-nav>`: use `…` (ellipsis) instead of `▾` (down arrow) for the date/time toggle button. The down-arrow read as "dropdown" but no list drops; the ellipsis reads as "more options," which matches what the button actually does.

### Fixed
- CI: bump `actions/upload-artifact` (v5 → v7), `actions/download-artifact` (v5 → v8), and `softprops/action-gh-release` (v2 → v3) to clear the remaining "Node.js 20 actions are deprecated" warnings on release runs.
- `<rrd-graph-nav>`: the date/time toggle button (`▾`) had no effect when `show-datetime` was left at its default. The CSS rule keyed on the explicit attribute value `show-datetime="advanced"`, but the JS treats absent-attribute as advanced mode — so the selector never matched. Simplified the rule to key on the `_dt-open` attribute alone, which the toggle and the explicit modes already drive correctly.
- `examples/smokeping.html`: switched the URL template from `{{start:smokeping}}` to `{{start:rrd}}` (and likewise `end`). The `smokeping` formatter renders the date in the chart's display timezone, but SmokePing's CGI re-parses it in the *server's* timezone — so when those differ, the request window silently shifts. For Europe/Zurich + a UTC server, the 60m window landed entirely in the future and SmokePing returned an HTML error page instead of an SVG. Epoch (`rrd`) is timezone-agnostic and always correct. The smokeping formatter is still useful for matching-tz deployments and is documented as such.

## 0.1.1 - 2026-05-09
### Changed
- npm releases now publish via [trusted publishing (OIDC)](https://docs.npmjs.com/trusted-publishers) with build provenance attestation — no long-lived `NPM_TOKEN` is held in GitHub.

### Fixed
- Bump dev dependencies (`happy-dom` 14 → 20.9, `esbuild` 0.21 → 0.28, `vitest` 1.6 → 4.1, `eslint` 9 → 10, `vite` pinned to 8) to clear Dependabot advisories. No effect on the published bundle or its consumers.
- CI: drop `version: 9` from `pnpm/action-setup` invocations; the action now reads the pnpm version from `packageManager` in `package.json`, eliminating the version-mismatch error that broke every workflow run.
- CI: run `npm publish` via `npx -y npm@11` rather than self-upgrading the runner's global npm. The in-place `npm install -g npm@latest` corrupts the global install on hosted runners (`MODULE_NOT_FOUND: 'promise-retry'`); npx-spawned npm bypasses the global install entirely while keeping OIDC trusted publishing intact.
- CI: bump GitHub Actions to v6 (`actions/checkout`, `actions/setup-node`, `pnpm/action-setup`) and `actions/upload/download-artifact` to v5; standardize Node version to 22. Clears the deprecation warnings about Node 20-based action runtimes.
- Lint: tighten `eslint.config.js` to recognize the `_` prefix for caught errors, destructured throwaways, and unused vars (not just args), and rename one stray unused param to `_name`. CI annotations are now clean.

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
