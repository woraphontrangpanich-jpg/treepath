# Treepath — Project Plan

> A browser-only metric-tree workbench. Upload Excel/CSV files, link them by key columns,
> build a tree of how features drive an outcome (e.g. Revenue, Profit), and forecast what
> happens to the outcome when an input changes — using exact formulas plus linear regression.

Status: **Shipped v1**: Data → Build → Forecast. Simplified after review: Analyze folded into Build, links reduced to Formula / Model driver / Influence, notes and minimap removed. Possible next: Text Build. · Date: 2026-10-29

---

## 1. What I understood

| Prism (old) | Treepath (new) |
|---|---|
| Data from MIDAS (Live) or generated Dry data | Data from **uploaded Excel / CSV files** (plus a bundled sample workbook) |
| FastAPI backend, SSO, MIDAS token | **No backend.** Everything runs in the browser; data never leaves the user's machine |
| Build / Scenario workspaces over one tree | Same: **Build**, **Analyze**, **Scenario** |
| Metric cards (white) + Formula cards (yellow) | Same concept: **Metric nodes** and **Formula nodes**, new visual style |
| Edge types: Formula, Model driver, Influence, Leading indicator, Correlation, Cost deduction | Same edge vocabulary — only Formula and Model-driver edges carry numbers |
| "Revenue impact planner": change an input → highlighted path, baseline vs scenario, P5–P95 range, "what drove the change", step-by-step calculation trace | Same, rebuilt |
| Text Build (type relationships as text) | Same, with a restricted parser (no `eval`) |

**The core idea, using your example:** *Ad Spend* goes up 20%.
- It hits **Cost** directly and exactly (formula: `Net Revenue = Revenue − Orders × Cost per Order − Ad Spend`).
- It hits **Revenue** only indirectly: Ad Spend → (regression) → Orders → (formula) → Revenue.
- Treepath adds both paths up once, with no double counting, and shows the net effect on the target plus a confidence range.

**Multiple Excel files:** each file/sheet becomes a *table*. You pick its date column and
its key columns (e.g. `date`, `store_id`, `region`). Tables are linked through matching keys,
so a metric from `marketing.xlsx` can drive a metric from `sales.xlsx` in the same tree.

> Note: the skill file mentions a packaged starter (`assets/prism-starter/`, references, scripts).
> I only received `SKILL.md`, so I'm working from the skill text and the video, not from Prism's source code.
> That's fine because you want a new UI, but please send the reference docs (especially the
> calculation / scenario guides) if you still have them. They'd help me match Prism's maths more closely.

---

## 2. Tech stack (static web app, no server)

| Concern | Choice | Why |
|---|---|---|
| App framework | **Vite + React + TypeScript** | Fast, typed, builds to static files |
| Tree canvas | **React Flow (`@xyflow/react`)** | Pan/zoom, custom node cards, custom edges, minimap |
| Auto-layout | **ELK.js** (layered, bottom-up) | Clean hierarchical "inputs at bottom → outcome at top" layout like Prism |
| Excel/CSV parsing | **SheetJS (`xlsx`)** in a Web Worker | Reads .xlsx/.xls/.csv locally; the UI doesn't freeze on big files |
| Data crunching | Small in-house table engine (group-by date grain, joins on keys) | Lightweight; DuckDB-WASM is a later option for very large files |
| Regression | Own OLS (normal equations + QR) with `ml-matrix` | Multivariable, lag support, coefficients, p-values, VIF, walk-forward validation |
| UI components | **Tailwind CSS + shadcn/ui (Radix)** + lucide icons | New, modern look that isn't Prism's editorial style; accessible |
| Charts | **Recharts** (sparklines, actual vs fitted, contribution waterfall) | |
| State | **Zustand** | Simple global store for tree, data, and scenario |
| Persistence | **IndexedDB** (via `idb-keyval`) + export/import `.treepath.json` | Trees survive refresh; can be shared as files |
| Tests | **Vitest** (engine) + **Playwright** (smoke UI) | |
| Hosting | **GitHub repo + GitHub Pages** via GitHub Actions (Vercel/Netlify also work) | Anyone can use the URL or `git clone && npm i && npm run dev` |

---

## 3. Core concepts / data model

```
Workbook ─┬─ Table (file/sheet)  : columns, dateColumn, keyColumns[], grain
          └─ Link                : tableA.keyCol ↔ tableB.keyCol  (primary-key join)

Metric    : { id, tableId, column, aggregation: sum|avg|last|count, unit, filters }
            → produces a time series at Day / Week / Month grain

Node
  ├─ MetricNode   (white card)  – bound to a Metric, shows value, Δ%, sparkline
  ├─ FormulaNode  (accent card) – e.g. Revenue = @Orders * @Realized Price
  └─ NoteNode     – free text / strategy context

Edge  { from, to, role }
  role = formula | driver (regression) | influence | leading | correlation | cost
  Only formula & driver propagate numbers; the rest are visual context.

Tree  { nodes, edges, outcomeNodeId, grain, scenarioBaseline, version }
  – persisted WITHOUT raw data rows (only bindings), so trees stay small and shareable.
```

