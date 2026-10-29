import { del, get, set } from 'idb-keyval'
import { create } from 'zustand'
import type { Column, Link, Table } from '../data/types'

export type Workspace = 'data' | 'build' | 'scenario'

const WORKSPACES: Workspace[] = ['data', 'build', 'scenario']

/** The URL hash holds the open tab, so links and reloads land on the same screen. */
function workspaceFromHash(): Workspace {
  const h = typeof location === 'undefined' ? '' : location.hash.replace('#', '')
  return (WORKSPACES as string[]).includes(h) ? (h as Workspace) : 'data'
}
export type DataView = 'table' | 'links'

interface Notice {
  id: number
  kind: 'info' | 'error'
  text: string
  action?: { label: string; run: () => void }
  leaving?: boolean
}

interface State {
  hydrated: boolean
  tables: Table[]
  links: Link[]
  /** Where each file sits on the Table Links canvas; files not listed aren't on it. */
  linkLayout: Record<string, { x: number; y: number }>
  workspace: Workspace
  dataView: DataView
  selectedTableId: string | null
  busy: string | null
  notices: Notice[]

  setWorkspace: (w: Workspace) => void
  setDataView: (v: DataView) => void
  selectTable: (id: string | null) => void
  addTables: (tables: Table[]) => void
  removeTable: (id: string) => void
  renameTable: (id: string, name: string) => void
  updateColumn: (tableId: string, column: string, patch: Partial<Pick<Column, 'role' | 'aggregation' | 'format'>>) => void
  addLink: (link: Omit<Link, 'id'>) => string
  removeLink: (id: string) => void
  placeTable: (id: string, pos: { x: number; y: number }) => void
  unplaceTable: (id: string) => void
  clearAll: () => void
  setBusy: (msg: string | null) => void
  notify: (kind: Notice['kind'], text: string, action?: Notice['action']) => void
  dismiss: (id: number) => void
}

const STORAGE_KEY = 'treepath:data:v1'

/** IndexedDB can stall (e.g. a pending delete in another tab); never let that block the app from starting. */
export function withTimeout<T>(p: Promise<T>, ms = 2000): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))])
}
let noticeId = 1

