# Treepath

Build a metric tree from your Excel files and forecast what happens to your outcome when something changes.

Upload one or more Excel/CSV files, draw how your numbers connect (exact formulas and drivers learned from
history), then type a change like **"increase Ad Spend 20%"** to see how it reaches Revenue or Profit, with a
likely range and every step of the calculation. **Runs entirely in your browser; your files never leave your device.**

## Five tools

| Step | What you do |
|---|---|
| **1 · Files** | Drop in `.xlsx / .xls / .csv / .tsv / .ods` files. Every file appears as a card on one canvas; draw a line from a column in one file to the matching column in another (e.g. `customer_id` → `ID`). Click a file to see its data and settings. |
| **2 · Tree** | Click metrics to add them as cards. Add **Formula** cards like `[Orders] * [Realized Price]`; their links draw themselves. Drag from a card's top dot to the card it affects, and Treepath learns that effect from your history with linear regression. |
| **3 · Forecast** | Type a change or use the input controls. See baseline → forecast, the change, a P5–P95 range, what drove it, and the full calculation. The affected path lights up green (up) or red (down). |
| **4 · Charts** | Pick a file and what you want to see: **Trend over time** (with a fitted trend line, significance and a forecast with a likely range), **Compare groups**, **Relationship** (scatter with a regression line and a “what if” slider) or **Spread** (histogram, average, middle value, typical range). Every chart explains itself in a sentence or two and can show its numbers as a table. |
| **5 · Machine Learning** | Pick a column to predict, as a category (classification) or a number (regression), tick the columns to learn from (including columns from connected lookup files), and choose **Boosted trees (XGBoost-style)** or **Logistic / Linear regression**. Defaults work out of the box; Quick / Balanced / Thorough presets and custom settings in plain words are there if you want them. You get a plain verdict against guessing, accuracy / precision / recall / AUC or R² / error, what matters most, a right-vs-wrong grid or predicted-vs-real chart, a “try a prediction” form, and a CSV of predictions for every row. Training runs in a background worker. |

## Quick start

```bash
git clone https://github.com/woraphontrangpanich-jpg/treepath.git
cd treepath
npm install
npm run dev
```

Open http://localhost:5173 and click **Try Sample Data**. It loads the sample files, links them and builds a ready-made Net Revenue tree, so you can go straight to **Forecast** and click an example change like *Ad Spend +20%*.

## Features

- **Import:** multiple files and sheets, parsed in a Web Worker. Excel dates, dd/mm vs mm/dd, `1,234`, `฿99`,
  `12%` and `(40)` are all understood. Each column is used as *Date*, *Metric*, *Category / ID* or *Ignore*.
- **Files canvas:** the Files page shows every file as a card with its ID columns and sample values; click a card to open its data.
  Drag from one column to the matching column in another file, or click one and then the other. Names can differ
  (`region_code`, `Region`, `city`) and so can values (`BKK` vs `Bangkok`, translated through a lookup file).
  Every link shows its % match; click it for details, unmatched values, or to remove it. Suggested links appear as
  dashed lines (or connect them all with one click), and **Tidy Up** puts lookup files in the middle with data files around them.
  **Check the connections** shows rows per key for every file and lists anything unmatched.
  In Build, **Learn Effects By** compares files key by key (e.g. region by region) instead of on totals.
- **Tree builder:**
  - Links are **Formula** (exact, red when subtracted), **Learned from history**, or **Note only** (no maths).
  - Formula cards (violet, `ƒ` band, shown with their expression) look clearly different from data cards.
    Every card opens to show its details, or open them all at once with **Show Details**.
  - Select a card to see how every other card moves with it: correlation of changes (r, with p-value) on
    each card and ranked in the side panel.
  - Day / Week / Month views, with live values and sparklines on every card.
  - Checks for loops and typos, Tidy Up layout, undo, multiple trees, and export/import as `.treepath.json`
    (setup only, never your data).
- **Learned effects:** multivariable OLS on period-over-period changes (log / logit scale). Shown in plain
  words, e.g. "+10% Ad Spend → +4.0% Orders 1 day later", with a reliability badge, R², direction accuracy
  on held-out data, and a lag finder.
- **Forecast:**
  - **Statistical evidence** for every learned effect used: coefficient, standard error, t, p-value with
    significance stars, plus the model's F statistic, its p-value and R², and a plain verdict on whether the
    drivers you changed are significant.
  - Formulas are exact; learned effects apply at steady state. An unchanged input always returns the baseline.
  - P5–P95 range from 400 draws of the model coefficients.
  - Per-input contributions that add up exactly to the total, saved scenarios, and a side-by-side comparison.
- **Design:** follows the [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines):
  keyboard and screen-reader labels, reduced-motion support, light/dark themes, and tabs kept in the URL.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm test` | Run the engine tests (Vitest) |
| `npm run build` | Type-check and build static files to `dist/` |
| `npm run samples` | Regenerate the sample workbooks in `public/samples/` |

## Sample data

`public/samples/` holds synthetic but structured data: 18 months × 3 regions of ad spend and vouchers
(`marketing.xlsx`), sales (`sales.xlsx`), rain (`weather.csv`), a region lookup (`regions.csv`) and 2,000 customers with a churn flag (`customers.csv`) for Machine Learning. Orders
really respond to ad spend (1-day lag), voucher coverage and rain, so the regression has a signal to find.

## Deploy

`npm run build` produces static files with relative paths, so `dist/` works on any static host.
`.github/workflows/deploy.yml` runs the tests and publishes to **GitHub Pages** on every push to `main`.
Enable it once under *Settings → Pages → Source: GitHub Actions*.

## Tech

Vite · React · TypeScript · Tailwind CSS · React Flow · ELK.js · SheetJS · Zustand · idb-keyval · Vitest

## License

MIT
