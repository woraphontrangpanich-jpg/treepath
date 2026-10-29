import { invert } from '../model/stats'
import { rng } from '../model/stats'
import type { Task } from './dataset'

/**
 * Two supervised learners, written to run in the browser:
 * - Boosted trees in the style of XGBoost: second-order gradient boosting on histogram bins, with
 *   L2-regularised leaf weights, row and column subsampling, and early stopping.
 * - Logistic regression (classification) or ridge linear regression (numbers).
 */

export interface TreeParams {
  trees: number
  learningRate: number
  maxDepth: number
  minChildWeight: number
  subsample: number
  colsample: number
  lambda: number
  earlyStop: boolean
}

export interface LinearParams {
  lambda: number
  steps: number
  balance: boolean
}

export const TREE_DEFAULTS: TreeParams = { trees: 300, learningRate: 0.1, maxDepth: 4, minChildWeight: 1, subsample: 0.8, colsample: 0.8, lambda: 1, earlyStop: true }
export const LINEAR_DEFAULTS: LinearParams = { lambda: 1, steps: 400, balance: false }

/** A tree as flat arrays; `feat[i] === -1` marks a leaf holding `value[i]`. Go left when x <= thr. */
export interface Tree {
  feat: number[]
  thr: number[]
  left: number[]
  right: number[]
  value: number[]
}

export type Model =
  | { kind: 'trees'; task: Task; k: number; base: number[]; rounds: Tree[][] }
  | { kind: 'linear'; task: Task; k: number; w: number[][] }

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

function softmax(z: number[]) {
  const m = Math.max(...z)
  const e = z.map((v) => Math.exp(v - m))
  const s = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / s)
}

function treeValue(t: Tree, x: number[]) {
  let i = 0
  while (t.feat[i] !== -1) i = x[t.feat[i]] <= t.thr[i] ? t.left[i] : t.right[i]
  return t.value[i]
}

/** Raw scores: one per class for multiclass, otherwise one. */
export function rawScores(m: Model, x: number[]): number[] {
  if (m.kind === 'trees') {
    const s = [...m.base]
    for (const round of m.rounds) for (let c = 0; c < round.length; c++) s[c] += treeValue(round[c], x)
    return s
  }
  return m.w.map((row) => {
    let z = row[row.length - 1]
    for (let j = 0; j < x.length; j++) z += row[j] * x[j]
    return z
  })
}

/** Class probabilities (classification) or the predicted number (regression, length 1). */
export function predict(m: Model, x: number[]): number[] {
  const s = rawScores(m, x)
  if (m.task === 'regression') return s
  if (m.k === 2) {
    const p = sigmoid(s[0])
    return [1 - p, p]
  }
  return softmax(s)
}

// ---------- boosted trees ----------

interface Binned {
  /** Per feature: sorted split thresholds. */
  cuts: number[][]
  /** Per feature: bin of each row. */
  bins: Uint8Array[]
}

function binColumns(X: number[][], maxBins = 32): Binned {
  const n = X.length
  const p = X[0]?.length ?? 0
  const cuts: number[][] = []
  const bins: Uint8Array[] = []
  for (let j = 0; j < p; j++) {
    const col = new Float64Array(n)
    for (let i = 0; i < n; i++) col[i] = X[i][j]
    const sorted = Array.from(col).sort((a, b) => a - b)
    const c: number[] = []
    for (let q = 1; q < maxBins; q++) {
      const v = sorted[Math.min(n - 1, Math.floor((q / maxBins) * n))]
      if (v < sorted[n - 1] && (c.length === 0 || v > c[c.length - 1])) c.push(v)
    }
    cuts.push(c)
    const b = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      let lo = 0
      let hi = c.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (col[i] <= c[mid]) hi = mid
        else lo = mid + 1
      }
      b[i] = lo
    }
    bins.push(b)
  }
  return { cuts, bins }
}

