/**
 * Restricted formula language (never `eval`):
 *   numbers, + - * / ^, parentheses, unary minus,
 *   references `[Node Label]` (or `@Label` for single-word labels),
 *   functions min, max, abs, ln, log, exp, sqrt, round.
 */

export type Ast =
  | { t: 'num'; v: number }
  | { t: 'ref'; name: string }
  | { t: 'neg'; e: Ast }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; l: Ast; r: Ast }
  | { t: 'call'; fn: FnName; args: Ast[] }

const FNS = {
  min: (a: number[]) => Math.min(...a),
  max: (a: number[]) => Math.max(...a),
  abs: (a: number[]) => Math.abs(a[0]),
  ln: (a: number[]) => Math.log(a[0]),
  log: (a: number[]) => Math.log10(a[0]),
  exp: (a: number[]) => Math.exp(a[0]),
  sqrt: (a: number[]) => Math.sqrt(a[0]),
  round: (a: number[]) => {
    const p = 10 ** (a[1] ?? 0)
    return Math.round(a[0] * p) / p
  },
} as const
type FnName = keyof typeof FNS
const ARITY: Record<FnName, [number, number]> = {
  min: [1, 99], max: [1, 99], abs: [1, 1], ln: [1, 1], log: [1, 1], exp: [1, 1], sqrt: [1, 1], round: [1, 2],
}

export class FormulaError extends Error {
  pos: number
  constructor(message: string, pos: number) {
    super(message)
    this.pos = pos
  }
}

type Tok =
  | { k: 'num'; v: number; pos: number }
  | { k: 'ref'; name: string; pos: number }
  | { k: 'id'; name: string; pos: number }
  | { k: 'op'; v: string; pos: number }
  | { k: 'end'; pos: number }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) { i++; continue }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?%?/.exec(src.slice(i))!
      let v = Number(m[0].replace('%', ''))
      if (m[0].endsWith('%')) v /= 100
      out.push({ k: 'num', v, pos: i })
      i += m[0].length
      continue
    }
    if (ch === '[') {
      const end = src.indexOf(']', i)
      if (end < 0) throw new FormulaError('Missing closing ]', i)
      const name = src.slice(i + 1, end).trim()
      if (!name) throw new FormulaError('Empty reference []', i)
      out.push({ k: 'ref', name, pos: i })
      i = end + 1
      continue
    }
    if (ch === '@') {
      const m = /^@([A-Za-z_][\w%]*)/.exec(src.slice(i))
      if (!m) throw new FormulaError('Expected a name after @ (use [Name With Spaces] for longer names)', i)
      out.push({ k: 'ref', name: m[1], pos: i })
      i += m[0].length
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_]\w*/.exec(src.slice(i))!
      out.push({ k: 'id', name: m[0], pos: i })
      i += m[0].length
      continue
    }
    const op = ch === '×' ? '*' : ch === '÷' ? '/' : ch === '−' ? '-' : ch
    if ('+-*/^(),'.includes(op)) {
      out.push({ k: 'op', v: op, pos: i })
      i++
      continue
    }
    throw new FormulaError(`Unexpected character "${ch}"`, i)
  }
  out.push({ k: 'end', pos: src.length })
  return out
}

