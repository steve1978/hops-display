// ─────────────────────────────────────────────────────────────
//  CONFIG — edit this one line after you deploy your Worker.
//  Paste the URL Cloudflare gives you (no trailing slash).
//  e.g. https://hops-display.YOUR-NAME.workers.dev
// ─────────────────────────────────────────────────────────────
window.HOPS_CONFIG = {
  API_BASE: "https://hops-display.rapport-galosh-0p.workers.dev",

  // How often the pub TV re-checks for new beers (milliseconds).
  REFRESH_MS: 30000,

  // Number of taps on screen (2x2 grid = 4).
  SLOTS: 4,

  // TV safe-area: how much of the screen the layout fills (1 = edge to edge).
  // Many TVs "overscan" and crop the outer edges in fullscreen. Lower this if
  // the edges (or the QR) get cut off; raise it toward 1 for a smaller border.
  SAFE_AREA: 0.88,
};
