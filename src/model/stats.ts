/** Small, dependency-free numerics for regression: linear solves, inverses, t-distribution, quantiles, RNG. */

export type Matrix = number[][]

/** Invert a symmetric positive-definite-ish matrix with Gauss–Jordan + partial pivoting. Returns null if singular. */
export function invert(a: Matrix): Matrix | null {
  const n = a.length
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r
    if (Math.abs(m[p][c]) < 1e-12) return null
    ;[m[c], m[p]] = [m[p], m[c]]
    const piv = m[c][c]
    for (let j = 0; j < 2 * n; j++) m[c][j] /= piv
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = m[r][c]
      if (f === 0) continue
      for (let j = 0; j < 2 * n; j++) m[r][j] -= f * m[c][j]
    }
  }
  return m.map((row) => row.slice(n))
}

/** Lower-triangular Cholesky factor; adds a tiny ridge if needed. */
export function cholesky(a: Matrix): Matrix {
  const n = a.length
  for (let jitter = 0; jitter < 6; jitter++) {
    const eps = jitter === 0 ? 0 : 1e-12 * 10 ** jitter * Math.max(1e-12, ...a.map((r, i) => Math.abs(r[i])))
    const l: Matrix = Array.from({ length: n }, () => new Array(n).fill(0))
    let ok = true
    for (let i = 0; i < n && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = a[i][j] + (i === j ? eps : 0)
        for (let k = 0; k < j; k++) s -= l[i][k] * l[j][k]
        if (i === j) {
          if (s <= 0) ok = false
          else l[i][i] = Math.sqrt(s)
        } else l[i][j] = s / l[j][j]
      }
    }
    if (ok) return l
  }
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? Math.sqrt(Math.max(0, a[i][i])) : 0)))
}

function lnGamma(x: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let ser = 1.000000000190015
  for (const c of g) ser += c / ++y
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200
  const EPS = 3e-14
  const FPMIN = 1e-300
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}

/** Regularized incomplete beta I_x(a, b). */
function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}

/** Two-sided p-value for a t statistic with `df` degrees of freedom. */
export function tPValue(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0
  return ibeta(df / (df + t * t), df / 2, 0.5)
}

/** Upper-tail p-value of an F statistic with (d1, d2) degrees of freedom. */
export function fPValue(f: number, d1: number, d2: number): number {
  if (!Number.isFinite(f) || f <= 0) return 1
  return ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2)
}

/** Two-sided p-value for a Pearson correlation over n pairs. */
export function corrPValue(r: number, n: number): number {
  if (!Number.isFinite(r) || n < 4) return 1
  if (Math.abs(r) >= 1) return 0
  return tPValue((r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r), n - 2)
}

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
}

export function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function correlation(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length)
  if (n < 3) return NaN
  const ma = mean(a.slice(0, n))
  const mb = mean(b.slice(0, n))
  let sab = 0
  let saa = 0
  let sbb = 0
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb)
    saa += (a[i] - ma) ** 2
    sbb += (b[i] - mb) ** 2
  }
  return saa === 0 || sbb === 0 ? NaN : sab / Math.sqrt(saa * sbb)
}

/** Seeded PRNG (mulberry32) so scenario ranges are stable between renders. */
export function rng(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}
