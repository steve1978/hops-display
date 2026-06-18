// ─────────────────────────────────────────────────────────────
//  API — thin client around the Cloudflare Worker.
// ─────────────────────────────────────────────────────────────
const API = (() => {
  const base = () => (window.HOPS_CONFIG && window.HOPS_CONFIG.API_BASE || "").replace(/\/$/, "");

  async function req(path, opts = {}) {
    const res = await fetch(base() + path, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = (data && data.error) || res.statusText || ("HTTP " + res.status);
      throw new Error(msg);
    }
    return data;
  }

  return {
    // Public: the 4 beers currently on the display.
    getBeers() {
      return req("/api/beers");
    },

    // Admin: search Untappd for a beer name -> list of candidates.
    search(query) {
      return req("/api/search?q=" + encodeURIComponent(query));
    },

    // Admin: scrape full detail for one chosen beer page.
    scrape(url) {
      return req("/api/beer?url=" + encodeURIComponent(url));
    },

    // Admin: log in -> returns a token to use for saving.
    login(username, password) {
      return req("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    },

    // Admin: save the 4-beer layout (token required).
    saveBeers(beers, token) {
      return req("/api/beers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
        },
        body: JSON.stringify({ beers }),
      });
    },
  };
})();
