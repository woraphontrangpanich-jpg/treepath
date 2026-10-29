# treepath

Build metric trees from Excel and forecast how a change in one driver ripples through to your outcome.

Treepath is a browser-only app: upload one or more Excel/CSV files, link them by key columns, build a
tree of how your metrics relate (formulas and drivers), and estimate what happens to Revenue or Profit
when an input like Ad Spend changes. Formulas are evaluated exactly; driver links use linear regression
fitted on your history. **No server: your files never leave your browser.**

> Status: Phase 1 of 6 (data import and table linking) is done. See [PLAN.md](PLAN.md) for the roadmap.

## Quick start

```bash
git clone https://github.com/<you>/treepath.git
cd treepath
npm install
npm run dev
```

Open http://localhost:5173 and click **Try sample data**, or drop your own `.xlsx / .xls / .csv / .tsv / .ods` files.

## What works today

- **Multi-file, multi-sheet import:** parsing runs in a Web Worker, so large files don't freeze the page.
- **Automatic column typing:** dates (Excel serials, ISO, dd/mm and mm/dd detected per column), numbers
  (`1,234`, `฿99`, `12%`, `(40)`), text and booleans.
- **Column roles:** *Date* (time axis), *Key* (for linking), *Metric*, *Dimension* (filter), *Ignore*, plus a
  per-metric aggregation (sum / average / min / max / last / count). Sensible defaults: rates, prices and %
  columns are averaged.
- **Table health checks:** missing date column, unreadable values, rows that will be aggregated together.
- **Table links:** suggested by column name or overlapping values, with match rate, unmatched examples
  and cardinality (one-to-one, many-to-one, …).
- **Local persistence** in IndexedDB, and a light/dark theme.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm test` | Run the engine tests (Vitest) |
| `npm run build` | Type-check and build static files to `dist/` |
| `npm run samples` | Regenerate the sample workbooks in `public/samples/` |

## Sample data

`public/samples/` contains synthetic but structured data: daily ad spend and vouchers (`marketing.xlsx`),
sales (`sales.xlsx`), rain (`weather.csv`) and a region lookup (`regions.csv`) for 3 regions across 18 months.
Orders really do respond to lagged ad spend, voucher coverage and rain, so the regression phases have a
signal to recover.

## Deploy

The app builds to static files with a relative base path, so `dist/` works on any static host.
`.github/workflows/deploy.yml` publishes to **GitHub Pages** on every push to `main`. Enable it in the repo
under *Settings → Pages → Source: GitHub Actions*.

## Tech

Vite · React · TypeScript · Tailwind CSS · SheetJS · Zustand · idb-keyval · Vitest

## License

MIT
