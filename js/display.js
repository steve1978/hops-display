// ─────────────────────────────────────────────────────────────
//  DISPLAY — renders the 2x2 tap grid and auto-refreshes.
// ─────────────────────────────────────────────────────────────
(function () {
  const grid = document.getElementById("grid");
  const footer = document.getElementById("footer");
  const SLOTS = (window.HOPS_CONFIG && window.HOPS_CONFIG.SLOTS) || 4;

  // Swap a broken logo <img> for the beer-glass placeholder.
  window.hopsLogoFail = function (img) {
    const d = document.createElement("div");
    d.className = "logo placeholder";
    d.textContent = "🍺";
    img.replaceWith(d);
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function emptyTap(i) {
    return `
      <div class="tap empty">
        <div class="ph">
          <div class="big">${i + 1}</div>
          <div>Tap available</div>
        </div>
      </div>`;
  }

  function tapCard(b, i) {
    const logo = b.logo
      ? `<img class="logo" src="${esc(b.logo)}" alt="${esc(b.name)}" onerror="hopsLogoFail(this)" />`
      : `<div class="logo placeholder">🍺</div>`;

    const chips = [];
    if (b.abv)    chips.push(`<span class="chip abv">${esc(b.abv)}</span>`);
    if (b.style)  chips.push(`<span class="chip">${esc(b.style)}</span>`);
    if (b.rating) chips.push(`<span class="chip rating">★ ${esc(b.rating)}</span>`);

    return `
      <div class="tap">
        <div class="tap-num">${i + 1}</div>
        ${logo}
        <div class="info">
          ${b.brewery ? `<div class="brewery">${esc(b.brewery)}</div>` : ""}
          <div class="name">${esc(b.name || "Untitled")}</div>
          <div class="meta">${chips.join("")}</div>
          ${b.description ? `<div class="desc">${esc(b.description)}</div>` : ""}
        </div>
      </div>`;
  }

  function render(beers) {
    const cards = [];
    for (let i = 0; i < SLOTS; i++) {
      const b = beers && beers[i];
      cards.push(b && b.name ? tapCard(b, i) : emptyTap(i));
    }
    grid.innerHTML = cards.join("");
  }

  function stamp(ok) {
    const t = new Date();
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    footer.textContent = ok
      ? `Updated ${hh}:${mm}`
      : "Offline — showing last known taps";
  }

  // Until you set a real Worker URL in js/config.js, show sample taps
  // so you can preview the look. Auto-switches to live data once configured.
  function isPlaceholderBackend() {
    const base = (window.HOPS_CONFIG && window.HOPS_CONFIG.API_BASE) || "";
    return !base || /example\.workers\.dev/.test(base);
  }
  const DEMO = [
    { brewery: "Weetwood Ales", name: "Turncoat", style: "IPA - New England / Hazy", abv: "4% ABV", rating: "3.7",
      logo: "",
      description: "Turncoat NEIPA is our take on a low-bitterness and high-flavour New England IPA at an agreeable ABV. Brewed with wheat and oats for pillowy soft mouthfeel and double dry-hopped with Citra, Mosaic and El Dorado for a juicy, tropical flavour." },
    { brewery: "Cloudwater", name: "DIPA v21", style: "IPA - Imperial / Double NE", abv: "8% ABV", rating: "4.3",
      logo: "", description: "Soft, hazy and intensely tropical double IPA, double dry-hopped for waves of mango, pineapple and citrus over a smooth, full body." },
    { brewery: "Verdant", name: "Headband", style: "Pale Ale - American", abv: "5.5% ABV", rating: "4.1",
      logo: "", description: "Our flagship pale. Citra and Simcoe deliver orange sherbet and pine, finishing soft and clean. Endlessly drinkable." },
    { brewery: "Wild Beer Co", name: "Pogo", style: "Sour - Fruited", abv: "3.6% ABV", rating: "3.8",
      logo: "", description: "A zingy, refreshing sour with passion fruit, guava and orange. Tart, bright and built for the sunshine." },
  ];

  async function load() {
    if (isPlaceholderBackend()) {
      render(DEMO);
      footer.textContent = "DEMO MODE — set your Worker URL in js/config.js to go live";
      return;
    }
    try {
      const data = await API.getBeers();
      const beers = (data && data.beers) || [];
      render(beers);
      stamp(true);
    } catch (e) {
      stamp(false);
      if (!grid.children.length) render([]); // first load failed -> show empties
      console.warn("display load failed:", e.message);
    }
  }

  // Scale the fixed 1920×1080 stage to fit the window (letterboxed).
  function fitStage() {
    const stage = document.querySelector(".stage");
    if (!stage) return;
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = "scale(" + s + ")";
  }
  window.addEventListener("resize", fitStage);
  fitStage();

  render([]);            // immediate empty grid so screen isn't blank
  load();
  setInterval(load, (window.HOPS_CONFIG && window.HOPS_CONFIG.REFRESH_MS) || 30000);
})();
