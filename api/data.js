// /api/data.js
// Vercel serverless function. Runs on the server, so your API keys
// (set as Environment Variables in Vercel) are never sent to the browser.
//
// Required env vars:
//   FRED_API_KEY         https://fred.stlouisfed.org/docs/api/api_key.html
//   TWELVE_DATA_API_KEY  https://twelvedata.com/
//
// Responses are cached on Vercel's CDN for CACHE_SECONDS, so every visitor
// shares one upstream fetch. 15 minutes keeps Twelve Data's free tier
// (800 credits/day, 1 credit per symbol) under its limit: 96 fetches x 8 symbols = 768/day.

const CACHE_SECONDS = 900;

// Treasury par yields across the curve (daily, end of day)
const CURVE_SERIES = [
  "DGS1MO", "DGS3MO", "DGS6MO", "DGS1", "DGS2", "DGS3",
  "DGS5", "DGS7", "DGS10", "DGS20", "DGS30",
];
// Other FRED series
const OTHER_SERIES = [
  "DFF",     // effective fed funds rate (daily)
  "T10Y2Y",  // 10Y minus 2Y spread, percentage points (daily)
  "VIXCLS",  // VIX close (daily)
  "UNRATE",  // unemployment rate (monthly)
];
// Twelve Data symbols. The free tier has no raw index tickers (^GSPC etc.),
// so liquid ETFs stand in for the indices and commodities.
const TD_SYMBOLS = ["SPY", "QQQ", "DIA", "IWM", "GLD", "USO", "BTC/USD", "EUR/USD"];

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

async function fetchFred(seriesId, key, limit = 10) {
  const url =
    `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}` +
    `&api_key=${key}&file_type=json&sort_order=desc&limit=${limit}`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    // FRED uses "." for days with no value (holidays), so skip those
    const obs = (j.observations || []).filter((o) => o.value !== ".");
    return {
      value: obs[0] ? num(obs[0].value) : null,
      prev: obs[1] ? num(obs[1].value) : null,
      date: obs[0] ? obs[0].date : null,
      obs, // used for CPI year-over-year below, removed before sending
    };
  } catch (e) {
    return { value: null, prev: null, date: null, error: `${seriesId}: ${e.message}` };
  }
}

async function fetchTwelveData(key) {
  const url =
    `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(TD_SYMBOLS.join(","))}` +
    `&apikey=${key}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.status === "error") throw new Error(j.message || "Twelve Data error");
  const quotes = {};
  for (const sym of TD_SYMBOLS) {
    const q = j[sym];
    if (!q || q.status === "error") {
      quotes[sym] = { error: (q && q.message) || "no data" };
      continue;
    }
    quotes[sym] = {
      name: q.name || sym,
      price: num(q.close),
      change: num(q.change),
      pct: num(q.percent_change),
      prevClose: num(q.previous_close),
      time: q.datetime || null,
      marketOpen: q.is_market_open === true,
    };
  }
  return quotes;
}

module.exports = async (req, res) => {
  const FRED_KEY = process.env.FRED_API_KEY;
  const TD_KEY = process.env.TWELVE_DATA_API_KEY;

  if (!FRED_KEY || !TD_KEY) {
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({
      error:
        "API keys are missing. Add FRED_API_KEY and TWELVE_DATA_API_KEY under Settings > Environment Variables in Vercel, then redeploy.",
    });
    return;
  }

  const errors = [];
  const allSeries = [...CURVE_SERIES, ...OTHER_SERIES];

  const [fredResults, cpi, quotes] = await Promise.all([
    Promise.all(allSeries.map((id) => fetchFred(id, FRED_KEY))),
    fetchFred("CPIAUCSL", FRED_KEY, 14), // need 13 months for year-over-year
    fetchTwelveData(TD_KEY).catch((e) => {
      errors.push(`Twelve Data: ${e.message}`);
      return {};
    }),
  ]);

  const fred = {};
  allSeries.forEach((id, i) => {
    const { obs, ...rest } = fredResults[i];
    if (rest.error) errors.push(rest.error);
    fred[id] = rest;
  });

  // CPI year-over-year % = latest index / index 12 months earlier - 1
  if (cpi.obs && cpi.obs.length >= 13) {
    const latest = num(cpi.obs[0].value);
    const yearAgo = num(cpi.obs[12].value);
    fred.CPI_YOY = {
      value: latest && yearAgo ? +((latest / yearAgo - 1) * 100).toFixed(2) : null,
      date: cpi.obs[0].date,
    };
  } else {
    fred.CPI_YOY = { value: null, date: null };
    if (cpi.error) errors.push(cpi.error);
  }

  const fullyFailed = Object.keys(quotes).length === 0 && fredResults.every((r) => r.value === null);
  // Cache good responses for CACHE_SECONDS; retry failures after a minute
  res.setHeader(
    "Cache-Control",
    errors.length
      ? "s-maxage=60, stale-while-revalidate=60"
      : `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`
  );
  res.status(fullyFailed ? 502 : 200).json({
    updated: new Date().toISOString(),
    cacheSeconds: CACHE_SECONDS,
    curve: CURVE_SERIES,
    fred,
    quotes,
    errors,
  });
};