function buildTree(rows: number[], g: Float64Array, h: Float64Array, data: Binned, cols: number[], prm: TreeParams, gain: Float64Array): Tree {
  const t: Tree = { feat: [], thr: [], left: [], right: [], value: [] }
  const grow = (idx: number[], depth: number): number => {
    const me = t.feat.length
    t.feat.push(-1)
    t.thr.push(0)
    t.left.push(-1)
    t.right.push(-1)
    t.value.push(0)
    let G = 0
    let H = 0
    for (const i of idx) {
      G += g[i]
      H += h[i]
    }
    const leaf = () => {
      t.value[me] = (-G / (H + prm.lambda)) * prm.learningRate
      return me
    }
    if (depth >= prm.maxDepth || idx.length < 2) return leaf()
    const parent = (G * G) / (H + prm.lambda)
    let best = 1e-9
    let bf = -1
    let bb = -1
    for (const j of cols) {
      const m = data.cuts[j].length
      if (m === 0) continue
      const hg = new Float64Array(m + 1)
      const hh = new Float64Array(m + 1)
      const bj = data.bins[j]
      for (const i of idx) {
        hg[bj[i]] += g[i]
        hh[bj[i]] += h[i]
      }
      let GL = 0
      let HL = 0
      for (let b = 0; b < m; b++) {
        GL += hg[b]
        HL += hh[b]
        const HR = H - HL
        if (HL < prm.minChildWeight || HR < prm.minChildWeight) continue
        const GR = G - GL
        const v = (GL * GL) / (HL + prm.lambda) + (GR * GR) / (HR + prm.lambda) - parent
        if (v > best) {
          best = v
          bf = j
          bb = b
        }
      }
    }
    if (bf < 0) return leaf()
    gain[bf] += best
    const L: number[] = []
    const R: number[] = []
    const bj = data.bins[bf]
    for (const i of idx) (bj[i] <= bb ? L : R).push(i)
    t.feat[me] = bf
    t.thr[me] = data.cuts[bf][bb]
    const l = grow(L, depth + 1)
    const r = grow(R, depth + 1)
    t.left[me] = l
    t.right[me] = r
    return me
  }
  grow(rows, 0)
  return t
}

function loss(task: Task, k: number, scores: number[][], y: number[]) {
  let s = 0
  for (let i = 0; i < y.length; i++) {
    if (task === 'regression') s += (scores[i][0] - y[i]) ** 2
    else if (k === 2) s -= Math.log(Math.max(1e-12, y[i] === 1 ? sigmoid(scores[i][0]) : 1 - sigmoid(scores[i][0])))
    else s -= Math.log(Math.max(1e-12, softmax(scores[i])[y[i]]))
  }
  return s / Math.max(1, y.length)
}

export interface TrainResult {
  model: Model
  /** Importance per encoded column (gain for trees, |coefficient| for linear). */
  importance: number[]
  /** Linear models only: coefficients per encoded column, for direction of effect. */
  coef?: number[]
  roundsUsed?: number
}

