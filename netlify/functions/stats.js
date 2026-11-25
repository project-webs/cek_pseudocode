import { getStore } from "@netlify/blobs";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
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

export default async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const expected = process.env.STATS_TOKEN;

  if (!expected) {
    return new Response("STATS_TOKEN belum di-set di environment Netlify.", {
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

  const store = getStore("stats");
  const today = new Date().toISOString().slice(0, 10);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ day: d, data: await store.get("day:" + d, { type: "json" }) });
  }
  const [allTime, visitors] = await Promise.all([
    store.get("alltime", { type: "json" }),
    store.get("visitors", { type: "json" }),
  ]);

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
  .ref{word-break:break-all}
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
};
