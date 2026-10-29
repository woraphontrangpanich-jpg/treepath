/// <reference lib="webworker" />
import { parseWorkbook } from './parse'
import type { Table } from './types'

export interface ParseRequest {
  id: number
  fileName: string
  data: ArrayBuffer
}

export type ParseResponse = { id: number; ok: true; tables: Table[] } | { id: number; ok: false; error: string }

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  const { id, fileName, data } = e.data
  try {
    const tables = parseWorkbook(data, fileName)
    self.postMessage({ id, ok: true, tables } satisfies ParseResponse)
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies ParseResponse)
  }
}