export function trainTrees(
  X: number[][],
  y: number[],
  task: Task,
  k: number,
  prm: TreeParams,
  seed: number,
  onProgress?: (done: number, total: number) => void,
): TrainResult {
  const rand = rng(seed)
  // Hold back some rows to know when to stop adding trees.
  let tr = X.map((_, i) => i)
  let va: number[] = []
  if (prm.earlyStop && X.length >= 60) {
    for (let i = tr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[tr[i], tr[j]] = [tr[j], tr[i]]
    }
    const cut = Math.round(tr.length * 0.85)
    va = tr.slice(cut)
    tr = tr.slice(0, cut)
  }
  const data = binColumns(X)
  const p = X[0]?.length ?? 0
  const outs = task === 'classification' && k > 2 ? k : 1
  let base: number[]
  if (task === 'regression') base = [tr.reduce((a, i) => a + y[i], 0) / tr.length]
  else if (k === 2) {
    const pos = Math.min(0.999, Math.max(0.001, tr.filter((i) => y[i] === 1).length / tr.length))
    base = [Math.log(pos / (1 - pos))]
  } else base = Array.from({ length: k }, (_, c) => Math.log(Math.max(1e-3, tr.filter((i) => y[i] === c).length / tr.length)))

  const scores = X.map(() => [...base])
  const g = new Float64Array(X.length)
  const h = new Float64Array(X.length)
  const gain = new Float64Array(p)
  const rounds: Tree[][] = []
  let bestLoss = Infinity
  let bestRound = 0
  for (let r = 0; r < prm.trees; r++) {
    const rows = prm.subsample < 1 ? tr.filter(() => rand() < prm.subsample) : tr
    const cols = Array.from({ length: p }, (_, j) => j).filter(() => prm.colsample >= 1 || rand() < prm.colsample)
    const round: Tree[] = []
    const probs = outs > 1 ? X.map((_, i) => softmax(scores[i])) : null
    for (let c = 0; c < outs; c++) {
      for (const i of tr) {
        if (task === 'regression') {
          g[i] = scores[i][0] - y[i]
          h[i] = 1
        } else if (outs === 1) {
          const q = sigmoid(scores[i][0])
          g[i] = q - (y[i] === 1 ? 1 : 0)
          h[i] = Math.max(q * (1 - q), 1e-6)
        } else {
          const q = probs![i][c]
          g[i] = q - (y[i] === c ? 1 : 0)
          h[i] = Math.max(q * (1 - q), 1e-6)
        }
      }
      const t = buildTree(rows.length ? rows : tr, g, h, data, cols.length ? cols : [0], prm, gain)
      round.push(t)
      for (let i = 0; i < X.length; i++) scores[i][c] += treeValue(t, X[i])
    }
    rounds.push(round)
    onProgress?.(r + 1, prm.trees)
    if (va.length) {
      const l = loss(
        task,
        k,
        va.map((i) => scores[i]),
        va.map((i) => y[i]),
      )
      if (l < bestLoss - 1e-9) {
        bestLoss = l
        bestRound = r + 1
      } else if (r + 1 - bestRound >= 25) break
    } else bestRound = r + 1
  }
  return { model: { kind: 'trees', task, k, base, rounds: rounds.slice(0, Math.max(1, bestRound)) }, importance: Array.from(gain), roundsUsed: Math.max(1, bestRound) }
}

// ---------- logistic / linear regression ----------

export function trainLinear(X: number[][], y: number[], task: Task, k: number, prm: LinearParams, onProgress?: (done: number, total: number) => void): TrainResult {
  const n = X.length
  const p = X[0]?.length ?? 0
  if (task === 'regression') {
    // Ridge regression in closed form; the intercept is not penalised.
    const A = Array.from({ length: p + 1 }, () => new Array(p + 1).fill(0))
    const b = new Array(p + 1).fill(0)
    for (let i = 0; i < n; i++) {
      const row = [...X[i], 1]
      for (let a = 0; a <= p; a++) {
        b[a] += row[a] * y[i]
        for (let c = 0; c <= p; c++) A[a][c] += row[a] * row[c]
      }
    }
    for (let a = 0; a < p; a++) A[a][a] += prm.lambda
    const inv = invert(A)
    const w = inv ? inv.map((r) => r.reduce((s, v, j) => s + v * b[j], 0)) : new Array(p + 1).fill(0)
    onProgress?.(1, 1)
    return { model: { kind: 'linear', task, k: 1, w: [w] }, importance: w.slice(0, p).map(Math.abs), coef: w.slice(0, p) }
  }
  // Logistic regression (softmax for 3+ classes), full-batch gradient descent with Adam.
  const outs = k > 2 ? k : 1
  const W = Array.from({ length: outs }, () => new Array(p + 1).fill(0))
  const counts = Array.from({ length: k }, (_, c) => y.filter((v) => v === c).length)
  const sw = y.map((v) => (prm.balance ? n / (k * Math.max(1, counts[v])) : 1))
  const m = W.map((r) => r.map(() => 0))
  const v2 = W.map((r) => r.map(() => 0))
  const lr = 0.05
  for (let step = 1; step <= prm.steps; step++) {
    const grad = W.map((r) => r.map(() => 0))
    for (let i = 0; i < n; i++) {
      const z = W.map((row) => {
        let s = row[p]
        for (let j = 0; j < p; j++) s += row[j] * X[i][j]
        return s
      })
      const q = outs === 1 ? [sigmoid(z[0])] : softmax(z)
      for (let c = 0; c < outs; c++) {
        const target = outs === 1 ? (y[i] === 1 ? 1 : 0) : y[i] === c ? 1 : 0
        const e = (q[c] - target) * sw[i]
        for (let j = 0; j < p; j++) grad[c][j] += e * X[i][j]
        grad[c][p] += e
      }
    }
    for (let c = 0; c < outs; c++)
      for (let j = 0; j <= p; j++) {
        const gj = grad[c][j] / n + (j < p ? (prm.lambda / n) * W[c][j] : 0)
        m[c][j] = 0.9 * m[c][j] + 0.1 * gj
        v2[c][j] = 0.999 * v2[c][j] + 0.001 * gj * gj
        const mh = m[c][j] / (1 - 0.9 ** step)
        const vh = v2[c][j] / (1 - 0.999 ** step)
        W[c][j] -= (lr * mh) / (Math.sqrt(vh) + 1e-8)
      }
    if (step % 20 === 0) onProgress?.(step, prm.steps)
  }
  const imp = new Array(p).fill(0).map((_, j) => W.reduce((s, row) => s + Math.abs(row[j]), 0))
  return { model: { kind: 'linear', task, k, w: W }, importance: imp, coef: outs === 1 ? W[0].slice(0, p) : undefined }
}

