import * as XLSX from 'xlsx'
import { inferColumn, pad2, profileColumn, type RawValue } from './detect'
import type { Cell, Column, Table } from './types'

export const ACCEPTED_EXTENSIONS = ['.xlsx', '.xlsm', '.xls', '.csv', '.tsv', '.ods']

export function isAcceptedFile(name: string) {
  const lower = name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function serialToIso(serial: number): string | null {
  const d = XLSX.SSF.parse_date_code(serial)
  if (!d || !d.y) return null
  return `${d.y}-${pad2(d.m)}-${pad2(d.d)}`
}

function readCell(cell: XLSX.CellObject | undefined): { value: RawValue; percent: boolean } {
  if (!cell || cell.v === undefined || cell.v === null) return { value: null, percent: false }
  const fmt = typeof cell.z === 'string' ? cell.z : ''
  switch (cell.t) {
    case 'n': {
      const v = cell.v as number
      if (fmt && XLSX.SSF.is_date(fmt)) {
        const date = serialToIso(v)
        return { value: date ? { date } : v, percent: false }
      }
      return { value: v, percent: fmt.includes('%') }
    }
    case 'd': {
      const d = cell.v as Date
      return { value: { date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }, percent: false }
    }
    case 'b':
      return { value: cell.v as boolean, percent: false }
    case 'e':
      return { value: null, percent: false }
    default:
      return { value: String(cell.v), percent: false }
  }
}

function uniqueHeaders(raw: RawValue[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((v, i) => {
    let name = v === null ? '' : typeof v === 'object' ? v.date : String(v).trim()
    if (!name) name = `Column ${i + 1}`
    const n = seen.get(name) ?? 0
    seen.set(name, n + 1)
    return n === 0 ? name : `${name} (${n + 1})`
  })
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Convert one worksheet into a typed Table, or null if it has no data rows. */
export function sheetToTable(ws: XLSX.WorkSheet, fileName: string, sheetName: string, multiSheet: boolean): Table | null {
  if (!ws['!ref']) return null
  const range = XLSX.utils.decode_range(ws['!ref'])
  const grid: { value: RawValue; percent: boolean }[][] = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: { value: RawValue; percent: boolean }[] = []
    let any = false
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = readCell(ws[XLSX.utils.encode_cell({ r, c })])
      if (cell.value !== null && cell.value !== '') any = true
      row.push(cell)
    }
    if (any) grid.push(row)
  }
  if (grid.length < 2) return null

  // Drop columns that are empty in every row (common with stray formatting).
  const width = grid[0].length
  const keep: number[] = []
  for (let c = 0; c < width; c++) {
    if (grid.some((row) => row[c].value !== null && row[c].value !== '')) keep.push(c)
  }

  const headers = uniqueHeaders(keep.map((c) => grid[0][c].value))
  const body = grid.slice(1)
  const columns: Column[] = []
  const colCells: Cell[][] = []
  keep.forEach((c, i) => {
    const raw = body.map((row) => row[c].value)
    const percentCount = body.filter((row) => row[c].percent).length
    const { column, cells } = inferColumn(headers[i], raw, percentCount > body.length / 2)
    columns.push({ ...column, profile: profileColumn(raw, cells) })
    colCells.push(cells)
  })

  const rows: Cell[][] = body.map((_, r) => colCells.map((cells) => cells[r]))
  const baseName = fileName.replace(/\.[^.]+$/, '')
  return {
    id: makeId(),
    fileName,
    sheetName,
    name: multiSheet ? `${baseName} · ${sheetName}` : baseName,
    columns,
    rows,
    importedAt: new Date().toISOString(),
  }
}

/** Parse a workbook (xlsx/xls/csv/…) into one Table per non-empty sheet. */
export function parseWorkbook(data: ArrayBuffer, fileName: string): Table[] {
  const isText = /\.(csv|tsv)$/i.test(fileName)
  const wb = isText
    ? XLSX.read(new TextDecoder('utf-8').decode(data), { type: 'string', raw: true })
    : XLSX.read(data, { type: 'array', cellDates: false, cellNF: true })
  const sheets = wb.SheetNames
  const tables: Table[] = []
  for (const name of sheets) {
    const t = sheetToTable(wb.Sheets[name], fileName, name, sheets.length > 1)
    if (t) tables.push(t)
  }
  return tables
}
