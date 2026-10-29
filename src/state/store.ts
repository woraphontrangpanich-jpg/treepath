import { del, get, set } from 'idb-keyval'
import { create } from 'zustand'
import type { Column, Link, Table } from '../data/types'

export type Workspace = 'data' | 'build' | 'analyze' | 'scenario'
export type DataView = 'table' | 'links'

interface Notice {
  id: number
  kind: 'info' | 'error'
  text: string
}

interface State {
  hydrated: boolean
  tables: Table[]
  links: Link[]
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
  addLink: (link: Omit<Link, 'id'>) => void
  removeLink: (id: string) => void
  clearAll: () => void
  setBusy: (msg: string | null) => void
  notify: (kind: Notice['kind'], text: string) => void
  dismiss: (id: number) => void
}

const STORAGE_KEY = 'treepath:data:v1'
let noticeId = 1

export const useStore = create<State>((setState, getState) => ({
  hydrated: false,
  tables: [],
  links: [],
  workspace: 'data',
  dataView: 'table',
  selectedTableId: null,
  busy: null,
  notices: [],

  setWorkspace: (workspace) => setState({ workspace }),
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
      return { tables, selectedTableId: firstNew?.id ?? s.selectedTableId, dataView: 'table' }
    }),

  removeTable: (id) =>
    setState((s) => {
      const tables = s.tables.filter((t) => t.id !== id)
      return {
        tables,
        links: s.links.filter((l) => l.from.tableId !== id && l.to.tableId !== id),
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
  },
  removeLink: (id) => setState((s) => ({ links: s.links.filter((l) => l.id !== id) })),

  clearAll: () => {
    setState({ tables: [], links: [], selectedTableId: null })
    void del(STORAGE_KEY)
  },

  setBusy: (busy) => setState({ busy }),
  notify: (kind, text) => {
    const id = noticeId++
    setState((s) => ({ notices: [...s.notices, { id, kind, text }] }))
    if (kind === 'info') setTimeout(() => getState().dismiss(id), 4000)
  },
  dismiss: (id) => setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}))

interface Persisted {
  tables: Table[]
  links: Link[]
  selectedTableId: string | null
}

/** Load saved data from IndexedDB, then keep saving changes (debounced). Data stays in this browser. */
export async function hydrate() {
  try {
    const saved = await get<Persisted>(STORAGE_KEY)
    if (saved?.tables) useStore.setState({ tables: saved.tables, links: saved.links ?? [], selectedTableId: saved.selectedTableId ?? saved.tables[0]?.id ?? null })
  } catch (err) {
    console.warn('Treepath: could not read saved data', err)
  }
  useStore.setState({ hydrated: true })

  let timer: ReturnType<typeof setTimeout> | undefined
  useStore.subscribe((s, prev) => {
    if (s.tables === prev.tables && s.links === prev.links && s.selectedTableId === prev.selectedTableId) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      const { tables, links, selectedTableId } = useStore.getState()
      if (tables.length === 0) return
      set(STORAGE_KEY, { tables, links, selectedTableId } satisfies Persisted).catch((err) =>
        console.warn('Treepath: could not save data', err),
      )
    }, 500)
  })
}