// ---------- scoring ----------

export interface ClassMetrics {
  task: 'classification'
  accuracy: number
  /** Accuracy of always guessing the most common class: the bar to beat. */
  baseline: number
  baselineClass: string
  precision: number
  recall: number
  f1: number
  auc?: number
  /** confusion[actual][predicted] */
  confusion: number[][]
  perClass: { name: string; precision: number; recall: number; support: number }[]
}

export interface RegMetrics {
  task: 'regression'
  r2: number
  mae: number
  rmse: number
  /** Error of always guessing the training average. */
  baselineMae: number
}

export function classMetrics(actual: number[], probs: number[][], classes: string[], trainY: number[]): ClassMetrics {
  const k = classes.length
  const pred = probs.map((p) => p.indexOf(Math.max(...p)))
  const confusion = Array.from({ length: k }, () => new Array(k).fill(0))
  actual.forEach((a, i) => confusion[a][pred[i]]++)
  const correct = actual.filter((a, i) => a === pred[i]).length
  const counts = classes.map((_, c) => trainY.filter((v) => v === c).length)
  const major = counts.indexOf(Math.max(...counts))
  const perClass = classes.map((name, c) => {
    const tp = confusion[c][c]
    const col = confusion.reduce((s, r) => s + r[c], 0)
    const row = confusion[c].reduce((s, v) => s + v, 0)
    return { name, precision: col ? tp / col : 0, recall: row ? tp / row : 0, support: row }
  })
  const precision = perClass.reduce((s, c) => s + c.precision, 0) / k
  const recall = perClass.reduce((s, c) => s + c.recall, 0) / k
  let auc: number | undefined
  if (k === 2) {
    // Chance a random positive gets a higher score than a random negative.
    const pairs = actual.map((a, i) => ({ a, s: probs[i][1] })).sort((x, y) => x.s - y.s)
    let rank = 0
    let posRanks = 0
    let pos = 0
    for (let i = 0; i < pairs.length; ) {
      let j = i
      while (j < pairs.length && pairs[j].s === pairs[i].s) j++
      const avg = (rank + 1 + rank + (j - i)) / 2
      for (let q = i; q < j; q++)
        if (pairs[q].a === 1) {
          posRanks += avg
          pos++
        }
      rank += j - i
      i = j
    }
    const neg = pairs.length - pos
    auc = pos && neg ? (posRanks - (pos * (pos + 1)) / 2) / (pos * neg) : undefined
  }
  return {
    task: 'classification',
    accuracy: correct / Math.max(1, actual.length),
    baseline: actual.filter((a) => a === major).length / Math.max(1, actual.length),
    baselineClass: classes[major],
    precision,
    recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    auc,
    confusion,
    perClass,
  }
}

export function regMetrics(actual: number[], pred: number[], trainMean: number): RegMetrics {
  const n = Math.max(1, actual.length)
  const mean = actual.reduce((a, b) => a + b, 0) / n
  let sse = 0
  let sst = 0
  let ae = 0
  let base = 0
  actual.forEach((a, i) => {
    sse += (a - pred[i]) ** 2
    sst += (a - mean) ** 2
    ae += Math.abs(a - pred[i])
    base += Math.abs(a - trainMean)
  })
  return { task: 'regression', r2: sst ? 1 - sse / sst : 0, mae: ae / n, rmse: Math.sqrt(sse / n), baselineMae: base / n }
}
