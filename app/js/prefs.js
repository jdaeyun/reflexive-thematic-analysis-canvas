// Reflexive Thematic Analysis Canvas — per-browser preferences (localStorage)
// MIT License · https://github.com/jdaeyun/reflexive-thematic-analysis-canvas
// Loaded right after version.js, because i18n.js already reads the language setting at load time.
// Always go through lsGet / lsSet / lsRemove, never `localStorage` directly: in a private window, with site data
// blocked, or on some file:// set-ups even reading localStorage throws, and the app must still start.
// Only display preferences live here (tab, language, column width …). Project data belongs in IndexedDB.
function lsGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (e) { /* storage blocked */ }
}
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* storage blocked */ }
}
