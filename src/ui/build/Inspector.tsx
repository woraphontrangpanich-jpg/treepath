import { clsx } from 'clsx'
import { AlertCircle, AlertTriangle, ArrowUp, Plus, Target, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Aggregation, Table } from '../../data/types'
import { formatValue, plural } from '../../lib/format'
import { useStore } from '../../state/store'
import { useTrees } from '../../state/trees'
import { resolveTable } from '../../tree/compute'
import { findByLabel, tryParse } from '../../tree/graph'
import { MANUAL_ROLES, ROLES } from '../../tree/roles'
import { kindOf, type BindingFilter, type EdgeRole, type MetricBinding, type NodeFormat, type Tree, type TreeNode } from '../../tree/types'
import { Badge, Button, Segmented, Select } from '../primitives'
import type { TreeModel } from './useTreeModel'

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] leading-4 text-faint">{hint}</span>}
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-line px-4 py-4">
      <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">{title}</h3>
      {children}
    </section>
  )
}

const inputCls = 'h-8 w-full rounded-md border border-line bg-surface px-2 text-sm outline-none focus:border-accent'

export function Inspector({ tree, model }: { tree: Tree; model: TreeModel }) {
  const selection = useTrees((s) => s.selection)
  const node = selection?.kind === 'node' ? tree.nodes.find((n) => n.id === selection.id) : undefined
  const edge = selection?.kind === 'edge' ? tree.edges.find((e) => e.id === selection.id) : undefined
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-line bg-surface">
      {node ? (
        <NodeInspector key={node.id} tree={tree} node={node} model={model} />
      ) : edge ? (
        <EdgeInspector key={edge.id} tree={tree} edgeId={edge.id} />
      ) : (
        <TreeOverview tree={tree} model={model} />
      )}
    </aside>
  )
}

function TreeOverview({ tree, model }: { tree: Tree; model: TreeModel }) {
  const { setOutcome, select } = useTrees.getState()
  const errors = model.issues.filter((i) => i.level === 'error')
  const outcome = tree.nodes.find((n) => n.id === tree.outcomeId)
  const outcomeSummary = outcome && model.summaries.get(outcome.id)
  return (
    <>
      <div className="px-4 py-4">
        <h2 className="text-[11px] font-semibold tracking-wider text-muted uppercase">Tree</h2>
        <p className="mt-1 text-sm text-muted">
          {plural(tree.nodes.length, 'card')} · {plural(tree.edges.length, 'link')} ·{' '}
          {plural(tree.edges.filter((e) => e.role === 'driver').length, 'model driver')}
        </p>
      </div>
      <Section title="Outcome">
        <Select value={tree.outcomeId ?? ''} onChange={(e) => setOutcome(e.target.value || undefined)} className="w-full">
          <option value="">Choose the outcome…</option>
          {tree.nodes
            .filter((n) => kindOf(n) !== 'note')
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
        </Select>
        {outcome && outcomeSummary && (
          <div className="rounded-lg bg-accent-soft px-3 py-2">
            <div className="text-xs text-muted">Latest {tree.grain}</div>
            <div className="font-mono text-2xl tabular">{formatValue(outcomeSummary.latest?.value, model.series.byNode.get(outcome.id)?.format)}</div>
          </div>
        )}
        <p className="text-[11px] leading-4 text-faint">The outcome is the target Scenario will estimate, e.g. Revenue or Profit.</p>
      </Section>
      <Section title={`Checks${model.issues.length ? ` · ${model.issues.length}` : ''}`}>
        {model.issues.length === 0 ? (
          <p className="text-sm text-up">No problems found.</p>
        ) : (
          <ul className="space-y-1.5">
            {model.issues.map((i, k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => (i.nodeId ? select({ kind: 'node', id: i.nodeId }) : i.edgeId ? select({ kind: 'edge', id: i.edgeId }) : undefined)}
                  className={clsx(
                    'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs',
                    i.level === 'error' ? 'bg-down-soft' : 'bg-warn-soft',
                  )}
                >
                  {i.level === 'error' ? <AlertCircle className="mt-px size-3.5 shrink-0 text-down" /> : <AlertTriangle className="mt-px size-3.5 shrink-0 text-warn" />}
                  {i.message}
                </button>
              </li>
            ))}
          </ul>
        )}
        {errors.length > 0 && <p className="text-[11px] text-faint">Scenario needs these errors fixed first.</p>}
      </Section>
      <Section title="How to build">
        <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted">
          <li>Drag metrics from the library, or add a Formula card.</li>
          <li>Drag from a card&apos;s top dot to the bottom of the card it drives. New links between metrics default to Model driver.</li>
          <li>Formula links appear automatically from <span className="font-mono">[Card Name]</span> references.</li>
          <li>Select a card or link to edit it. Press Delete to remove it.</li>
        </ul>
      </Section>
    </>
  )
}

