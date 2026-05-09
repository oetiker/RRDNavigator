# RRDNavigator — agent notes

Two custom elements (`<rrd-graph>`, `<rrd-graph-nav>`) bundled to a single
ESM file via esbuild. Zero runtime dependencies. Dev workflow is `make
install`, `make check`, `make build`. Examples in `examples/` need a live
RRD/SmokePing backend — there is no static demo.

## Releasing — read this before bumping versions

Releases are driven by the `Build and Release` GitHub Actions workflow
(`.github/workflows/release.yml`). It is the single source of truth for
versioning. **Do not** edit the `version` field in `package.json`, run
`pnpm version`, or create `vX.Y.Z` git tags by hand — the workflow does
all three atomically and will fight any manual changes.

To release: trigger the workflow on `main` with the appropriate
`release_type` (`bugfix` / `feature` / `major`). It bumps the version
based on the latest `vX.Y.Z` git tag, promotes the `[Unreleased]` section
of `CHANGES.md` into a dated version section, tags, builds, attaches
artifacts to a GitHub Release, and publishes `@oetiker/rrdnavigator` to
npm with provenance.

## Changelog discipline (matters more than it looks)

Every code-affecting commit MUST add a one-line entry to `CHANGES.md`
under `## [Unreleased]` in the matching subsection:

- `### New` — user-visible features that didn't exist before.
- `### Changed` — behavior or API changes that aren't bug fixes.
- `### Fixed` — bug fixes.

Internal refactors with no user-visible effect don't need an entry.
The release workflow promotes whatever is in `[Unreleased]` verbatim
into the version's release notes (which become the GitHub Release body
and are shipped inside the npm tarball), so write entries for the
reader of the changelog, not for yourself.

A release with no `[Unreleased]` entries will produce an empty notes
section — that's a smell, not a feature.
