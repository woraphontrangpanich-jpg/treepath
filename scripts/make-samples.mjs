// Generates the bundled sample workbooks in public/samples/.
// The data is synthetic but has real structure: Orders respond to (lagged) Ad Spend,
// Voucher Coverage and rain, so later regression phases have a signal to find.
//   node scripts/make-samples.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples')
mkdirSync(outDir, { recursive: true })

// Deterministic PRNG (mulberry32) so the samples are reproducible.
let seed = 20261029
function rand() {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
function gauss() {
  const u = Math.max(rand(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d

const regions = [
  { code: 'BKK', name: 'Bangkok', country: 'Thailand', stores: 420, adBase: 6000, orderBase: 6.1 },
  { code: 'CNX', name: 'Chiang Mai', country: 'Thailand', stores: 130, adBase: 2500, orderBase: 5.0 },
  { code: 'HKT', name: 'Phuket', country: 'Thailand', stores: 95, adBase: 1800, orderBase: 4.7 },
]

const start = Date.UTC(2025, 0, 1)
const days = 546 // 2025-01-01 .. 2026-06-30
const iso = (ms) => new Date(ms).toISOString().slice(0, 10)
const excelSerial = (ms) => ms / 86400000 + 25569

const campaigns = [
  { id: 'C-01', name: 'Songkran Push', start: Date.UTC(2025, 3, 5), end: Date.UTC(2025, 3, 20), lift: 1.6 },
  { id: 'C-02', name: 'Rainy Season Promo', start: Date.UTC(2025, 6, 1), end: Date.UTC(2025, 6, 31), lift: 1.3 },
  { id: 'C-03', name: '11.11 Mega Sale', start: Date.UTC(2025, 10, 5), end: Date.UTC(2025, 10, 12), lift: 1.9 },
  { id: 'C-04', name: 'New Year Blast', start: Date.UTC(2025, 11, 26), end: Date.UTC(2026, 0, 5), lift: 1.5 },
  { id: 'C-05', name: 'Summer Saver', start: Date.UTC(2026, 2, 15), end: Date.UTC(2026, 3, 15), lift: 1.35 },
]

const marketing = [['date', 'region_code', 'ad_spend', 'voucher_coverage', 'voucher_discount_pct']]
const sales = [['Date', 'Region', 'Orders', 'Gross Price', 'Voucher Used Orders', 'Revenue', 'Cost per Order']]
const weather = [['date', 'region_code', 'rain_index']]

for (const r of regions) {
  let coverage = 0.12
  let takeUp = 0.6
  let discount = 0.2
  let price = 12 + rand()
  let prevAd = r.adBase
  for (let i = 0; i < days; i++) {
    const ms = start + i * 86400000
    const d = new Date(ms)
    const dow = d.getUTCDay()
    const month = d.getUTCMonth()

    const camp = campaigns.find((c) => ms >= c.start && ms <= c.end)
    const ad = r.adBase * (1 + 0.15 * Math.sin((2 * Math.PI * i) / 7)) * (camp ? camp.lift : 1) * Math.exp(0.12 * gauss())

    coverage = Math.min(0.3, Math.max(0.04, coverage + 0.004 * gauss()))
    takeUp = Math.min(0.75, Math.max(0.4, takeUp + 0.005 * gauss()))
    if (i % 60 === 0) discount = [0.15, 0.2, 0.25][Math.floor(rand() * 3)]
    price = Math.min(14, Math.max(10.5, price + 0.03 * gauss()))

    const monsoon = month >= 4 && month <= 9 ? 1 : 0.25
    const rain = Math.max(0, Math.min(200, 100 * monsoon + 45 * gauss()))

    const weekend = dow === 0 || dow === 6 ? 0.12 : 0
    const logOrders =
      r.orderBase + 0.28 * Math.log(prevAd) + 0.9 * coverage - 0.0012 * rain + weekend + 0.05 * gauss()
    const orders = Math.round(Math.exp(logOrders))
    const voucherOrders = Math.round(orders * coverage * takeUp)
    const realized = price - (voucherOrders * price * discount) / orders
    const revenue = orders * realized
    const cpo = 4.5 + 0.15 * gauss()

    marketing.push([excelSerial(ms), r.code, round(ad, 0), round(coverage, 4), discount])
    sales.push([excelSerial(ms), r.code, orders, round(price), voucherOrders, round(revenue), round(cpo)])
    weather.push([iso(ms), r.code, round(rain, 1)])
    prevAd = ad
  }
}

function formatColumn(ws, col, z, rows) {
  for (let r = 1; r < rows; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: col })]
    if (cell) cell.z = z
  }
}

// marketing.xlsx — two sheets, to exercise the sheet picker.
{
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(marketing)
  formatColumn(ws, 0, 'yyyy-mm-dd', marketing.length)
  formatColumn(ws, 3, '0.0%', marketing.length)
  formatColumn(ws, 4, '0%', marketing.length)
  XLSX.utils.book_append_sheet(wb, ws, 'Ad Spend')
  const camp = [['campaign_id', 'campaign_name', 'start_date', 'end_date', 'planned_lift']]
  for (const c of campaigns) camp.push([c.id, c.name, excelSerial(c.start), excelSerial(c.end), c.lift])
  const cws = XLSX.utils.aoa_to_sheet(camp)
  formatColumn(cws, 2, 'yyyy-mm-dd', camp.length)
  formatColumn(cws, 3, 'yyyy-mm-dd', camp.length)
  XLSX.utils.book_append_sheet(wb, cws, 'Campaigns')
  writeFileSync(join(outDir, 'marketing.xlsx'), XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }))
}

// sales.xlsx — different header style ("Region" vs "region_code") to exercise link suggestions.
{
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(sales)
  formatColumn(ws, 0, 'dd/mm/yyyy', sales.length)
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Sales')
  writeFileSync(join(outDir, 'sales.xlsx'), XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }))
}

const toCsv = (aoa) => aoa.map((row) => row.join(',')).join('\n') + '\n'
writeFileSync(join(outDir, 'weather.csv'), toCsv(weather))
writeFileSync(
  join(outDir, 'regions.csv'),
  toCsv([['region_code', 'region_name', 'country', 'store_count'], ...regions.map((r) => [r.code, r.name, r.country, r.stores])]),
)

console.log(`Wrote samples to ${outDir}: ${marketing.length - 1} marketing rows, ${sales.length - 1} sales rows`)
