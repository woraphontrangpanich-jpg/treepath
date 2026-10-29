import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { clsx } from 'clsx'
import { ChevronDown, Copy, Download, FilePlus2, Info, LayoutDashboard, PanelTopOpen, ListTree, Maximize, Sparkles, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Grain } from '../../data/types'
import { useStore } from '../../state/store'
import { activeTree, exportTreeFile, parseTreeFile, useTrees } from '../../state/trees'
import { layoutTree, withAutoLayout } from '../../tree/layout'
import { buildSampleTree, hasSampleTables } from '../../tree/sample'
import type { Tree } from '../../tree/types'
import { Badge, Button, Segmented } from '../primitives'
import { Canvas } from './Canvas'
import { Inspector } from './Inspector'
import { Library } from './Library'
import { useTreeModel } from './useTreeModel'

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function TreeMenu({ tree }: { tree: Tree }) {
  const trees = useTrees((s) => s.trees)
  const { openTree, newTree, duplicateTree, deleteTree, importTree } = useTrees.getState()
  const tables = useStore((s) => s.tables)
  const notify = useStore((s) => s.notify)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const item = 'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-2'
  const act = (fn: () => void) => () => {
    fn()
    setOpen(false)
  }

  return (
    <div ref={box} className="relative">
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            importTree(parseTreeFile(await f.text()))
            notify('info', `Imported ${f.name}`)
          } catch (err) {
            notify('error', `${f.name}: ${err instanceof Error ? err.message : 'could not be read'}`)
          }
        }}
      />
      <Button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ListTree className="size-4" />
        Trees
        <ChevronDown className="size-3.5 text-faint" />
      </Button>
      {open && (
        <div className="popover absolute top-full left-0 z-30 mt-1.5 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-[0_16px_40px_-16px_rgb(23_35_56/0.4)]">
          <div className="max-h-60 overflow-y-auto">
            {trees.map((t) => (
              <button key={t.id} type="button" onClick={act(() => openTree(t.id))} className={clsx(item, t.id === tree.id && 'bg-accent-soft')}>
                <span className="flex-1 truncate">{t.name}</span>
                <span className="text-xs text-faint">{t.nodes.length}</span>
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-line" />
          <button type="button" onClick={act(() => newTree())} className={item}>
            <FilePlus2 className="size-4 text-faint" />
            New Blank Tree
          </button>
          {hasSampleTables(tables) && (
            <button type="button" onClick={act(() => void withAutoLayout(buildSampleTree(tables)!).then(newTree))} className={item}>
              <Sparkles className="size-4 text-faint" />
              New From Sample
            </button>
          )}
          <button type="button" onClick={act(() => duplicateTree(tree.id))} className={item}>
            <Copy className="size-4 text-faint" />
            Duplicate Tree
          </button>
          <div className="my-1 border-t border-line" />
          <button type="button" onClick={act(() => file.current?.click())} className={item}>
            <Upload className="size-4 text-faint" />
            Import Tree File…
          </button>
          <button
            type="button"
            onClick={act(() => download(`${tree.name.replace(/[^\w-]+/g, '_') || 'tree'}.treepath.json`, JSON.stringify(exportTreeFile(tree), null, 2)))}
            className={item}
          >
            <Download className="size-4 text-faint" />
            Export Tree File
          </button>
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            onClick={act(() => {
              if (confirm(`Delete "${tree.name}"? This can't be undone.`)) deleteTree(tree.id)
            })}
            className={clsx(item, 'text-down hover:bg-down-soft')}
          >
            <Trash2 className="size-4" />
            Delete Tree
          </button>
        </div>
      )}
    </div>
  )
}

function Toolbar({ tree, errorCount }: { tree: Tree; errorCount: number }) {
  const { renameTree, setGrain, applyPositions, toggleLegend } = useTrees.getState()
  const showLegend = useTrees((s) => s.showLegend)
  const detailsAll = useTrees((s) => s.detailsAll)
  const setDetailsAll = useTrees((s) => s.setDetailsAll)
  const { fitView, getNodes } = useReactFlow()
  const [busy, setBusy] = useState(false)

  const autoLayout = async () => {
    setBusy(true)
    try {
      const sizes = new Map(getNodes().map((n) => [n.id, { width: n.measured?.width ?? 236, height: n.measured?.height ?? 120 }]))
      applyPositions(await layoutTree(tree.nodes, tree.edges, sizes))
      requestAnimationFrame(() => fitView({ padding: 0.15, duration: 400 }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <TreeMenu tree={tree} />
      <input
        value={tree.name}
        onChange={(e) => renameTree(e.target.value)}
        aria-label="Tree name"
        name="tree-name"
        autoComplete="off"
        className="min-w-32 flex-1 rounded-md bg-transparent px-1.5 py-1 text-[15px] font-semibold outline-none hover:bg-surface-2 focus:bg-surface-2"
      />
      {errorCount > 0 && <Badge tone="down">{errorCount} error{errorCount > 1 ? 's' : ''}</Badge>}
      <Segmented<Grain>
        size="sm"
        value={tree.grain}
        onChange={setGrain}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />
      <Button size="sm" onClick={() => void autoLayout()} disabled={busy || tree.nodes.length === 0} title="Arrange cards: inputs below, outcome on top">
        <LayoutDashboard className="size-3.5" />
        <span className="hidden xl:inline">Tidy Up</span>
      </Button>
      <Button
        size="sm"
        variant={detailsAll ? 'secondary' : 'ghost'}
        onClick={() => setDetailsAll(!detailsAll)}
        aria-pressed={detailsAll}
        title={detailsAll ? 'Hide details on every card' : 'Show details on every card'}
      >
        <PanelTopOpen className="size-3.5" />
        <span className="hidden xl:inline">{detailsAll ? 'Hide Details' : 'Show Details'}</span>
      </Button>
      <Button size="sm" variant="ghost" onClick={() => fitView({ padding: 0.15, duration: 300 })} title="Fit to screen" aria-label="Fit to screen">
        <Maximize className="size-3.5" />
      </Button>
      <Button size="sm" variant={showLegend ? 'secondary' : 'ghost'} onClick={toggleLegend} title="Show or hide the link legend" aria-label="Toggle legend" aria-pressed={showLegend}>
        <Info className="size-3.5" />
      </Button>
    </div>
  )
}

function Editor({ tree }: { tree: Tree }) {
  const model = useTreeModel(tree)
  const errors = model.issues.filter((i) => i.level === 'error').length
  return (
    <div className="flex min-h-0 flex-1">
      <Library tree={tree} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar tree={tree} errorCount={errors} />
        <div className="contour relative min-h-0 flex-1">
          <Canvas tree={tree} model={model} />
        </div>
      </div>
      <Inspector tree={tree} model={model} />
    </div>
  )
}

export function StartTree() {
  const tables = useStore((s) => s.tables)
  const newTree = useTrees((s) => s.newTree)
  const sample = hasSampleTables(tables)
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Start a Tree</h1>
        <p className="mt-2 text-sm text-muted">A tree shows how your inputs add up to one outcome. Formulas give exact maths; other links are learned from your history.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            disabled={!sample}
            onClick={() => void withAutoLayout(buildSampleTree(tables)!).then(newTree)}
            className="rounded-2xl border border-line bg-surface p-5 text-left hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="size-5 text-accent" />
            <div className="mt-3 font-semibold">Net Revenue sample</div>
            <p className="mt-1 text-sm text-muted">
              {sample ? 'A finished tree on the sample data: formulas, costs and effects learned from history.' : 'Load the sample data in the Data tab first.'}
            </p>
          </button>
          <button type="button" onClick={() => newTree()} className="rounded-2xl border border-line bg-surface p-5 text-left hover:border-accent">
            <FilePlus2 className="size-5 text-accent" />
            <div className="mt-3 font-semibold">Blank tree</div>
            <p className="mt-1 text-sm text-muted">Start empty and drag in metrics from your own files.</p>
          </button>
        </div>
      </div>
    </div>
  )
}

export function BuildWorkspace() {
  const hydrated = useTrees((s) => s.hydrated)
  const tree = useTrees(activeTree)
  if (!hydrated) return null
  if (!tree) return <StartTree />
  return (
    <ReactFlowProvider key={tree.id}>
      <Editor tree={tree} />
    </ReactFlowProvider>
  )
}
