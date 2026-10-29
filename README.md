# treepath

Build a metric tree from your Excel files and forecast what happens to your outcome when something changes.

Upload one or more Excel/CSV files, draw how your numbers connect (exact formulas and drivers learned from
history), then type a change like **"increase Ad Spend 20%"** to see how it reaches Revenue or Profit, with a
likely range and every step of the calculation. **Runs entirely in your browser; your files never leave your device.**

## How it works: 3 steps

| Step | What you do |
|---|---|
| **1 · Data** | Drop in `.xlsx / .xls / .csv / .tsv / .ods` files. Dates, IDs and metrics are detected automatically. Link files through a shared ID column (e.g. `region_code`). |
| **2 · Build** | Click metrics to add them as cards. Add **Formula** cards like `[Orders] * [Realized Price]`; their links draw themselves. Drag from a card's top dot to the card it affects, and Treepath learns that effect from your history with linear regression. |
| **3 · Forecast** | Type a change or use the input controls. See baseline → forecast, the change, a P5–P95 range, what drove it, and the full calculation. The affected path lights up green (up) or red (down). |

## Quick start

```bash
git clone https://github.com/woraphontrangpanich-jpg/treepath.git
cd treepath
npm install
npm run dev
```

Open http://localhost:5173 and click **Try Sample Data**, then **Build → Net Revenue sample → Forecast**.

## Features

- **Import:** multiple files and sheets, parsed in a Web Worker. Excel dates, dd/mm vs mm/dd, `1,234`, `฿99`,
  `12%` and `(40)` are all understood. Each column is used as *Date*, *Metric*, *Category / ID* or *Ignore*.
- **Keys across files:** link files by their shared key even when it's named differently in each
  (`region_code`, `Region`, `city`) or uses different values (`BKK` vs `Bangkok`, translated through a lookup file).
  **Check Matched Keys** shows rows per key for every file and lists anything unmatched. In Build, **Match rows by**
  lines files up by date *and* key, so learned effects compare like with like (e.g. region by region).
- **Tree builder:**
  - Three kinds of link: **Formula** (exact, red when subtracted), **Model driver** (learned from history), and
    **Influence** (context only).
  - Formula cards (ochre, `ƒ` band, shown with their expression) look clearly different from data cards.
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
(`marketing.xlsx`), sales (`sales.xlsx`), rain (`weather.csv`) and a region lookup (`regions.csv`). Orders
really respond to ad spend (1-day lag), voucher coverage and rain, so the regression has a signal to find.

## Deploy

`npm run build` produces static files with relative paths, so `dist/` works on any static host.
`.github/workflows/deploy.yml` runs the tests and publishes to **GitHub Pages** on every push to `main`.
Enable it once under *Settings → Pages → Source: GitHub Actions*.

## Tech

Vite · React · TypeScript · Tailwind CSS · React Flow · ELK.js · SheetJS · Zustand · idb-keyval · Vitest

## License

MIT
