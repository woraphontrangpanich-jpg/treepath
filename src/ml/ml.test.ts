import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { suggestLinks } from '../data/links'
import { parseWorkbook } from '../data/parse'
import type { Link, Table } from '../data/types'
import { encodeRow, fitEncoder, prepare, sourcesFor, suggestTask } from './dataset'
import { predict, LINEAR_DEFAULTS, TREE_DEFAULTS } from './models'
import { runTraining, type Algo } from './train'

const samples = join(__dirname, '..', '..', 'public', 'samples')
function load(name: string): Table[] {
  const buf = readFileSync(join(samples, name))
  return parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, name)
}
const tables = [...load('customers.csv'), ...load('regions.csv')]
const links: Link[] = suggestLinks(tables, []).map((s, i) => ({ id: `l${i}`, from: s.from, to: s.to }))
const customers = tables[0]
const sources = sourcesFor(customers, tables, links)

function run(targetId: string, algo: Algo, drop: string[] = []) {
  const target = sources.find((s) => s.id === targetId)!
  const task = suggestTask(target)
  const feats = sources.filter((s) => s.id !== targetId && s.id !== 'customer_id' && !drop.includes(s.id))
  const prep = prepare(target, task, customers.rows.length, null, { testShare: 0.25, how: 'random', seed: 7 })
  if (typeof prep === 'string') throw new Error(prep)
  const enc = fitEncoder(feats, prep.train)
  const std = algo === 'linear'
  const X = (rows: number[]) => rows.map((r) => encodeRow(enc, (id) => feats.find((f) => f.id === id)!.values[r], std))
  const out = runTraining({
    algo,
    task,
    classes: prep.classes,
    Xtrain: X(prep.train),
    ytrain: prep.train.map((r) => prep.y[r]),
    Xtest: X(prep.test),
    ytest: prep.test.map((r) => prep.y[r]),
    trees: TREE_DEFAULTS,
    linear: LINEAR_DEFAULTS,
    seed: 1,
  })
  return { out, enc, feats, task, prep }
}

describe('machine learning on customers', () => {
  it('adds lookup columns through the link and suggests the task', () => {
    expect(sources.some((s) => s.label === 'regions › store_count')).toBe(true)
    expect(suggestTask(sources.find((s) => s.id === 'churned')!)).toBe('classification')
    expect(suggestTask(sources.find((s) => s.id === 'total_spend')!)).toBe('regression')
  })

  it('boosted trees beat guessing on churn', () => {
    const { out } = run('churned', 'trees', ['total_spend'])
    const m = out.metrics
    if (m.task !== 'classification') throw new Error()
    expect(m.accuracy).toBeGreaterThan(m.baseline + 0.02)
    expect(m.auc!).toBeGreaterThan(0.75)
    expect(out.roundsUsed!).toBeLessThanOrEqual(TREE_DEFAULTS.trees)
  })

  it('logistic regression learns the right directions', () => {
    const { out, enc } = run('churned', 'linear', ['total_spend'])
    const m = out.metrics
    if (m.task !== 'classification') throw new Error()
    expect(m.auc!).toBeGreaterThan(0.7)
    const coef = (name: string) => out.coef![enc.names.indexOf(name)]
    expect(coef('support_calls')).toBeGreaterThan(0)
    expect(coef('tenure_months')).toBeLessThan(0)
  })

  it('predicts a number for total spend', () => {
    const trees = run('total_spend', 'trees').out.metrics
    const linear = run('total_spend', 'linear').out.metrics
    if (trees.task !== 'regression' || linear.task !== 'regression') throw new Error()
    expect(trees.r2).toBeGreaterThan(0.8)
    expect(trees.mae).toBeLessThan(trees.baselineMae / 2)
    expect(linear.r2).toBeGreaterThan(0.4)
  })

  it('scores a single new row the same way', () => {
    const { out, enc, feats } = run('churned', 'trees', ['total_spend'])
    const row = (calls: number, days: number) =>
      encodeRow(enc, (id) => ({ support_calls: calls, days_since_last_order: days, tenure_months: 6, plan: 'Basic' })[id as 'plan'] ?? feats.find((f) => f.id === id)!.values[0], false)
    const risky = predict(out.model, row(6, 80))[1]
    const safe = predict(out.model, row(0, 2))[1]
    expect(risky).toBeGreaterThan(safe + 0.3)
  })
})
