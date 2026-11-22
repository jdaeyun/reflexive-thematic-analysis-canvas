// Reflexive Thematic Analysis Canvas — release information (the ONE place to edit at each release).
// Push the change to main: .github/workflows/sync-version.yml copies it into CITATION.cff, README.md and the site
// (tools/sync-version.mjs; locally `npm run sync-version`), then publishes the GitHub release vX.Y.Z with the offline ZIP.
// A version with a hyphen (e.g. 1.0.0-beta.1) becomes a pre-release. Nothing happens if that release already exists.
window.TA_CANVAS = {
  version: '0.9.1',
  released: '2026-11-22'
};
