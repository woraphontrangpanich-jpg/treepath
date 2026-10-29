/** A parsed cell. Dates are normalised to ISO `YYYY-MM-DD` strings. */
export type Cell = string | number | boolean | null

export type ColumnType = 'number' | 'date' | 'text' | 'boolean' | 'empty'

/**
 * What a column means to Treepath:
 * - date: the time axis metrics are grouped by
 * - key: an identifier used to link tables (region_code, store_id…)
 * - metric: a numeric value that can become a node in the tree
 * - dimension: a descriptive attribute usable as a filter (country, channel…)
 * - ignore: not used
 */
export type ColumnRole = 'date' | 'key' | 'metric' | 'dimension' | 'ignore'

export type Aggregation = 'sum' | 'avg' | 'min' | 'max' | 'last' | 'count'

export type Grain = 'day' | 'week' | 'month'

export interface ColumnProfile {
  /** Non-null values. */
  count: number
  nulls: number
  /** Raw values that could not be parsed as the detected type (they became null). */
  invalid: number
  distinct: number
  min: Cell
  max: Cell
  samples: Cell[]
}

export interface Column {
  name: string
  type: ColumnType
  role: ColumnRole
  aggregation: Aggregation
  /** Display format hint, e.g. "percent" when the source cells were formatted as %. */
  format?: 'percent'
  profile: ColumnProfile
}

export interface Table {
  id: string
  fileName: string
  sheetName: string
  /** User-facing name; defaults to the sheet name (or file name for CSV). */
  name: string
  columns: Column[]
  /** Row-major cells aligned with `columns`. */
  rows: Cell[][]
  importedAt: string
}

export interface ColumnRef {
  tableId: string
  column: string
}

/** A relationship between two tables via matching key values (like a primary/foreign key). */
export interface Link {
  id: string
  from: ColumnRef
  to: ColumnRef
}

export interface SeriesPoint {
  date: string
  value: number
  /** Number of source rows that fed this bucket. */
  n: number
}