function NodeInspector({ tree, node, model }: { tree: Tree; node: TreeNode; model: TreeModel }) {
  const { updateNode, removeNodes, setOutcome } = useTrees.getState()
  const tables = useStore((s) => s.tables)
  const [label, setLabel] = useState(node.label)
  useEffect(() => setLabel(node.label), [node.label])
  const kind = kindOf(node)
  const series = model.series.byNode.get(node.id)
  const summary = model.summaries.get(node.id)
  const nodeIssues = model.issues.filter((i) => i.nodeId === node.id)

  const commitLabel = () => {
    const v = label.trim()
    if (!v) setLabel(node.label)
    else if (v !== node.label) updateNode(node.id, { label: v })
  }

  const setKind = (k: string) => {
    if (k === kind) return
    if (k === 'formula') updateNode(node.id, { formula: '', note: undefined })
    else if (k === 'metric') updateNode(node.id, { formula: undefined, note: undefined, metric: node.metric ?? defaultBinding(tables) })
    else updateNode(node.id, { formula: undefined, metric: undefined, note: node.note ?? '' })
  }

  return (
    <>
      <div className="space-y-3 px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold tracking-wider text-muted uppercase">Card</h2>
          {tree.outcomeId === node.id && (
            <Badge tone="accent">
              <Target className="size-3" />
              Outcome
            </Badge>
          )}
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Card name"
          className="w-full rounded-md border border-transparent bg-transparent px-1 text-lg font-semibold outline-none hover:border-line focus:border-accent"
        />
        <Segmented
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'metric', label: 'Metric' },
            { value: 'formula', label: 'Formula' },
            { value: 'note', label: 'Note' },
          ]}
        />
        {nodeIssues.map((i, k) => (
          <p key={k} className={clsx('rounded-lg px-2.5 py-2 text-xs', i.level === 'error' ? 'bg-down-soft' : 'bg-warn-soft')}>
            {i.message}
          </p>
        ))}
      </div>

      {kind === 'formula' && <FormulaEditor tree={tree} node={node} />}

      {kind !== 'note' && (
        <Section title={kind === 'formula' ? 'Compare with actual data (optional)' : 'Data'}>
          {kind === 'formula' && !node.metric ? (
            <Button size="sm" onClick={() => updateNode(node.id, { metric: defaultBinding(tables) })}>
              <Plus className="size-3.5" />
              Bind an actual column
            </Button>
          ) : (
            <BindingEditor
              binding={node.metric}
              onChange={(metric) => updateNode(node.id, { metric })}
              onRemove={kind === 'formula' ? () => updateNode(node.id, { metric: undefined }) : undefined}
            />
          )}
          {kind === 'formula' && (
            <p className="text-[11px] leading-4 text-faint">Shows the gap between the formula result and the reported number.</p>
          )}
        </Section>
      )}

      {kind === 'note' && (
        <Section title="Note">
          <textarea
            value={node.note ?? ''}
            onChange={(e) => updateNode(node.id, { note: e.target.value })}
            rows={5}
            className="w-full rounded-md border border-line bg-surface p-2 text-sm outline-none focus:border-accent"
            placeholder="Context, assumptions, strategy…"
          />
        </Section>
      )}

      {kind !== 'note' && (
        <Section title="Values">
          {series?.error ? (
            <p className="text-sm text-down">{series.error}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted">Latest</dt>
              <dd className="text-right font-mono tabular">{formatValue(summary?.latest?.value, series?.format)}</dd>
              <dt className="text-muted">Previous</dt>
              <dd className="text-right font-mono tabular">{formatValue(summary?.previous?.value, series?.format)}</dd>
              <dt className="text-muted">Mean of last 28</dt>
              <dd className="text-right font-mono tabular">{formatValue(summary?.recentMean, series?.format)}</dd>
              <dt className="text-muted">History</dt>
              <dd className="text-right text-xs text-muted tabular">
                {series?.points.length ?? 0} {tree.grain}s{series?.points[0] && <> from {series.points[0].date}</>}
              </dd>
              {summary?.gap !== null && summary?.gap !== undefined && (
                <>
                  <dt className="text-muted">Gap vs actual</dt>
                  <dd className="text-right font-mono tabular">{formatValue(summary.gap, series?.format)}</dd>
                </>
              )}
            </dl>
          )}
          <Field label="Display as">
            <Select value={node.format ?? 'number'} onChange={(e) => updateNode(node.id, { format: e.target.value as NodeFormat })} className="w-full">
              <option value="number">Number</option>
              <option value="percent">Percent</option>
              <option value="currency">Currency</option>
            </Select>
          </Field>
        </Section>
      )}

      <div className="mt-auto flex gap-2 border-t border-line p-4">
        {kind !== 'note' && (
          <Button size="sm" onClick={() => setOutcome(tree.outcomeId === node.id ? undefined : node.id)} className="flex-1">
            <Target className="size-3.5" />
            {tree.outcomeId === node.id ? 'Unset outcome' : 'Set as outcome'}
          </Button>
        )}
        <Button size="sm" variant="danger" onClick={() => removeNodes([node.id])}>
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </div>
    </>
  )
}