export function parseFormula(src: string): Ast {
  const toks = tokenize(src)
  let p = 0
  const peek = () => toks[p]
  const isOp = (v: string) => {
    const t = toks[p]
    return t.k === 'op' && t.v === v
  }
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`Expected "${v}"`, peek().pos)
    p++
  }

  function expr(): Ast {
    let l = term()
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: '+' | '-' }).v
      l = { t: 'bin', op, l, r: term() }
    }
    return l
  }
  function term(): Ast {
    let l = unary()
    while (isOp('*') || isOp('/')) {
      const op = (toks[p++] as { v: '*' | '/' }).v
      l = { t: 'bin', op, l, r: unary() }
    }
    return l
  }
  function unary(): Ast {
    if (isOp('-')) { p++; return { t: 'neg', e: unary() } }
    if (isOp('+')) { p++; return unary() }
    return power()
  }
  function power(): Ast {
    const base = atom()
    if (isOp('^')) { p++; return { t: 'bin', op: '^', l: base, r: unary() } }
    return base
  }
  function atom(): Ast {
    const t = peek()
    if (t.k === 'num') { p++; return { t: 'num', v: t.v } }
    if (t.k === 'ref') { p++; return { t: 'ref', name: t.name } }
    if (t.k === 'id') {
      const fn = t.name.toLowerCase() as FnName
      if (!(fn in FNS)) throw new FormulaError(`Unknown name "${t.name}". Wrap node names in [brackets].`, t.pos)
      p++
      expect('(')
      const args: Ast[] = []
      if (!isOp(')')) {
        args.push(expr())
        while (isOp(',')) { p++; args.push(expr()) }
      }
      expect(')')
      const [lo, hi] = ARITY[fn]
      if (args.length < lo || args.length > hi) throw new FormulaError(`${fn}() takes ${lo === hi ? lo : `${lo}–${hi}`} argument(s)`, t.pos)
      return { t: 'call', fn, args }
    }
    if (isOp('(')) {
      p++
      const e = expr()
      expect(')')
      return e
    }
    throw new FormulaError(t.k === 'end' ? 'Formula ends unexpectedly' : 'Expected a number, [reference] or (', t.pos)
  }

  if (peek().k === 'end') throw new FormulaError('Formula is empty', 0)
  const ast = expr()
  if (peek().k !== 'end') throw new FormulaError('Unexpected text after the formula', peek().pos)
  return ast
}

/** Distinct reference names, in order of first appearance. */
export function formulaRefs(ast: Ast): string[] {
  const out: string[] = []
  const walk = (a: Ast) => {
    if (a.t === 'ref') { if (!out.includes(a.name)) out.push(a.name) }
    else if (a.t === 'neg') walk(a.e)
    else if (a.t === 'bin') { walk(a.l); walk(a.r) }
    else if (a.t === 'call') a.args.forEach(walk)
  }
  walk(ast)
  return out
}

/**
 * References that are only ever subtracted at the top additive level, e.g. in
 * `[Revenue] - [Orders] * [CPO] - [Ad Spend]` → Orders, CPO, Ad Spend. Used to colour cost-deduction links.
 */
export function deductedRefs(ast: Ast): Set<string> {
  const pos = new Set<string>()
  const neg = new Set<string>()
  const visit = (a: Ast, sign: 1 | -1) => {
    if (a.t === 'bin' && (a.op === '+' || a.op === '-')) {
      visit(a.l, sign)
      visit(a.r, a.op === '-' ? (-sign as 1 | -1) : sign)
    } else if (a.t === 'neg') visit(a.e, -sign as 1 | -1)
    else for (const r of formulaRefs(a)) (sign < 0 ? neg : pos).add(r)
  }
  visit(ast, 1)
  return new Set([...neg].filter((r) => !pos.has(r)))
}

export function evaluate(ast: Ast, env: (name: string) => number): number {
  switch (ast.t) {
    case 'num': return ast.v
    case 'ref': return env(ast.name)
    case 'neg': return -evaluate(ast.e, env)
    case 'call': return FNS[ast.fn](ast.args.map((a) => evaluate(a, env)))
    case 'bin': {
      const l = evaluate(ast.l, env)
      const r = evaluate(ast.r, env)
      switch (ast.op) {
        case '+': return l + r
        case '-': return l - r
        case '*': return l * r
        case '/': return r === 0 ? NaN : l / r
        case '^': return l ** r
      }
    }
  }
}

/** Reference syntax for a label: `@Orders` style is ambiguous with spaces, so brackets are canonical. */
export function refFor(label: string) {
  return `[${label}]`
}

/** Rewrite references when a node is renamed. */
export function renameRef(formula: string, from: string, to: string) {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let out = formula.replace(new RegExp(`\\[\\s*${esc}\\s*\\]`, 'g'), refFor(to))
  if (/^[A-Za-z_][\w%]*$/.test(from)) out = out.replace(new RegExp(`@${esc}(?![\\w%])`, 'g'), refFor(to))
  return out
}
