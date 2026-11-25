const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function bump(obj, key) {
  if (!key) return;
  obj[key] = (obj[key] || 0) + 1;
}

async function track(req, env) {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  let body;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new Response("bad json", { status: 400, headers: corsHeaders });
  }

  const vid = typeof body.vid === "string" ? body.vid.slice(0, 64) : "";
  const path = typeof body.path === "string" ? body.path.slice(0, 300) : "";
  const referrer =
    typeof body.referrer === "string" && body.referrer
      ? body.referrer.slice(0, 500)
      : "(direct)";

  if (!vid || !path) {
    return new Response("missing vid/path", { status: 400, headers: corsHeaders });
  }

  // Lokasi dari request Cloudflare — IP tidak disimpan.
  const country = (req.cf?.country || "").slice(0, 64);
  const city = (req.cf?.city || "").slice(0, 128);

  const day = new Date().toISOString().slice(0, 10);
  const dayKey = "day:" + day;

  const [dayRaw, allRaw, visRaw] = await Promise.all([
    env.STATS.get(dayKey),
    env.STATS.get("alltime"),
    env.STATS.get("visitors"),
  ]);
  const d = dayRaw
    ? JSON.parse(dayRaw)
    : { pageviews: 0, uniques: 0, referrers: {}, paths: {}, countries: {}, cities: {} };
  const a = allRaw
    ? JSON.parse(allRaw)
    : { pageviews: 0, referrers: {}, paths: {}, countries: {}, cities: {} };
  const v = visRaw ? JSON.parse(visRaw) : {};

  const isNew = !v[vid];
  if (isNew) v[vid] = day;

  d.pageviews = (d.pageviews || 0) + 1;
  a.pageviews = (a.pageviews || 0) + 1;
  if (isNew) d.uniques = (d.uniques || 0) + 1;

  bump(d.referrers, referrer);
  bump(a.referrers, referrer);
  bump(d.paths, path);
  bump(a.paths, path);
  if (country) {
    bump(d.countries, country);
    bump(a.countries, country);
  }
  if (city) {
    bump(d.cities, city);
    bump(a.cities, city);
  }

  await Promise.all([
    env.STATS.put(dayKey, JSON.stringify(d)),
    env.STATS.put("alltime", JSON.stringify(a)),
    env.STATS.put("visitors", JSON.stringify(v)),
  ]);

  return new Response(null, { status: 204, headers: corsHeaders });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function topTable(title, obj, limit = 10) {
  const rows = Object.entries(obj || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, n]) => `<tr><td>${esc(k)}</td><td class="n">${n}</td></tr>`)
    .join("");
  return `<h2>${esc(title)}</h2>${
    rows ? `<table><tbody>${rows}</tbody></table>` : "<p class='muted'>Belum ada data.</p>"
  }`;
}

function dayTable(days) {
  const rows = days
    .map(
      (d) =>
        `<tr><td>${esc(d.day)}</td><td class="n">${d.data ? d.data.pageviews : 0}</td><td class="n">${d.data ? d.data.uniques : 0}</td></tr>`
    )
    .join("");
  return `<h2>7 hari terakhir</h2><table><thead><tr><th>Tanggal</th><th>Pageview</th><th>Pengunjung unik</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function stats(req, env) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const expected = env.STATS_TOKEN;

  if (!expected) {
    return new Response("STATS_TOKEN belum di-set sebagai secret worker.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (!token || token !== expected) {
    return new Response("Token salah.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const raw = await env.STATS.get("day:" + d);
    days.push({ day: d, data: raw ? JSON.parse(raw) : null });
  }
  const [allRaw, visRaw] = await Promise.all([
    env.STATS.get("alltime"),
    env.STATS.get("visitors"),
  ]);
  const allTime = allRaw ? JSON.parse(allRaw) : null;
  const visitors = visRaw ? JSON.parse(visRaw) : null;

  const todayData = days.find((d) => d.day === today)?.data;
  const uniqueCount = visitors ? Object.keys(visitors).length : 0;
  const a = allTime || { pageviews: 0, referrers: {}, paths: {}, countries: {}, cities: {} };

  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Statistik — cek_pseudocode</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:840px;margin:2rem auto;padding:0 1rem;color:#222}
  h1{font-size:1.4rem} h2{font-size:1.05rem;margin-top:1.8rem}
  table{border-collapse:collapse;width:100%;font-size:.92rem}
  th,td{border:1px solid #ddd;padding:.4rem .6rem;text-align:left}
  th{background:#f5f5f5} td.n{text-align:right;font-variant-numeric:tabular-nums}
  .cards{display:flex;gap:1rem;flex-wrap:wrap;margin-top:1rem}
  .card{border:1px solid #ddd;border-radius:8px;padding:.8rem 1.2rem;min-width:140px}
  .card b{display:block;font-size:1.5rem}
  .muted{color:#888;font-size:.9rem}
</style>
</head>
<body>
<h1>Statistik pengunjung — cek_pseudocode</h1>
<div class="cards">
  <div class="card"><span class="muted">Total pageview</span><b>${a.pageviews}</b></div>
  <div class="card"><span class="muted">Total pengunjung unik</span><b>${uniqueCount}</b></div>
  <div class="card"><span class="muted">Pageview hari ini</span><b>${todayData ? todayData.pageviews : 0}</b></div>
  <div class="card"><span class="muted">Unik hari ini</span><b>${todayData ? todayData.uniques : 0}</b></div>
</div>
${dayTable(days)}
${topTable("Referrer (semua waktu)", a.referrers)}
${topTable("Negara (semua waktu)", a.countries)}
${topTable("Kota (semua waktu)", a.cities)}
${topTable("Halaman (semua waktu)", a.paths)}
<p class="muted">Data tanpa IP. Pengunjung unik memakai UUID anonim di browser. Diperbarui setiap kunjungan.</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (url.pathname === "/track") return track(req, env);
    if (url.pathname === "/stats") return stats(req, env);
    return new Response("not found", { status: 404 });
  },
};