function defaultBinding(tables: Table[]): MetricBinding | undefined {
  for (const t of tables) {
    const c = t.columns.find((x) => x.role === 'metric')
    if (c) return { tableId: t.id, fileName: t.fileName, sheetName: t.sheetName, column: c.name, aggregation: c.aggregation }
  }
  return undefined
}

function FormulaEditor({ tree, node }: { tree: Tree; node: TreeNode }) {
  const updateNode = useTrees((s) => s.updateNode)
  const ref = useRef<HTMLTextAreaElement>(null)
  const formula = node.formula ?? ''
  const parsed = formula.trim() ? tryParse(formula) : null
  const others = tree.nodes.filter((n) => n.id !== node.id && kindOf(n) !== 'note')

  const insert = (text: string) => {
    const el = ref.current
    const start = el?.selectionStart ?? formula.length
    const end = el?.selectionEnd ?? formula.length
    const before = formula.slice(0, start)
    const pad = before && !/[\s(]$/.test(before) ? ' ' : ''
    const next = `${before}${pad}${text}${formula.slice(end)}`
    updateNode(node.id, { formula: next })
    requestAnimationFrame(() => {
      el?.focus()
      const pos = start + pad.length + text.length
      el?.setSelectionRange(pos, pos)
    })
  }

  return (
    <Section title="Formula">
      <div className="flex items-start gap-1.5 font-mono text-sm">
        <span className="pt-2 text-faint">=</span>
        <textarea
          ref={ref}
          value={formula}
          onChange={(e) => updateNode(node.id, { formula: e.target.value })}
          rows={3}
          spellCheck={false}
          placeholder="[Orders] * [Realized Price]"
          className={clsx(
            'w-full rounded-md border bg-surface p-2 text-[13px] leading-5 outline-none',
            parsed && !parsed.ok ? 'border-down' : 'border-line focus:border-accent',
          )}
        />
      </div>
      {parsed && !parsed.ok && (
        <p className="text-xs text-down">
          {parsed.error} <span className="text-faint">(at character {parsed.pos + 1})</span>
        </p>
      )}
      {parsed?.ok &&
        (() => {
          const unknown = parsed.refs.filter((r) => !findByLabel(tree.nodes, r))
          return unknown.length ? (
            <p className="text-xs text-down">No card named {unknown.map((u) => `"${u}"`).join(', ')}. Add it, or fix the spelling.</p>
          ) : (
            <p className="text-xs text-up">Valid · {plural(parsed.refs.length, 'input')}</p>
          )
        })()}
      <div>
        <div className="mb-1.5 text-[11px] text-faint">Insert a card</div>
        <div className="flex flex-wrap gap-1">
          {others.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => insert(`[${n.label}]`)}
              className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] ring-1 ring-line hover:ring-accent"
            >
              {n.label}
            </button>
          ))}
          {['+', '−', '×', '÷', '(', ')'].map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => insert(op === '−' ? '- ' : op === '×' ? '* ' : op === '÷' ? '/ ' : op)}
              className="w-6 rounded-md bg-surface-2 py-0.5 font-mono text-[11px] ring-1 ring-line hover:ring-accent"
            >
              {op}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] leading-4 text-faint">
        Use <span className="font-mono">[Card Name]</span>, numbers, + − × ÷ ^ and min, max, abs, ln, exp, sqrt, round. Subtracted inputs show as cost
        deductions.
      </p>
    </Section>
  )
}

