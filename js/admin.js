// ─────────────────────────────────────────────────────────────
//  ADMIN — login, search Untappd, assign to slots, publish.
// ─────────────────────────────────────────────────────────────
(function () {
  const SLOTS = (window.HOPS_CONFIG && window.HOPS_CONFIG.SLOTS) || 4;
  const TOKEN_KEY = "hops_token";
  const $ = (id) => document.getElementById(id);

  let token = localStorage.getItem(TOKEN_KEY) || null;
  let beers = new Array(SLOTS).fill(null); // working copy of the layout
  let pendingTarget = 0;                   // which slot a search result fills

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, kind) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast show " + (kind || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = "toast"), 3200);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---------- view switching ----------
  function showConsole(yes) {
    $("loginPanel").style.display = yes ? "none" : "";
    $("console").style.display = yes ? "" : "none";
    $("logoutBtn").style.display = yes ? "" : "none";
  }

  // ---------- slots ----------
  function renderSlots() {
    const host = $("slots");
    host.innerHTML = "";
    for (let i = 0; i < SLOTS; i++) {
      const b = beers[i];
      const div = document.createElement("div");
      div.className = "slot";
      div.innerHTML = `
        <div class="slot-head">
          <span class="n">Tap ${i + 1}</span>
          ${b ? `<button class="btn btn-sm" data-target="${i}" data-act="clear">Clear</button>` : ""}
        </div>
        ${b ? `
          <div class="filled">
            <img src="${esc(b.logo || "")}" onerror="this.style.visibility='hidden'" alt="" />
            <div>
              <div class="nm">${esc(b.name)}</div>
              <div class="by">${esc(b.brewery || "")} ${b.abv ? "· " + esc(b.abv) : ""}</div>
            </div>
          </div>
          <label class="fld" style="margin:12px 0 0">
            Description ${b._rewriting ? '<span class="spinner"></span> writing a Cheshire take…' : ""}
          </label>
          <textarea class="slot-desc" data-i="${i}" rows="4" ${b._rewriting ? "disabled" : ""}>${esc(b.description || "")}</textarea>
          <div class="slot-actions">
            <button class="btn btn-sm" data-i="${i}" data-act="rewrite" ${b._rewriting ? "disabled" : ""}>↻ Funnier take</button>
            ${b.descriptionOriginal ? `<button class="btn btn-sm" data-i="${i}" data-act="orig">Use Untappd original</button>` : ""}
          </div>` : `<div class="empty-slot">Empty — search above, or “Assign here”.</div>`}
      `;
      host.appendChild(div);
    }
    host.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = +(btn.dataset.target != null ? btn.dataset.target : btn.dataset.i);
        const act = btn.dataset.act;
        if (act === "clear") {
          beers[i] = null;
          renderSlots();
        } else if (act === "rewrite") {
          regenerateDesc(i);
        } else if (act === "orig") {
          if (beers[i]) { beers[i].description = beers[i].descriptionOriginal || beers[i].description; renderSlots(); }
        } else { // assign / replace
          pendingTarget = i;
          $("searchInput").focus();
          toast(`Next pick goes to Tap ${i + 1}`, "ok");
        }
      });
    });
    // Keep edits to the description in sync with the working copy.
    host.querySelectorAll("textarea.slot-desc").forEach((ta) => {
      ta.addEventListener("input", () => {
        const i = +ta.dataset.i;
        if (beers[i]) beers[i].description = ta.value;
      });
    });
  }

  // Ask the Worker (OpenRouter) for a funnier take on a slot's description.
  async function regenerateDesc(i) {
    const b = beers[i];
    if (!b) return;
    const source = b.descriptionOriginal || b.description || "";
    b._rewriting = true;
    renderSlots();
    try {
      const data = await API.rewrite(
        { name: b.name, brewery: b.brewery, style: b.style, abv: b.abv, description: source },
        token
      );
      if (data && data.description) b.description = data.description;
    } catch (e) {
      if (/401|unauth/i.test(e.message)) { logout(); toast("Session expired — log in again.", "err"); return; }
      toast("AI rewrite failed (kept current text): " + e.message, "err");
    } finally {
      b._rewriting = false;
      renderSlots();
    }
  }

  // ---------- search ----------
  async function doSearch() {
    const q = $("searchInput").value.trim();
    if (!q) return;
    const box = $("results");
    box.innerHTML = `<div class="muted"><span class="spinner"></span> Searching Untappd…</div>`;
    try {
      const data = await API.search(q);
      const list = (data && data.results) || [];
      if (!list.length) { box.innerHTML = `<div class="muted">No matches found.</div>`; return; }
      box.innerHTML = "";
      list.forEach((r) => {
        const el = document.createElement("div");
        el.className = "result";
        const nums = Array.from({ length: SLOTS }, (_, n) =>
          `<button class="btn btn-num${beers[n] ? " filled" : ""}" data-tap="${n}" title="${beers[n] ? "Replace Tap " + (n + 1) : "Put in Tap " + (n + 1)}">${n + 1}</button>`
        ).join("");
        el.innerHTML = `
          <img src="${esc(r.logo || "")}" onerror="this.style.visibility='hidden'" alt="" />
          <div>
            <div class="r-name">${esc(r.name)}</div>
            <div class="r-by">${esc(r.brewery || "")}</div>
            <div class="r-style">${esc(r.style || "")}</div>
          </div>
          <div class="use-group"><span class="use-label">Use →</span>${nums}</div>
        `;
        el.querySelectorAll("button.btn-num").forEach((btn) => {
          btn.addEventListener("click", () => pickResult(r, el, +btn.dataset.tap));
        });
        box.appendChild(el);
      });
    } catch (e) {
      box.innerHTML = `<div class="muted">Search failed: ${esc(e.message)}</div>`;
    }
  }

  async function pickResult(r, el, idx) {
    const group = el.querySelector(".use-group");
    const clicked = el.querySelector(`button.btn-num[data-tap="${idx}"]`);
    const buttons = el.querySelectorAll("button.btn-num");
    buttons.forEach((b) => (b.disabled = true));
    const label = clicked.textContent;
    clicked.innerHTML = `<span class="spinner"></span>`;
    try {
      // Scrape full detail for the chosen beer page.
      const data = await API.scrape(r.url);
      const beer = data && data.beer;
      if (!beer || !beer.name) throw new Error("Could not read that beer page");
      // Keep the Untappd text so the landlord can revert at any time.
      beer.descriptionOriginal = beer.description || "";
      beers[idx] = beer;
      renderSlots();
      toast(`Added “${beer.name}” to Tap ${idx + 1}`, "ok");
      // Auto-generate the Cheshire rewrite (non-blocking; keeps original on failure).
      regenerateDesc(idx);
    } catch (e) {
      toast("Couldn't load that beer: " + e.message, "err");
    } finally {
      clicked.textContent = label;
      buttons.forEach((b) => (b.disabled = false));
      // Reflect the newly-filled tap on every result row's number buttons.
      if (beers[idx]) {
        document.querySelectorAll(`.results button.btn-num[data-tap="${idx}"]`)
          .forEach((b) => b.classList.add("filled"));
      }
    }
  }

  // ---------- save ----------
  async function publish() {
    const btn = $("saveBtn");
    btn.disabled = true;
    const old = btn.textContent;
    btn.innerHTML = `<span class="spinner"></span> Publishing…`;
    try {
      await API.saveBeers(beers, token);
      toast("Published! The screen will update within 30s.", "ok");
      $("saveHint").textContent = "Live ✓";
    } catch (e) {
      if (/401|unauth/i.test(e.message)) { logout(); toast("Session expired — log in again.", "err"); }
      else toast("Publish failed: " + e.message, "err");
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  // ---------- auth ----------
  async function login() {
    const u = $("loginUser").value.trim();
    const p = $("loginPass").value;
    if (!u || !p) { toast("Enter username and password", "err"); return; }
    const btn = $("loginBtn");
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Logging in…`;
    try {
      const data = await API.login(u, p);
      token = data.token;
      localStorage.setItem(TOKEN_KEY, token);
      await boot();
    } catch (e) {
      toast("Login failed: " + e.message, "err");
    } finally {
      btn.disabled = false; btn.textContent = "Log in";
    }
  }

  function logout() {
    token = null;
    localStorage.removeItem(TOKEN_KEY);
    showConsole(false);
  }

  // Load the currently-published beers into the working copy.
  async function boot() {
    showConsole(true);
    try {
      const data = await API.getBeers();
      const cur = (data && data.beers) || [];
      beers = new Array(SLOTS).fill(null).map((_, i) => cur[i] || null);
    } catch { /* start blank */ }
    pendingTarget = Math.max(0, beers.findIndex((b) => !b));
    if (pendingTarget < 0) pendingTarget = 0;
    renderSlots();
  }

  // ---------- wire up ----------
  $("loginBtn").addEventListener("click", login);
  $("loginPass").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
  $("logoutBtn").addEventListener("click", logout);
  $("searchBtn").addEventListener("click", doSearch);
  $("searchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
  $("saveBtn").addEventListener("click", publish);

  if (token) boot(); else showConsole(false);
})();
