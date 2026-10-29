import { runTraining, type TrainOutput, type TrainRequest } from './train'

export type WorkerIn = { id: number; req: TrainRequest }
export type WorkerOut =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'done'; out: TrainOutput }
  | { id: number; type: 'error'; error: string }

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const { id, req } = e.data
  try {
    let last = 0
    const out = runTraining(req, (done, total) => {
      const now = performance.now()
      if (now - last > 60 || done === total) {
        last = now
        ;(self as unknown as Worker).postMessage({ id, type: 'progress', done, total } satisfies WorkerOut)
      }
    })
    ;(self as unknown as Worker).postMessage({ id, type: 'done', out } satisfies WorkerOut)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, type: 'error', error: err instanceof Error ? err.message : String(err) } satisfies WorkerOut)
  }
}
