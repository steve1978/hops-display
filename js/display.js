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

  function priceRow(label, val) {
    if (!val) return "";
    const v = /[£$€]/.test(val) ? val : "£" + val;
    return `<div class="price"><span class="pl">${esc(label)}</span><span class="pv">${esc(v)}</span></div>`;
  }
  function pricesBlock(b) {
    const p = b.prices || {};
    const rows = priceRow("1/2", p.half) + priceRow("2/3", p.twothirds) + priceRow("Pint", p.pint);
    return rows ? `<div class="prices">${rows}</div>` : "";
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
        <div class="tapleft">
          ${logo}
          ${pricesBlock(b)}
        </div>
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
    fitDescriptions();
  }

  // Shrink each description's font until it fits its card — long landlord
  // lines never overflow, short ones stay nice and big.
  function fitDescriptions() {
    grid.querySelectorAll(".tap .desc").forEach((el) => {
      el.style.fontSize = "";                 // reset to the CSS base
      let size = parseFloat(getComputedStyle(el).fontSize) || 21;
      let guard = 0;
      while (el.scrollHeight > el.clientHeight + 1 && size > 12 && guard++ < 30) {
        size -= 1;
        el.style.fontSize = size + "px";
      }
    });
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
      logo: "", prices: { half: "2.60", twothirds: "3.40", pint: "5.10" },
      description: "A hazy little number that drinks well above its weight.\nPillowy soft, juicy as a Tuesday fruit bowl.\nCitra and Mosaic doing the heavy lifting, no bitterness.\nProper session sup — get one in." },
    { brewery: "Cloudwater", name: "DIPA v21", style: "IPA - Imperial / Double NE", abv: "8% ABV", rating: "4.3",
      logo: "", prices: { half: "3.40", twothirds: "4.50", pint: "6.80" },
      description: "Don't be fooled, this one's a sneaky 8%.\nMango and pineapple by the bucketload.\nSmooth as you like, soft as a settee.\nTwo of these and you're calling a taxi." },
    { brewery: "Verdant", name: "Headband", style: "Pale Ale - American", abv: "5.5% ABV", rating: "4.1",
      logo: "", prices: { half: "2.80", twothirds: "3.70", pint: "5.60" },
      description: "The flagship pale that keeps the regulars happy.\nOrange sherbet and a bit of pine cheek.\nClean finish, no messing about.\nDangerously easy going, this." },
    { brewery: "Wild Beer Co", name: "Pogo", style: "Sour - Fruited", abv: "3.6% ABV", rating: "3.8",
      logo: "", prices: { half: "2.50", twothirds: "3.30", pint: "4.90" },
      description: "Zingy, tart and bright as a button.\nPassion fruit and guava having a party.\nLow ABV so you can stop here a while.\nSunshine in a glass, even when it's chucking it down." },
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

  // Web fonts change text metrics — refit once they've loaded.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitDescriptions);
  }
})();
