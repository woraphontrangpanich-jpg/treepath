import { fPValue, invert, tPValue, type Matrix } from './stats'

export interface OlsResult {
  /** [intercept, b1, …, bk] */
  coef: number[]
  se: number[]
  t: number[]
  p: number[]
  /** Covariance of coef (sigma² (XᵀX)⁻¹). */
  cov: Matrix
  r2: number
  adjR2: number
  /** Overall F test: do the drivers together explain anything? */
  fStat: number
  fP: number
  n: number
  k: number
  residSd: number
  fitted: number[]
}

/** Ordinary least squares with an intercept. `x` is row-major: x[row][predictor]. */
export function ols(x: number[][], y: number[]): OlsResult | null {
  const n = y.length
  const k = x[0]?.length ?? 0
  if (n <= k + 1) return null
  const p = k + 1
  const xtx: Matrix = Array.from({ length: p }, () => new Array(p).fill(0))
  const xty = new Array(p).fill(0)
  for (let r = 0; r < n; r++) {
    const row = [1, ...x[r]]
    for (let i = 0; i < p; i++) {
      xty[i] += row[i] * y[r]
      for (let j = i; j < p; j++) xtx[i][j] += row[i] * row[j]
    }
  }
  for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) xtx[i][j] = xtx[j][i]
  const inv = invert(xtx)
  if (!inv) return null
  const coef = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0))

  const fitted = x.map((row) => coef[0] + row.reduce((s, v, j) => s + v * coef[j + 1], 0))
  const my = y.reduce((a, b) => a + b, 0) / n
  let sse = 0
  let sst = 0
  for (let r = 0; r < n; r++) {
    sse += (y[r] - fitted[r]) ** 2
    sst += (y[r] - my) ** 2
  }
  const df = n - p
  const sigma2 = sse / df
  const cov = inv.map((row) => row.map((v) => v * sigma2))
  const se = cov.map((row, i) => Math.sqrt(Math.max(0, row[i])))
  const t = coef.map((c, i) => (se[i] > 0 ? c / se[i] : 0))
  const r2 = sst > 0 ? 1 - sse / sst : 0
  return {
    coef,
    se,
    t,
    p: t.map((v) => tPValue(v, df)),
    cov,
    r2,
    adjR2: 1 - ((1 - r2) * (n - 1)) / df,
    fStat: k > 0 && r2 < 1 ? r2 / k / ((1 - r2) / df) : Infinity,
    fP: k > 0 && r2 < 1 ? fPValue(r2 / k / ((1 - r2) / df), k, df) : 0,
    n,
    k,
    residSd: Math.sqrt(sigma2),
    fitted,
  }
}

/** Variance inflation factor of each predictor (1 when there's a single predictor). */
export function vif(x: number[][]): number[] {
  const k = x[0]?.length ?? 0
  if (k < 2) return new Array(k).fill(1)
  return Array.from({ length: k }, (_, j) => {
    const others = x.map((row) => row.filter((_, i) => i !== j))
    const res = ols(
      others,
      x.map((row) => row[j]),
    )
    if (!res) return Infinity
    return res.r2 >= 1 ? Infinity : 1 / (1 - res.r2)
  })
}

export function predict(coef: number[], row: number[]) {
  return coef[0] + row.reduce((s, v, j) => s + v * coef[j + 1], 0)
}