const AGGS: Aggregation[] = ['sum', 'avg', 'min', 'max', 'last', 'count']

function BindingEditor({ binding, onChange, onRemove }: { binding?: MetricBinding; onChange: (b: MetricBinding) => void; onRemove?: () => void }) {
  const tables = useStore((s) => s.tables)
  const links = useStore((s) => s.links)
  const table = binding ? resolveTable(tables, binding) : undefined
  const metricTables = tables.filter((t) => t.columns.some((c) => c.role === 'metric'))

  // Filter columns: this table's keys/dimensions plus those of linked tables.
  const filterColumns = useMemo(() => {
    if (!table) return []
    const linked = links.flatMap((l) => (l.from.tableId === table.id ? [l.to.tableId] : l.to.tableId === table.id ? [l.from.tableId] : []))
    return [table, ...tables.filter((t) => linked.includes(t.id))].flatMap((t) =>
      t.columns
        .filter((c) => (c.role === 'key' || c.role === 'dimension') && c.profile.distinct <= 200)
        .map((c) => ({ table: t, column: c })),
    )
  }, [table, tables, links])

  if (!binding) return <p className="text-sm text-muted">Import a table with metric columns first.</p>

  const setTable = (id: string) => {
    const t = tables.find((x) => x.id === id)
    const c = t?.columns.find((x) => x.role === 'metric')
    if (t && c) onChange({ tableId: t.id, fileName: t.fileName, sheetName: t.sheetName, column: c.name, aggregation: c.aggregation })
  }
  const filters = binding.filters ?? []
  const setFilters = (f: BindingFilter[]) => onChange({ ...binding, filters: f })

  return (
    <div className="space-y-3">
      {!table && <p className="rounded-lg bg-down-soft px-2.5 py-2 text-xs">{binding.fileName} › {binding.sheetName} is not imported. Re-import it or pick another table.</p>}
      <Field label="Table">
        <Select value={table?.id ?? ''} onChange={(e) => setTable(e.target.value)} className="w-full">
          {!table && <option value="">(missing)</option>}
          {metricTables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Field label="Column">
          <Select
            value={binding.column}
            onChange={(e) => {
              const c = table?.columns.find((x) => x.name === e.target.value)
              onChange({ ...binding, column: e.target.value, aggregation: c?.aggregation ?? binding.aggregation })
            }}
            className="w-full"
          >
            {table?.columns
              .filter((c) => c.role === 'metric')
              .map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Combine">
          <Select value={binding.aggregation} onChange={(e) => onChange({ ...binding, aggregation: e.target.value as Aggregation })}>
            {AGGS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {filters.map((f, i) => {
        const fc = filterColumns.find((x) => x.table.id === f.tableId && x.column.name === f.column)
        const values = fc ? distinctValues(fc.table, f.column) : []
        return (
          <div key={i} className="rounded-lg border border-line p-2.5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">
                {fc && fc.table.id !== table?.id && <span className="text-faint">{fc.table.name} · </span>}
                {f.column}
              </span>
              <button type="button" onClick={() => setFilters(filters.filter((_, j) => j !== i))} className="text-faint hover:text-down" aria-label="Remove filter">
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
              {values.map((v) => {
                const on = f.values.includes(v)
                return (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => setFilters(filters.map((x, j) => (j !== i ? x : { ...x, values: on ? x.values.filter((y) => y !== v) : [...x.values, v] })))}
                    className={clsx('rounded-md px-1.5 py-0.5 text-[11px] ring-1', on ? 'bg-accent text-accent-ink ring-accent' : 'bg-surface-2 ring-line')}
                  >
                    {String(v)}
                  </button>
                )
              })}
            </div>
            {f.values.length === 0 && <p className="mt-1.5 text-[11px] text-faint">Pick values to include. None picked = no filter.</p>}
          </div>
        )
      })}
      {filterColumns.length > 0 && (
        <Select
          value=""
          onChange={(e) => {
            const [tableId, column] = JSON.parse(e.target.value) as [string, string]
            setFilters([...filters, { tableId, column, values: [] }])
          }}
          className="w-full text-xs"
        >
          <option value="">+ Add filter…</option>
          {filterColumns.map(({ table: t, column: c }) => (
            <option key={`${t.id}|${c.name}`} value={JSON.stringify([t.id, c.name])}>
              {t.id === table?.id ? c.name : `${t.name} · ${c.name} (linked)`}
            </option>
          ))}
        </Select>
      )}
      {onRemove && (
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Remove data binding
        </Button>
      )}
    </div>
  )
}

function distinctValues(t: Table, column: string) {
  const i = t.columns.findIndex((c) => c.name === column)
  const set = new Set<string | number | boolean>()
  for (const r of t.rows) if (r[i] !== null) set.add(r[i] as string | number | boolean)
  return [...set].sort((a, b) => String(a).localeCompare(String(b))).slice(0, 200)
}

function EdgeInspector({ tree, edgeId }: { tree: Tree; edgeId: string }) {
  const { updateEdge, removeEdges, select } = useTrees.getState()
  const edge = tree.edges.find((e) => e.id === edgeId)!
  const s = tree.nodes.find((n) => n.id === edge.source)
  const t = tree.nodes.find((n) => n.id === edge.target)
  const meta = ROLES[edge.role]
  return (
    <>
      <div className="space-y-3 px-4 py-4">
        <h2 className="text-[11px] font-semibold tracking-wider text-muted uppercase">Link</h2>
        <div className="space-y-1 text-sm">
          <button type="button" onClick={() => t && select({ kind: 'node', id: t.id })} className="block font-semibold hover:underline">
            {t?.label}
          </button>
          <div className="flex items-center gap-1.5 pl-1 text-xs" style={{ color: meta.color }}>
            <ArrowUp className="size-3.5" />
            {meta.label}
          </div>
          <button type="button" onClick={() => s && select({ kind: 'node', id: s.id })} className="block font-semibold hover:underline">
            {s?.label}
          </button>
        </div>
      </div>
      <Section title="Relationship">
        {meta.derived ? (
          <p className="text-sm text-muted">
            {meta.description} It comes from {t?.label}&apos;s formula; edit the formula to change it.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              {MANUAL_ROLES.map((r) => (
                <label key={r} className={clsx('flex cursor-pointer gap-2.5 rounded-lg border p-2.5', edge.role === r ? 'border-ink/40 bg-surface-2' : 'border-line')}>
                  <input type="radio" name="role" checked={edge.role === r} onChange={() => updateEdge(edge.id, { role: r as EdgeRole })} className="mt-0.5 accent-[var(--accent)]" />
                  <span>
                    <span className="block text-sm font-medium" style={{ color: ROLES[r].color }}>
                      {ROLES[r].label}
                    </span>
                    <span className="block text-[11px] leading-4 text-muted">{ROLES[r].description}</span>
                  </span>
                </label>
              ))}
            </div>
            {edge.role === 'driver' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Lag (${tree.grain}s)`} hint="Delay before the effect shows.">
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={edge.lag ?? 0}
                    onChange={(e) => updateEdge(edge.id, { lag: Math.max(0, Math.min(90, Number(e.target.value) || 0)) || undefined })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Expected direction" hint="Checked against the fit.">
                  <Select
                    value={edge.expectedSign ?? ''}
                    onChange={(e) => updateEdge(edge.id, { expectedSign: (e.target.value || undefined) as 'positive' | 'negative' | undefined })}
                    className="w-full"
                  >
                    <option value="">Unknown</option>
                    <option value="positive">Increases ↑</option>
                    <option value="negative">Decreases ↓</option>
                  </Select>
                </Field>
              </div>
            )}
          </>
        )}
        <Field label="Note">
          <textarea
            value={edge.note ?? ''}
            onChange={(e) => updateEdge(edge.id, { note: e.target.value || undefined })}
            rows={2}
            className="w-full rounded-md border border-line bg-surface p-2 text-sm outline-none focus:border-accent"
            placeholder="Why do you believe this?"
          />
        </Field>
      </Section>
      {!meta.derived && (
        <div className="mt-auto border-t border-line p-4">
          <Button size="sm" variant="danger" onClick={() => removeEdges([edge.id])}>
            <Trash2 className="size-3.5" />
            Delete link
          </Button>
        </div>
      )}
    </>
  )
}
