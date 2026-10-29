import type { ParseRequest, ParseResponse } from './parse.worker'
import type { Table } from './types'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (t: Table[]) => void; reject: (e: Error) => void }>()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<ParseResponse>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if (e.data.ok) p.resolve(e.data.tables)
      else p.reject(new Error(e.data.error))
    }
  }
  return worker
}

/** Parse a file off the main thread so large workbooks don't freeze the UI. */
export function parseInWorker(fileName: string, data: ArrayBuffer): Promise<Table[]> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, fileName, data } satisfies ParseRequest, [data])
  })
}

export async function importFile(file: File): Promise<Table[]> {
  return parseInWorker(file.name, await file.arrayBuffer())
}

export const SAMPLE_FILES = ['marketing.xlsx', 'sales.xlsx', 'weather.csv', 'regions.csv']

export async function importSamples(): Promise<Table[]> {
  const results = await Promise.all(
    SAMPLE_FILES.map(async (name) => {
      const res = await fetch(`${import.meta.env.BASE_URL}samples/${name}`)
      if (!res.ok) throw new Error(`Could not load sample ${name} (${res.status})`)
      return parseInWorker(name, await res.arrayBuffer())
    }),
  )
  return results.flat()
}
