# treepath

Build metric trees from Excel and forecast how a change in one driver ripples through to your outcome.

Treepath is a browser-only app: upload one or more Excel/CSV files, link them by key columns, build a
tree of how your metrics relate (formulas and drivers), and estimate what happens to Revenue or Profit
when an input like Ad Spend changes. Formulas are evaluated exactly; driver links use linear regression
fitted on your history. **No server: your files never leave your browser.**

> Status: data import, table links, the tree builder, regression (Analyze) and Scenario forecasting are done; Text Build and final polish remain. See [PLAN.md](PLAN.md).

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
- **Tree builder (Build tab):**
  - Drag metrics from the library onto a canvas, or add **Formula** and **Note** cards.
  - Formulas use `[Card Name]` references, `+ − × ÷ ^`, and `min / max / abs / ln / exp / sqrt / round`, with a
    restricted parser (never `eval`). Formula and cost-deduction links are drawn automatically from the formula.
  - Hand-drawn links: **Model driver** (to be fitted by regression, with lag and expected direction),
    **Influence**, **Leading indicator** and **Correlation**.
  - Every card shows its latest value, change and sparkline at Day / Week / Month grain. Partial final
    weeks/months are dropped. A formula card bound to actual data shows the reconciliation gap.
  - Metric filters, including through a linked table (e.g. sales filtered by `region_name` from `regions.csv`).
  - Checks for calculation loops, unknown references, duplicate names and drivers pointing at formula cards.
  - ELK auto-layout (inputs below, outcome on top), a legend, a minimap, multiple trees, and export/import as
    `.treepath.json` (bindings only, never your data rows).
  - A ready-made **Net Revenue sample tree** for the sample data.
- **Analyze tab:** every card with model-driver inputs is fitted with multivariable OLS.
  - *Change* models (default) regress period-over-period changes on ln / logit / raw scales, chosen per series,
    which reads as elasticity. *Level* models use raw values.
  - Coefficient ± 95% CI, p-value, VIF, an expected-direction check, a lag scan (correlation at lags 0–7 with
    one-click "use lag"), walk-forward out-of-sample R², direction hit rate, and an actual-vs-fitted chart.
  - Plain-English readings, e.g. "A 10% rise in Ad Spend goes with +3.98% Orders 1 day later".
- **Scenario tab:** change inputs and follow the effect to the outcome.
  - Type it ("increase Ad Spend 20%", "set Voucher Coverage to 15%", "reduce Cost per Order by 0.5"), or use
    per-input controls (change by % / add / set to). Model estimates can be overridden.
  - Changes propagate in calculation order: exact formulas, then fitted drivers at steady state.
    An unchanged input always returns the baseline exactly.
  - Shows the outcome baseline → scenario, change, a **P5–P95 range** from 400 Monte-Carlo draws of the fitted
    coefficients, and the evidence type.
  - **What drove the change:** each input's own effect plus any interaction, adding up exactly to the
    total, and the changed path card by card.
  - **How it was calculated:** every formula with baseline and scenario numbers substituted, and every model
    step (e.g. `ln(12.6K) − ln(10.5K) = 0.18232 × 0.4092`).
  - The canvas highlights the path (green up, red down; tint shows size) and dims everything else.
  - Multiple named scenarios per tree, with a comparison table. The baseline is the average of the last N periods.
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

Vite · React · TypeScript · Tailwind CSS · React Flow · ELK.js · SheetJS · Zustand · idb-keyval · Vitest

## License

MIT
