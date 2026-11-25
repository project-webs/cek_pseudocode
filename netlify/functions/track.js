import { getStore } from "@netlify/blobs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function bump(obj, key) {
  if (!key) return;
  obj[key] = (obj[key] || 0) + 1;
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
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

  // Lokasi dari header Netlify — IP tidak disimpan.
  const country = (req.headers.get("x-country-code") || "").slice(0, 64);
  const city = (req.headers.get("x-city") || "").slice(0, 128);

  const store = getStore("stats");
  const day = new Date().toISOString().slice(0, 10);
  const dayKey = "day:" + day;

  const [dayData, allTime, visitors] = await Promise.all([
    store.get(dayKey, { type: "json" }),
    store.get("alltime", { type: "json" }),
    store.get("visitors", { type: "json" }),
  ]);

  const d = dayData || { pageviews: 0, uniques: 0, referrers: {}, paths: {}, countries: {}, cities: {} };
  const a = allTime || { pageviews: 0, referrers: {}, paths: {}, countries: {}, cities: {} };
  const v = visitors || {};

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
    store.setJSON(dayKey, d),
    store.setJSON("alltime", a),
    store.setJSON("visitors", v),
  ]);

  return new Response(null, { status: 204, headers: corsHeaders });
};
