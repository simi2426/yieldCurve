# Market Launchpad

A Bloomberg-style market dashboard with a live US Treasury yield curve, equities,
rates, FX, commodities, crypto, and macro data. Your API keys stay on the server
in a Vercel serverless function and are never exposed to the browser.

## What's in the folder

- `index.html`: the dashboard. It asks `/api/data` for fresh numbers every minute.
- `api/data.js`: the serverless function that fetches from FRED and Twelve Data.
- `package.json`: tells Vercel to use Node 18 or newer.

## 1. Get two free API keys

- **FRED** (Treasury yields, fed funds, VIX, unemployment, CPI):
  https://fred.stlouisfed.org/docs/api/api_key.html. Create an account, then request a key. It's issued instantly.
- **Twelve Data** (ETFs, FX, crypto): https://twelvedata.com/. Sign up, then copy the key from your dashboard.

## 2. Deploy on Vercel (all in the browser, nothing to install)

1. Unzip `market-launchpad.zip`.
2. On GitHub, create a new repository, then use **Add file → Upload files** and drag in
   the *contents* of the folder (`index.html`, `package.json`, `README.md`, and the `api` folder).
3. Sign up at https://vercel.com with your GitHub account.
4. Click **Add New → Project**, import the repository, and click **Deploy**.
   Vercel serves `index.html` as the page and `api/data.js` as the function automatically.
5. In the project, open **Settings → Environment Variables** and add:
   - `FRED_API_KEY` = your FRED key
   - `TWELVE_DATA_API_KEY` = your Twelve Data key
6. Open **Deployments**, click **⋯** on the latest one, and choose **Redeploy**.
   (New environment variables only take effect after a redeploy.)
7. Open the URL Vercel gives you, for example `market-launchpad.vercel.app`.

### Alternative: Vercel CLI

```bash
npm install -g vercel
cd market-launchpad
vercel login
vercel                          # first deploy, follow the prompts
vercel env add FRED_API_KEY
vercel env add TWELVE_DATA_API_KEY
vercel --prod                   # deploy again so the keys take effect
```

To run it on your own computer, run `vercel dev` and open http://localhost:3000.
Opening `index.html` directly from your file system won't load data, because the page needs the function.

## How fresh is the data?

- **Treasury yields, fed funds, VIX** come from FRED and update once per business day,
  after the close. The curve won't move during the day. That's how the data is published, not a bug.
- **ETFs, FX, crypto** come from Twelve Data. The server caches them for 15 minutes,
  which keeps you inside the free tier's 800 credits a day (8 symbols × 96 refreshes = 768).
  Every visitor shares the same cached response, so more viewers don't use more credits.
- To refresh more often, lower `CACHE_SECONDS` in `api/data.js`. A paid Twelve Data plan
  is needed for anything under about 15 minutes with 8 symbols.

## Customizing

- **Different stocks or pairs:** edit `TD_SYMBOLS` in `api/data.js`, then the `EQUITIES`
  and `FX` lists in `index.html` (each entry is `[symbol, label]`).
- **More FRED series:** add IDs to `OTHER_SERIES` in `api/data.js` (find IDs at
  https://fred.stlouisfed.org), then show them in `renderRates` or `renderMacro` in `index.html`.
- The free Twelve Data tier has no raw index tickers like ^GSPC, so SPY, QQQ, DIA and IWM
  stand in for the S&P 500, Nasdaq 100, Dow and Russell 2000; GLD and USO stand in for gold and oil.

## Troubleshooting

- **"API keys are missing"**: add both environment variables, then redeploy (step 6).
- **"Partial data" with a credits or rate-limit message**: the daily Twelve Data allowance
  is used up. It resets daily; the yield curve keeps working meanwhile.
- **A row says "unavailable"**: that symbol isn't on your Twelve Data plan. Swap it for another.

Not investment advice.
