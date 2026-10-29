import { clsx } from 'clsx'
import { BrainCircuit, Calendar, ChevronDown, Download, Hash, Loader2, Play, RotateCcw, Tag, Trees, TrendingUp } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import type { Cell, Table } from '../../data/types'
import { formatValue } from '../../lib/format'
import { trainInWorker } from '../../ml/client'
import { encodeRow, fitEncoder, kindOf, prepare, sourcesFor, suggestTask, type Encoder, type Source, type Task } from '../../ml/dataset'
import { LINEAR_DEFAULTS, predict, TREE_DEFAULTS, type LinearParams, type TreeParams } from '../../ml/models'
import type { Algo, TrainOutput } from '../../ml/train'
import { useStore } from '../../state/store'
import { Button, Segmented, Select } from '../primitives'
import { ScatterChart } from '../charts/kit'

type Preset = 'quick' | 'balanced' | 'thorough'
const TREE_PRESETS: Record<Preset, TreeParams> = {
  quick: { ...TREE_DEFAULTS, trees: 100, learningRate: 0.2, maxDepth: 3 },
  balanced: TREE_DEFAULTS,
  thorough: { ...TREE_DEFAULTS, trees: 800, learningRate: 0.05, maxDepth: 5 },
}
const LINEAR_PRESETS: Record<Preset, LinearParams> = {
  quick: { ...LINEAR_DEFAULTS, lambda: 0.1 },
  balanced: LINEAR_DEFAULTS,
  thorough: { ...LINEAR_DEFAULTS, lambda: 10 },
}

interface Run {
  id: number
  tableId: string
  algo: Algo
  task: Task
  target: string
  classes: string[]
  out: TrainOutput
  enc: Encoder
  standardize: boolean
  featureIds: string[]
  train: number
  test: number
  dropped: number
  summary: string
}

interface MLState {
  tableId?: string
  targetId?: string
  task: Task
  chosen: Record<string, string[]>
  algo: Algo
  preset: Preset
  trees: TreeParams
  linear: LinearParams
  testShare: number
  how: 'random' | 'latest'
  seed: number
  progress: number | null
  runs: Run[]
  shown?: number
  set: (p: Partial<MLState>) => void
}

const useML = create<MLState>((set) => ({
  task: 'classification',
  chosen: {},
  algo: 'trees',
  preset: 'balanced',
  trees: TREE_DEFAULTS,
  linear: LINEAR_DEFAULTS,
  testShare: 0.2,
  how: 'random',
  seed: 42,
  progress: null,
  runs: [],
  set,
}))

let runId = 1

/** IDs with a different value on almost every row teach a model nothing; leave them out by default. */
function useful(s: Source, rows: number) {
  const k = kindOf(s.column)
  return !(k === 'category' && s.column.profile.distinct > Math.max(50, rows * 0.5))
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

function Section({ n, title, children, aside }: { n: number; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4">
      <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
        <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] text-bg tabular">{n}</span>
        <span className="flex-1">{title}</span>
        {aside}
      </h3>
      {children}
    </section>
  )
}

function Param({ label, hint, value, min, max, step, onChange, show }: { label: string; hint: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; show?: (v: number) => string }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-[12.5px]">
        <span className="font-medium">{label}</span>
        <span className="font-semibold tabular">{show ? show(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--accent)]" />
      <span className="block text-[11px] leading-snug text-faint">{hint}</span>
    </label>
  )
}

const KIND_ICON = { number: Hash, category: Tag, date: Calendar }