Rules carried over from Prism:
- One formula owner per output, no calculation cycles (checked on every edit).
- Formulas use a safe parser (`+ − × ÷ ( )`, `@Metric` refs, constants, `min/max/abs`), never `eval`.
- Scenario changes never overwrite actual data.

---

## 4. Calculation & prediction engine

1. **Series building:** aggregate each metric to the chosen grain; align all series on the date axis; joins via linked keys.
2. **Formula nodes:** evaluate exactly; show the *reconciliation gap* between formula result and actual column if both exist.
3. **Driver (regression) edges:** for each target with driver edges, fit a multivariable OLS:
   - Model options: levels, or **log-change** (elasticity-style, as Prism did), optional **lag** per driver (e.g. ad spend affects orders 7 days later).
   - Output: coefficient, intercept, R², p-value, VIF, n.
   - **Walk-forward validation** → P5–P95 error band used as the scenario range.
4. **Scenario propagation:** user changes inputs (`% change`, `absolute`, `set to`); the engine walks the graph in topological order:
   driver nodes → regression Δ → formula recompute → … → outcome.
5. **Explainability (Scenario panel):**
   - Outcome estimate: baseline · scenario · Δ · Δ% · P5–P95 range · evidence type ("exact formula + fitted history").
   - "What drove the change": per-path contributions that add up exactly to the total (waterfall).
   - "How it was calculated": step-by-step numeric trace for every formula and model.
   - Highlighted path on the canvas: green = increase, red = decrease, opacity = magnitude; unaffected nodes are dimmed.
6. **Natural-language change box:** "increase Ad Spend 20%", "set Voucher Coverage to 15%" → parsed with a small rule-based grammar (no AI needed).

---

## 5. UI (new design, not a Prism copy)

- **Top bar:** tree name · Build / Analyze / Scenario segmented control · grain (Day/Week/Month) · Data · Save / Export.
- **Left rail – Data & Library:** uploaded files → tables → columns (type icons), key-link editor, searchable metric library (drag onto canvas).
- **Canvas:** React Flow, dotted grid, rounded cards with value + sparkline + Δ chip, colour-coded edge legend, minimap, auto-layout button.
- **Right inspector:** context-sensitive — node details / formula editor / model diagnostics (actual vs fitted chart) / Scenario planner.
- Light + dark theme, keyboard shortcuts, onboarding "Start here" card that loads a sample tree.

---

## 6. Phased delivery

| Phase | Deliverable |
|---|---|
| **0. Scaffold** | Vite+React+TS, Tailwind/shadcn, lint, Vitest, GitHub Actions → Pages. `git init`. |
| **1. Data import** | Upload multiple .xlsx/.csv; sheet picker; column type detection; date & key column mapping; preview grid; link tables by keys; sample workbook (ads/orders/revenue). |
| **2. Tree builder** | Canvas, metric/formula/note nodes, 6 edge roles, legend, ELK auto-layout, cycle & duplicate-owner checks, save/load (IndexedDB + JSON). |
| **3. Text Build** | Paste lines like `Revenue = Orders * Realized Price`, `Ad Spend drives Orders` → preview → build tree. |
| **4. Analyze** | Series per node, sparklines, correlation matrix, regression fitting with diagnostics. |
| **5. Scenario** | Input controls, NL change box, propagation engine, outcome card, P5–P95, waterfall, calculation trace, path highlighting, compare saved scenarios. |
| **6. Polish & ship** | Dark mode, empty/error states, README with screenshots, sample data, tests, public GitHub repo + live Pages URL. |

I'll build phase by phase and show you the running app in the browser pane after each one.

---

## 7. Decisions I've made (tell me if you disagree)

- **No login.** It's a static site and everything stays local in the browser. (Sharing works by exporting `.treepath.json` plus the Excel files.)
- **English UI only** at first.
- **Regression = OLS** (with log-change & lag options). Fancier models (ridge, seasonality) can come later.
- **Repo name `treepath`**, MIT license, deployed to GitHub Pages under your account. I'll ask before creating or pushing anything.

## 8. Open questions

1. Do you have a real example Excel file (or its column layout) I should design around? If not, I'll generate a realistic sample (daily ad spend, orders, price, vouchers, cost, revenue).
2. Can you send Prism's reference docs (calculation / scenario guides) if you have them?
