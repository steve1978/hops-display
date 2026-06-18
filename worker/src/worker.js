// ─────────────────────────────────────────────────────────────
//  HOPS DISPLAY — Cloudflare Worker (backend)
//
//  Routes:
//    GET  /api/beers          -> public: current 4-beer layout
//    POST /api/beers          -> auth:   save layout  { beers: [...] }
//    GET  /api/search?q=...    -> search Untappd, returns candidates
//    GET  /api/beer?url=...    -> scrape one beer page, returns detail
//    POST /api/login          -> { username, password } -> { token }
//
//  Env (set via `wrangler secret put` / dashboard):
//    ADMIN_USER     - admin username
//    ADMIN_PASS     - admin password
//    SESSION_SECRET - random string used to derive the session token
//  Bindings:
//    BEERS          - KV namespace (stores the published layout)
//    ALLOW_ORIGIN   - (var) your GitHub Pages origin, or "*" for any
// ─────────────────────────────────────────────────────────────

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      if (url.pathname === "/api/beers" && request.method === "GET")
        return json(await getBeers(env), 200, cors);

      if (url.pathname === "/api/beers" && request.method === "POST")
        return await saveBeers(request, env, cors);

      if (url.pathname === "/api/search" && request.method === "GET")
        return json({ results: await searchUntappd(url.searchParams.get("q") || "") }, 200, cors);

      if (url.pathname === "/api/beer" && request.method === "GET")
        return json({ beer: await scrapeBeer(url.searchParams.get("url") || "") }, 200, cors);

      if (url.pathname === "/api/login" && request.method === "POST")
        return await login(request, env, cors);

      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      return json({ error: err.message || "Server error" }, 500, cors);
    }
  },
};

// ───────────── helpers ─────────────
function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": (env && env.ALLOW_ORIGIN) || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...(cors || {}) },
  });
}
function decode(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'").replace(/&nbsp;/g, " ").trim();
}
// Fetch a page and decode it as UTF-8 explicitly — Untappd's responses can
// otherwise be mis-decoded as Latin-1, turning ’ into “â€™”.
async function fetchHtml(targetUrl) {
  const res = await fetch(targetUrl, {
    headers: { "User-Agent": UA, "Accept-Language": "en" },
  });
  if (!res.ok) throw new Error("Untappd returned " + res.status);
  const buf = await res.arrayBuffer();
  return new TextDecoder("utf-8").decode(buf);
}
function abs(href) {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  return "https://untappd.com" + (href.startsWith("/") ? href : "/" + href);
}
function firstMatch(re, html) {
  const m = re.exec(html);
  return m ? m[1] : "";
}
// Untappd embeds clean schema.org Product data as JSON-LD — the most stable
// source for the full description, image and rating.
function extractJsonLd(html) {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1].trim());
      const arr = Array.isArray(data) ? data : [data];
      for (const d of arr) {
        if (d && (d["@type"] === "Product" || d.description)) return d;
      }
    } catch (_) { /* keep looking */ }
  }
  return null;
}

// ───────────── auth ─────────────
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function makeToken(env) {
  return sha256(`${env.ADMIN_USER}:${env.ADMIN_PASS}:${env.SESSION_SECRET || "hops"}`);
}
async function login(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  if (
    body.username === env.ADMIN_USER &&
    body.password === env.ADMIN_PASS &&
    env.ADMIN_USER && env.ADMIN_PASS
  ) {
    return json({ token: await makeToken(env) }, 200, cors);
  }
  return json({ error: "Invalid username or password" }, 401, cors);
}
async function requireAuth(request, env) {
  const hdr = request.headers.get("Authorization") || "";
  const token = hdr.replace(/^Bearer\s+/i, "");
  const expected = await makeToken(env);
  return token && token === expected;
}

// ───────────── storage ─────────────
async function getBeers(env) {
  if (!env.BEERS) return { beers: [] };
  const raw = await env.BEERS.get("current");
  return { beers: raw ? JSON.parse(raw) : [] };
}
async function saveBeers(request, env, cors) {
  if (!(await requireAuth(request, env)))
    return json({ error: "Unauthorized" }, 401, cors);
  const body = await request.json().catch(() => ({}));
  const beers = Array.isArray(body.beers) ? body.beers.slice(0, 8) : [];
  if (!env.BEERS) return json({ error: "Storage not configured" }, 500, cors);
  await env.BEERS.put("current", JSON.stringify(beers));
  return json({ ok: true, beers }, 200, cors);
}