export function MLWorkspace() {
  const tables = useStore((s) => s.tables)
  const links = useStore((s) => s.links)
  const st = useML()
  const table = tables.find((t) => t.id === st.tableId) ?? tables.find((t) => /customer/i.test(t.name)) ?? tables[0]
  const sources = useMemo(() => (table ? sourcesFor(table, tables, links) : []), [table, tables, links])
  if (!table) return null
  const target = sources.find((s) => s.id === st.targetId) ?? sources.find((s) => /churn|target|label|outcome/i.test(s.id)) ?? sources.at(-1)!
  const task = st.targetId === target.id ? st.task : suggestTask(target)
  const key = `${table.id}|${target.id}`
  const candidates = sources.filter((s) => s.id !== target.id)
  const chosen = st.chosen[key] ?? candidates.filter((s) => useful(s, table.rows.length)).map((s) => s.id)
  const setChosen = (ids: string[]) => st.set({ chosen: { ...st.chosen, [key]: ids } })
  const dateCol = table.columns.find((c) => c.role === 'date')
  const run = st.runs.find((r) => r.id === st.shown) ?? st.runs.at(-1)

  const train = async () => {
    const feats = candidates.filter((s) => chosen.includes(s.id))
    if (!feats.length) return useStore.getState().notify('error', 'Pick at least one column to predict from.')
    const di = dateCol ? table.columns.indexOf(dateCol) : -1
    const prep = prepare(target, task, table.rows.length, di >= 0 ? table.rows.map((r) => r[di]) : null, { testShare: st.testShare, how: st.how, seed: st.seed })
    if (typeof prep === 'string') return useStore.getState().notify('error', prep)
    const enc = fitEncoder(feats, prep.train)
    const standardize = st.algo === 'linear'
    const byId = new Map(feats.map((f) => [f.id, f]))
    const X = (rows: number[]) => rows.map((r) => encodeRow(enc, (id) => byId.get(id)!.values[r], standardize))
    st.set({ progress: 0 })
    try {
      const out = await trainInWorker(
        {
          algo: st.algo,
          task,
          classes: prep.classes,
          Xtrain: X(prep.train),
          ytrain: prep.train.map((r) => prep.y[r]),
          Xtest: X(prep.test),
          ytest: prep.test.map((r) => prep.y[r]),
          trees: st.trees,
          linear: st.linear,
          seed: st.seed,
        },
        (done, total) => useML.getState().set({ progress: done / total }),
      )
      const m = out.metrics
      const summary = m.task === 'classification' ? `${pct(m.accuracy)} right` : `R² ${pct(m.r2)}`
      const r: Run = {
        id: runId++,
        tableId: table.id,
        algo: st.algo,
        task,
        target: target.label,
        classes: prep.classes,
        out,
        enc,
        standardize,
        featureIds: feats.map((f) => f.id),
        train: prep.train.length,
        test: prep.test.length,
        dropped: prep.dropped,
        summary,
      }
      useML.getState().set({ runs: [...useML.getState().runs, r].slice(-8), shown: r.id, progress: null })
    } catch (err) {
      useML.getState().set({ progress: null })
      useStore.getState().notify('error', err instanceof Error ? err.message : 'Training failed')
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface">
        <Section n={1} title="What do you want to predict?">
          <div className="space-y-2.5">
            <Select value={table.id} onChange={(e) => st.set({ tableId: e.target.value, targetId: undefined })} className="w-full" aria-label="File">
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.rows.length.toLocaleString()} rows)
                </option>
              ))}
            </Select>
            <Select value={target.id} onChange={(e) => st.set({ targetId: e.target.value, task: suggestTask(sources.find((s) => s.id === e.target.value)!) })} className="w-full" aria-label="Column to predict">
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ['classification', 'A category', 'yes/no, type, group'],
                  ['regression', 'A number', 'amount, count, price'],
                ] as const
              ).map(([v, label, sub]) => (
                <button
                  key={v}
                  type="button"
                  disabled={v === 'regression' && target.column.type !== 'number'}
                  onClick={() => st.set({ targetId: target.id, task: v })}
                  className={clsx(
                    'press rounded-xl border px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40',
                    task === v ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
                  )}
                >
                  <span className="block text-[12.5px] font-semibold">{label}</span>
                  <span className="block text-[11px] text-muted">{sub}</span>
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section
          n={2}
          title="Predict it from"
          aside={
            <span className="flex gap-2 text-[11.5px] font-normal">
              <button type="button" className="text-accent hover:underline" onClick={() => setChosen(candidates.map((s) => s.id))}>
                All
              </button>
              <button type="button" className="text-accent hover:underline" onClick={() => setChosen([])}>
                None
              </button>
            </span>
          }
        >
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {candidates.map((s) => {
              const Icon = KIND_ICON[kindOf(s.column)]
              const on = chosen.includes(s.id)
              return (
                <li key={s.id}>
                  <label className={clsx('flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-surface-2', !on && 'text-muted')}>
                    <input type="checkbox" checked={on} onChange={() => setChosen(on ? chosen.filter((c) => c !== s.id) : [...chosen, s.id])} className="accent-[var(--accent)]" />
                    <Icon className="size-3.5 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    {s.via && <span className="rounded bg-surface-2 px-1 text-[10px] text-faint">linked</span>}
                  </label>
                </li>
              )
            })}
          </ul>
          <p className="mt-1.5 text-[11px] text-faint">IDs that differ on every row are left out, as they can’t teach a pattern. “Linked” columns come from connected files.</p>
        </Section>

        <Section n={3} title="Choose a model">
          <div className="space-y-1.5">
            {(
              [
                ['trees', Trees, 'Boosted trees (XGBoost)', 'Usually the most accurate. Finds patterns like “only when both are high”.'],
                ['linear', TrendingUp, task === 'classification' ? 'Logistic regression' : 'Linear regression', 'Simple and easy to explain: each column pushes the result up or down.'],
              ] as const
            ).map(([v, Icon, label, sub]) => (
              <button
                key={v}
                type="button"
                onClick={() => st.set({ algo: v })}
                className={clsx('press flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left', st.algo === v ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2')}
              >
                <Icon className={clsx('mt-0.5 size-4 shrink-0', st.algo === v ? 'text-accent' : 'text-faint')} />
                <span>
                  <span className="block text-[13px] font-semibold">{label}</span>
                  <span className="block text-[11.5px] leading-snug text-muted">{sub}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3">
            <span className="mb-1 block text-[12px] text-muted">{st.algo === 'trees' ? 'How hard to train' : 'How simple to keep it'}</span>
            <Segmented
              size="sm"
              value={st.preset}
              onChange={(p) => st.set({ preset: p, trees: TREE_PRESETS[p], linear: LINEAR_PRESETS[p] })}
              options={
                st.algo === 'trees'
                  ? [
                      { value: 'quick', label: 'Quick' },
                      { value: 'balanced', label: 'Balanced' },
                      { value: 'thorough', label: 'Thorough' },
                    ]
                  : [
                      { value: 'quick', label: 'Flexible' },
                      { value: 'balanced', label: 'Balanced' },
                      { value: 'thorough', label: 'Simple' },
                    ]
              }
            />
          </div>
          <details className="group mt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-accent">
              <ChevronDown className="size-3.5 -rotate-90 transition-transform group-open:rotate-0" /> Custom settings
            </summary>
            <div className="mt-3 space-y-3.5">
              {st.algo === 'trees' ? (
                <>
                  <Param label="Number of trees" hint="More trees learn more, but take longer. Training stops early once more trees stop helping." value={st.trees.trees} min={20} max={1500} step={10} onChange={(v) => st.set({ trees: { ...st.trees, trees: v } })} />
                  <Param label="Learning speed" hint="Smaller is slower but often more accurate (learning rate)." value={st.trees.learningRate} min={0.01} max={0.5} step={0.01} onChange={(v) => st.set({ trees: { ...st.trees, learningRate: v } })} />
                  <Param label="Tree depth" hint="How many questions each tree may ask in a row. Deeper finds subtler patterns but can memorise noise." value={st.trees.maxDepth} min={1} max={10} step={1} onChange={(v) => st.set({ trees: { ...st.trees, maxDepth: v } })} />
                  <Param label="Smallest group" hint="Minimum weight of rows in a leaf (min child weight). Higher is more cautious." value={st.trees.minChildWeight} min={0} max={30} step={1} onChange={(v) => st.set({ trees: { ...st.trees, minChildWeight: v } })} />
                  <Param label="Rows per tree" hint="Share of rows each tree sees (subsample). Below 100% reduces over-fitting." value={st.trees.subsample} min={0.3} max={1} step={0.05} show={pct} onChange={(v) => st.set({ trees: { ...st.trees, subsample: v } })} />
                  <Param label="Columns per tree" hint="Share of columns each tree may use (colsample)." value={st.trees.colsample} min={0.3} max={1} step={0.05} show={pct} onChange={(v) => st.set({ trees: { ...st.trees, colsample: v } })} />
                  <Param label="Caution (L2)" hint="Shrinks each tree’s answers toward zero (lambda). Higher is more cautious." value={st.trees.lambda} min={0} max={20} step={0.5} onChange={(v) => st.set({ trees: { ...st.trees, lambda: v } })} />
                  <label className="flex items-center gap-2 text-[12.5px]">
                    <input type="checkbox" checked={st.trees.earlyStop} onChange={(e) => st.set({ trees: { ...st.trees, earlyStop: e.target.checked } })} className="accent-[var(--accent)]" />
                    Stop early when it stops improving
                  </label>
                </>
              ) : (
                <>
                  <Param label="Keep it simple" hint="Regularisation (L2). Higher keeps effects small and steady; lower lets the model fit closer." value={st.linear.lambda} min={0} max={50} step={0.1} onChange={(v) => st.set({ linear: { ...st.linear, lambda: v } })} />
                  {task === 'classification' && (
                    <>
                      <Param label="Training steps" hint="How long to keep improving the fit." value={st.linear.steps} min={50} max={2000} step={50} onChange={(v) => st.set({ linear: { ...st.linear, steps: v } })} />
                      <label className="flex items-center gap-2 text-[12.5px]">
                        <input type="checkbox" checked={st.linear.balance} onChange={(e) => st.set({ linear: { ...st.linear, balance: e.target.checked } })} className="accent-[var(--accent)]" />
                        Treat rare categories as equally important
                      </label>
                    </>
                  )}
                </>
              )}
              <div className="border-t border-line pt-3">
                <Param label="Rows kept for testing" hint="The model never sees these while learning, so the score shows how it does on new data." value={st.testShare} min={0.1} max={0.4} step={0.05} show={pct} onChange={(v) => st.set({ testShare: v })} />
                {dateCol && (
                  <div className="mt-2">
                    <Segmented
                      size="sm"
                      value={st.how}
                      onChange={(how) => st.set({ how })}
                      options={[
                        { value: 'random', label: 'Random rows' },
                        { value: 'latest', label: 'Most recent rows' },
                      ]}
                    />
                  </div>
                )}
              </div>
              <button type="button" onClick={() => st.set({ trees: TREE_PRESETS[st.preset], linear: LINEAR_PRESETS[st.preset], testShare: 0.2, how: 'random' })} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink">
                <RotateCcw className="size-3" /> Reset to defaults
              </button>
            </div>
          </details>
        </Section>

        <div className="sticky bottom-0 mt-auto border-t border-line bg-surface p-4">
          {st.progress !== null ? (
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-[13px] font-medium">
                <Loader2 className="size-4 animate-spin text-accent" /> Training… {Math.round(st.progress * 100)}%
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${st.progress * 100}%`, transition: 'width 120ms linear' }} />
              </div>
            </div>
          ) : (
            <Button variant="primary" className="h-11 w-full text-[15px]" onClick={() => void train()} disabled={!chosen.length}>
              <Play className="size-4" /> Train model
            </Button>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        {run ? (
          <Results run={run} table={tables.find((t) => t.id === run.tableId) ?? table} sources={sources} />
        ) : (
          <Empty target={target.label} task={task} />
        )}
      </main>
    </div>
  )
}

function Empty({ target, task }: { target: string; task: Task }) {
  return (
    <div className="mx-auto grid max-w-xl place-items-center pt-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <BrainCircuit className="size-7" />
      </span>
      <h1 className="font-display mt-5 text-[26px]">Teach a model to predict {target}</h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
        It learns from the rows where you already know the {task === 'classification' ? 'answer' : 'number'}, then tests itself on rows it has never seen. The settings on the left are ready
        to go: press <b>Train model</b>.
      </p>
    </div>
  )
}

function grade(run: Run): { label: string; tone: 'up' | 'warn' | 'down' } {
  const m = run.out.metrics
  let s: number
  if (m.task === 'regression') s = m.r2 >= 0.8 ? 3 : m.r2 >= 0.6 ? 2 : m.r2 >= 0.3 ? 1 : 0
  else if (m.auc !== undefined) s = m.auc >= 0.9 ? 3 : m.auc >= 0.8 ? 2 : m.auc >= 0.7 ? 1 : 0
  else {
    const lift = (m.accuracy - m.baseline) / Math.max(1e-9, 1 - m.baseline)
    s = lift >= 0.6 ? 3 : lift >= 0.4 ? 2 : lift >= 0.2 ? 1 : 0
  }
  return [
    { label: 'Weak', tone: 'down' as const },
    { label: 'Fair', tone: 'warn' as const },
    { label: 'Good', tone: 'up' as const },
    { label: 'Excellent', tone: 'up' as const },
  ][s]
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5" title={hint}>
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className="font-display text-[19px] leading-tight">{value}</div>
      <div className="text-[11px] leading-snug text-faint">{hint}</div>
    </div>
  )
}

function Results({ run, table, sources }: { run: Run; table: Table; sources: Source[] }) {
  const st = useML()
  const m = run.out.metrics
  const g = grade(run)
  const algoName = run.algo === 'trees' ? 'Boosted trees' : run.task === 'classification' ? 'Logistic regression' : 'Linear regression'
  const targetCol = sources.find((s) => s.label === run.target)?.column
  const fmt = targetCol?.format === 'percent' ? ('percent' as const) : ('number' as const)

  // Importance per original column (one-hot pieces added back together).
  const imp = useMemo(() => {
    const per = new Map<number, number>()
    run.out.importance.forEach((v, j) => per.set(run.enc.owner[j], (per.get(run.enc.owner[j]) ?? 0) + v))
    const total = [...per.values()].reduce((a, b) => a + b, 0) || 1
    return [...per.entries()]
      .map(([fi, v]) => {
        const f = run.enc.features[fi]
        let dir: string | undefined
        if (run.out.coef && f.kind === 'number') {
          const c = run.out.coef[run.enc.names.indexOf(f.label)]
          const what = run.task === 'classification' ? `more likely “${run.classes[1]}”` : `higher ${run.target}`
          const less = run.task === 'classification' ? `less likely “${run.classes[1]}”` : `lower ${run.target}`
          dir = `Higher ${f.label} → ${c >= 0 ? what : less}`
        }
        return { label: f.label, share: v / total, dir }
      })
      .sort((a, b) => b.share - a.share)
      .slice(0, 10)
  }, [run])

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {st.runs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-muted">Your models:</span>
          {st.runs.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => st.set({ shown: r.id })}
              className={clsx('press rounded-full border px-2.5 py-1', r.id === run.id ? 'border-ink bg-ink text-bg' : 'border-line bg-surface hover:border-faint')}
            >
              {r.algo === 'trees' ? 'Boosted trees' : r.task === 'classification' ? 'Logistic' : 'Linear'}, {r.target}: <b>{r.summary}</b>
            </button>
          ))}
        </div>
      )}

      <section className="rounded-2xl bg-ink p-6 text-bg">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-bg/70">
          {algoName} predicting <b className="text-bg">{run.target}</b>
          <span className={clsx('rounded-full px-2 py-0.5 text-[11.5px] font-semibold text-white', g.tone === 'up' ? 'bg-up' : g.tone === 'warn' ? 'bg-warn' : 'bg-down')}>{g.label}</span>
        </div>
        {m.task === 'classification' ? (
          <>
            <p className="font-display mt-3 text-[30px] leading-tight">
              Right {pct(m.accuracy)} of the time on {run.test.toLocaleString()} rows it never saw.
            </p>
            <p className="mt-2 text-[14px] text-bg/75">
              Always guessing “{m.baselineClass}” would be right {pct(m.baseline)}.{' '}
              {m.accuracy > m.baseline ? `The model removes ${Math.round(((m.accuracy - m.baseline) / Math.max(1e-9, 1 - m.baseline)) * 100)}% of those mistakes.` : 'The model isn’t beating a plain guess yet: try other columns or the other model.'}
            </p>
          </>
        ) : (
          <>
            <p className="font-display mt-3 text-[30px] leading-tight">
              Off by about {formatValue(m.mae, fmt)} on average, on {run.test.toLocaleString()} rows it never saw.
            </p>
            <p className="mt-2 text-[14px] text-bg/75">
              It explains {pct(Math.max(0, m.r2))} of the differences in {run.target}. Always guessing the average would be off by {formatValue(m.baselineMae, fmt)}.
            </p>
          </>
        )}
        <p className="mt-3 text-[11.5px] text-bg/55">
          Learned from {run.train.toLocaleString()} rows{run.dropped ? `, skipped ${run.dropped.toLocaleString()} with no ${run.target}` : ''}
          {run.out.roundsUsed ? `, ${run.out.roundsUsed} trees` : ''}, in {(run.out.ms / 1000).toFixed(1)}s.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {m.task === 'classification' ? (
          <>
            <Tile label="Accuracy" value={pct(m.accuracy)} hint="Share of test rows predicted right" />
            <Tile label="Precision" value={pct(m.precision)} hint="When it says a category, how often it’s right" />
            <Tile label="Recall" value={pct(m.recall)} hint="Of each real category, how much it catches" />
            {m.auc !== undefined ? <Tile label="AUC" value={m.auc.toFixed(3)} hint="Ranking skill: 0.5 is a coin flip, 1 is perfect" /> : <Tile label="F1" value={pct(m.f1)} hint="Balance of precision and recall" />}
          </>
        ) : (
          <>
            <Tile label="R²" value={pct(m.r2)} hint="Share of differences explained (100% is perfect)" />
            <Tile label="Average error" value={formatValue(m.mae, fmt)} hint="Typical gap between prediction and truth (MAE)" />
            <Tile label="RMSE" value={formatValue(m.rmse, fmt)} hint="Like average error, but big misses count more" />
            <Tile label="Guessing error" value={formatValue(m.baselineMae, fmt)} hint="Error of always guessing the average" />
          </>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-[17px]">What matters most</h2>
          <p className="mt-0.5 text-[12px] text-muted">Share of the model’s decisions that rely on each column.</p>
          <ul className="mt-3 space-y-2.5">
            {imp.map((f) => (
              <li key={f.label}>
                <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="truncate font-medium">{f.label}</span>
                  <span className="font-semibold tabular">{pct(f.share)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-2">
                  <div className="h-2 rounded-full" style={{ width: `${Math.max(1, f.share * 100)}%`, background: 'var(--s1)' }} />
                </div>
                {f.dir && <div className="mt-0.5 text-[11px] text-muted">{f.dir}</div>}
              </li>
            ))}
          </ul>
        </section>

        {m.task === 'classification' ? (
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-display text-[17px]">Where it gets it right</h2>
            <p className="mt-0.5 text-[12px] text-muted">Test rows: the real answer (rows) against what the model said (columns).</p>
            <Confusion classes={run.classes} matrix={m.confusion} />
          </section>
        ) : (
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-display text-[17px]">Predicted against real</h2>
            <p className="mt-0.5 text-[12px] text-muted">Each dot is a test row. On the line means a perfect prediction.</p>
            <ScatterChart
              height={280}
              dots={run.out.testPred.map((p, i) => ({ x: p[0], y: actualOf(run, i) }))}
              groups={[{ name: run.target, color: 'var(--s1)' }]}
              line={{ at: (x) => x, band: (x) => [x, x] }}
              fmtX={fmt}
              fmtY={fmt}
              labelX={`Predicted ${run.target}`}
              labelY={`Real ${run.target}`}
            />
          </section>
        )}
      </div>

      <TryIt run={run} sources={sources} fmt={fmt} />

      <div className="flex justify-end">
        <Button onClick={() => downloadPredictions(run, table, sources)}>
          <Download className="size-4" /> Download predictions for every row (CSV)
        </Button>
      </div>
    </div>
  )
}

function actualOf(run: Run, i: number) {
  return run.out.testActual[i]
}

function Confusion({ classes, matrix }: { classes: string[]; matrix: number[][] }) {
  const max = Math.max(1, ...matrix.flat())
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="text-[12.5px] tabular">
        <thead>
          <tr>
            <th />
            {classes.map((c) => (
              <th key={c} className="px-2 pb-1.5 text-center font-medium text-muted">
                said “{c}”
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, a) => (
            <tr key={a}>
              <th className="pr-3 text-right font-medium whitespace-nowrap text-muted">really “{classes[a]}”</th>
              {row.map((v, p) => (
                <td key={p} className="p-0.5">
                  <div
                    className={clsx('grid h-12 min-w-16 place-items-center rounded-lg font-semibold', v / max > 0.5 ? 'text-white' : 'text-ink')}
                    style={{ background: `color-mix(in srgb, ${a === p ? 'var(--up)' : 'var(--down)'} ${Math.round(12 + (v / max) * 78)}%, var(--surface))` }}
                  >
                    {v.toLocaleString()}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11.5px] text-faint">Green squares are right answers, red are mistakes. Darker means more rows.</p>
    </div>
  )
}

function TryIt({ run, sources, fmt }: { run: Run; sources: Source[]; fmt: 'percent' | 'number' }) {
  const [values, setValues] = useState<Record<string, Cell>>({})
  const feats = run.enc.features
  const get = (id: string): Cell => {
    if (id in values) return values[id]
    const f = feats.find((x) => x.id === id)!
    if (f.kind === 'number') return f.fill
    if (f.kind === 'category') return f.levels[0] ?? null
    const s = sources.find((x) => x.id === id)
    return (s?.values.find((v) => v !== null) as Cell) ?? null
  }
  const out = predict(run.out.model, encodeRow(run.enc, get, run.standardize))
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-display text-[17px]">Try a prediction</h2>
      <p className="mt-0.5 text-[12px] text-muted">Change any value to see what the model predicts for a new case. Values start at the most typical ones.</p>
      <div className="mt-4 grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {feats.map((f) => (
            <label key={f.id} className="block">
              <span className="mb-1 block truncate text-[12px] font-medium text-muted">{f.label}</span>
              {f.kind === 'category' ? (
                <Select value={String(get(f.id) ?? '')} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} className="w-full">
                  {f.levels.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              ) : f.kind === 'number' ? (
                <input
                  type="number"
                  value={String(get(f.id) ?? '')}
                  onChange={(e) => setValues({ ...values, [f.id]: e.target.value === '' ? null : Number(e.target.value) })}
                  className="h-8 w-full rounded-md border border-line bg-surface px-2 text-sm tabular"
                />
              ) : (
                <input type="date" value={String(get(f.id) ?? '').slice(0, 10)} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} className="h-8 w-full rounded-md border border-line bg-surface px-2 text-sm" />
              )}
            </label>
          ))}
        </div>
        <div className="rounded-xl bg-surface-2 p-4">
          <div className="text-[12px] text-muted">The model predicts</div>
          {run.task === 'regression' ? (
            <div className="font-display mt-1 text-[32px]">{formatValue(out[0], fmt)}</div>
          ) : (
            <>
              <div className="font-display mt-1 text-[28px]">{run.classes[out.indexOf(Math.max(...out))]}</div>
              <ul className="mt-3 space-y-2">
                {run.classes.map((c, i) => (
                  <li key={c}>
                    <div className="flex justify-between text-[12px]">
                      <span>{c}</span>
                      <span className="font-semibold tabular">{pct(out[i])}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-surface">
                      <div className="h-2 rounded-full" style={{ width: `${out[i] * 100}%`, background: 'var(--s1)', transition: 'width 200ms var(--ease-out)' }} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" onClick={() => setValues({})} className="mt-3 inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink">
            <RotateCcw className="size-3" /> Back to typical values
          </button>
        </div>
      </div>
    </section>
  )
}

function csvCell(v: Cell | string) {
  const s = v === null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadPredictions(run: Run, table: Table, sources: Source[]) {
  const byId = new Map(sources.map((s) => [s.id, s]))
  const head = [...table.columns.map((c) => c.name), `predicted ${run.target}`, ...(run.task === 'classification' ? run.classes.map((c) => `chance of ${c}`) : [])]
  const lines = [head.map(csvCell).join(',')]
  table.rows.forEach((row, r) => {
    const p = predict(run.out.model, encodeRow(run.enc, (id) => byId.get(id)?.values[r] ?? null, run.standardize))
    const extra = run.task === 'classification' ? [run.classes[p.indexOf(Math.max(...p))], ...p.map((v) => v.toFixed(4))] : [p[0].toFixed(4)]
    lines.push([...row.map(csvCell), ...extra].join(','))
  })
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${table.name.replace(/[^\w-]+/g, '_')}_predictions.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
