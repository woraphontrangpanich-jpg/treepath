import type { WorkerIn, WorkerOut } from './ml.worker'
import type { TrainOutput, TrainRequest } from './train'

let worker: Worker | null = null
let nextId = 1

/** Train off the main thread; a new request cancels the previous one by restarting the worker. */
export function trainInWorker(req: TrainRequest, onProgress: (done: number, total: number) => void): Promise<TrainOutput> {
  worker?.terminate()
  worker = new Worker(new URL('./ml.worker.ts', import.meta.url), { type: 'module' })
  const id = nextId++
  const w = worker
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (e.data.id !== id) return
      if (e.data.type === 'progress') onProgress(e.data.done, e.data.total)
      else if (e.data.type === 'done') resolve(e.data.out)
      else reject(new Error(e.data.error))
    }
    w.onerror = (e) => reject(new Error(e.message || 'Training failed'))
    w.postMessage({ id, req } satisfies WorkerIn)
  })
}