export const useStore = create<State>((setState, getState) => ({
  hydrated: false,
  tables: [],
  links: [],
  linkLayout: {},
  workspace: workspaceFromHash(),
  dataView: 'table',
  selectedTableId: null,
  busy: null,
  notices: [],

  setWorkspace: (workspace) => {
    if (location.hash !== `#${workspace}`) history.replaceState(null, '', `#${workspace}`)
    setState({ workspace })
  },
  setDataView: (dataView) => setState({ dataView }),
  selectTable: (selectedTableId) => setState({ selectedTableId, dataView: 'table' }),

  addTables: (incoming) =>
    setState((s) => {
      // Re-importing the same file + sheet replaces the old table but keeps its id, so links survive.
      const tables = [...s.tables]
      for (const t of incoming) {
        const i = tables.findIndex((x) => x.fileName === t.fileName && x.sheetName === t.sheetName)
        if (i >= 0) tables[i] = { ...t, id: tables[i].id, name: tables[i].name }
        else tables.push(t)
      }
      const firstNew = incoming[0] && tables.find((t) => t.fileName === incoming[0].fileName && t.sheetName === incoming[0].sheetName)
      // Drop links whose column vanished in the re-imported file (e.g. a renamed header).
      const has = (r: Link['from']) => tables.some((t) => t.id === r.tableId && t.columns.some((c) => c.name === r.column))
      const links = s.links.filter((l) => has(l.from) && has(l.to))
      if (links.length < s.links.length)
        setTimeout(() => getState().notify('info', `Removed ${s.links.length - links.length} link(s) to columns that no longer exist. Check Table Links.`), 0)
      return { tables, links, selectedTableId: firstNew?.id ?? s.selectedTableId, dataView: 'table' }
    }),

  removeTable: (id) =>
    setState((s) => {
      const tables = s.tables.filter((t) => t.id !== id)
      return {
        tables,
        links: s.links.filter((l) => l.from.tableId !== id && l.to.tableId !== id),
        linkLayout: Object.fromEntries(Object.entries(s.linkLayout).filter(([k]) => k !== id)),
        selectedTableId: s.selectedTableId === id ? (tables[0]?.id ?? null) : s.selectedTableId,
      }
    }),

  renameTable: (id, name) => setState((s) => ({ tables: s.tables.map((t) => (t.id === id ? { ...t, name } : t)) })),

  updateColumn: (tableId, column, patch) =>
    setState((s) => ({
      tables: s.tables.map((t) =>
        t.id !== tableId ? t : { ...t, columns: t.columns.map((c) => (c.name === column ? { ...c, ...patch } : c)) },
      ),
    })),

  addLink: (link) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `l_${Date.now()}`
    setState((s) => ({ links: [...s.links, { ...link, id }] }))
    return id
  },
  removeLink: (id) => setState((s) => ({ links: s.links.filter((l) => l.id !== id) })),
  placeTable: (id, pos) => setState((s) => ({ linkLayout: { ...s.linkLayout, [id]: pos } })),
  unplaceTable: (id) =>
    setState((s) => ({
      linkLayout: Object.fromEntries(Object.entries(s.linkLayout).filter(([k]) => k !== id)),
      links: s.links.filter((l) => l.from.tableId !== id && l.to.tableId !== id),
    })),

  clearAll: () => {
    setState({ tables: [], links: [], linkLayout: {}, selectedTableId: null })
    void del(STORAGE_KEY)
  },

  setBusy: (busy) => setState({ busy }),
  notify: (kind, text, action) => {
    const id = noticeId++
    setState((s) => ({ notices: [...s.notices, { id, kind, text, action }] }))
    if (kind === 'info') setTimeout(() => getState().dismiss(id), action ? 8000 : 4000)
  },
  dismiss: (id) => {
    // Play the exit (slide back down) before removing it.
    setState((s) => ({ notices: s.notices.map((n) => (n.id === id ? { ...n, leaving: true } : n)) }))
    setTimeout(() => setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) })), 260)
  },
}))

interface Persisted {
  tables: Table[]
  links: Link[]
  linkLayout?: Record<string, { x: number; y: number }>
  selectedTableId: string | null
}

/** Load saved data from IndexedDB, then keep saving changes (debounced). Data stays in this browser. */
export async function hydrate() {
  try {
    const saved = await withTimeout(get<Persisted>(STORAGE_KEY))
    // Older saves had separate "dimension" columns; they're now part of "Category / ID".
    if (saved?.tables)
      for (const t of saved.tables) {
        t.columns = t.columns.map((c) => (c.role === 'dimension' ? { ...c, role: 'key' } : c))
        t.name = t.name.replace(' · ', ' › ')
      }
    if (saved?.tables) useStore.setState({ tables: saved.tables, links: saved.links ?? [], linkLayout: saved.linkLayout ?? {}, selectedTableId: saved.selectedTableId ?? saved.tables[0]?.id ?? null })
  } catch (err) {
    console.warn('Treepath: could not read saved data', err)
  }
  useStore.setState({ hydrated: true })
  window.addEventListener('hashchange', () => useStore.setState({ workspace: workspaceFromHash() }))

  let timer: ReturnType<typeof setTimeout> | undefined
  useStore.subscribe((s, prev) => {
    if (s.tables === prev.tables && s.links === prev.links && s.linkLayout === prev.linkLayout && s.selectedTableId === prev.selectedTableId) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      const { tables, links, linkLayout, selectedTableId } = useStore.getState()
      if (tables.length === 0) return
      set(STORAGE_KEY, { tables, links, linkLayout, selectedTableId } satisfies Persisted).catch((err) =>
        console.warn('Treepath: could not save data', err),
      )
    }, 500)
  })
}