// ───────────── Untappd: search ─────────────
async function searchUntappd(query) {
  if (!query.trim()) return [];
  const html = await fetchHtml("https://untappd.com/search?q=" + encodeURIComponent(query));

  const results = [];
  // Each result lives in a <div class="beer-item "> block (note: the class
  // has a trailing space, and the toplist sidebar uses class="item" — which
  // we deliberately skip so popular-beer noise doesn't leak into results).
  const chunks = html.split('class="beer-item').slice(1);
  for (const chunk of chunks) {
    const href = firstMatch(/href="(\/b\/[^"]+)"/, chunk);
    if (!href) continue;
    const name = decode(firstMatch(/<p class="name"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/, chunk))
      || decode(firstMatch(/<p class="name"[^>]*>([^<]+)<\/p>/, chunk));
    const brewery = decode(firstMatch(/<p class="brewery"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/, chunk))
      || decode(firstMatch(/<p class="brewery"[^>]*>([^<]+)<\/p>/, chunk));
    const style = decode(firstMatch(/<p class="style"[^>]*>([^<]+)<\/p>/, chunk));
    let logo = firstMatch(/<a[^>]*class="label"[^>]*>\s*<img[^>]*src="([^"]+)"/, chunk)
      || firstMatch(/<img[^>]*src="([^"]+_(?:s|m|l)\.[a-z]+[^"]*)"/, chunk);
    results.push({ url: abs(href), name, brewery, style, logo });
    if (results.length >= 10) break;
  }
  return results;
}

// ───────────── Untappd: scrape one beer ─────────────
async function scrapeBeer(beerUrl) {
  if (!/^https?:\/\/untappd\.com\/b\//.test(beerUrl))
    throw new Error("Not a valid Untappd beer URL");

  const html = await fetchHtml(beerUrl);

  const ld = extractJsonLd(html) || {};
  // og: tags exist but Untappd pads them with multiple spaces before content=.
  const og = (p) =>
    decode(firstMatch(new RegExp(`<meta property="og:${p}"\\s+content="([^"]*)"`, "i"), html));

  const name =
    decode(firstMatch(/<div class="name">\s*<h1[^>]*>([^<]+)<\/h1>/, html)) || og("title");

  const brewery =
    decode(firstMatch(/<p class="brewery">\s*<a[^>]*>([^<]+)<\/a>/, html));

  const style = decode(firstMatch(/<p class="style">([^<]+)<\/p>/, html));

  let abv = decode(firstMatch(/<p class="abv">([^<]+)<\/p>/, html));
  abv = abv ? abv.replace(/\s+/g, " ").trim() : "";

  let ibu = decode(firstMatch(/<p class="ibu">([^<]+)<\/p>/, html));
  ibu = ibu && !/n\/?a/i.test(ibu) ? ibu.replace(/\s+/g, " ").trim() : "";

  let rating = (ld.aggregateRating && ld.aggregateRating.ratingValue)
    || decode(firstMatch(/data-rating="([\d.]+)"/, html))
    || decode(firstMatch(/<span class="num">\(?([\d.]+)\)?<\/span>/, html));
  if (rating) rating = (Math.round(parseFloat(rating) * 100) / 100).toFixed(2);

  // Full description: the clean text lives in the JSON-LD Product data.
  // Fall back to the (shorter, boilerplate) og:description if absent.
  let description = decode(ld.description || "");
  if (!description) description = og("description");
  if (description) {
    description = description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      .replace(/\s*Show Less\s*$/i, "").trim();
  }

  // Prefer the square beer label; the JSON-LD image / og:image are fallbacks.
  const ldImg = Array.isArray(ld.image) ? ld.image[0] : ld.image;
  const logo =
    firstMatch(/<a[^>]*class="label"[^>]*>\s*<img[^>]*src="([^"]+)"/, html)
    || ldImg || og("image");

  if (!name) throw new Error("Could not parse beer details (page layout may have changed)");

  return { url: beerUrl, name, brewery, style, abv, ibu, rating, description, logo };
}
