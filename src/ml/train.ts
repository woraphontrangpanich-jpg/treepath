import type { Task } from './dataset'
import { classMetrics, predict, regMetrics, trainLinear, trainTrees, type ClassMetrics, type LinearParams, type Model, type RegMetrics, type TreeParams } from './models'

export type Algo = 'trees' | 'linear'

export interface TrainRequest {
  algo: Algo
  task: Task
  classes: string[]
  Xtrain: number[][]
  ytrain: number[]
  Xtest: number[][]
  ytest: number[]
  trees: TreeParams
  linear: LinearParams
  seed: number
}

export interface TrainOutput {
  model: Model
  importance: number[]
  coef?: number[]
  roundsUsed?: number
  metrics: ClassMetrics | RegMetrics
  /** Test-set predictions: class probabilities, or [value]. */
  testPred: number[][]
  /** The real test values, aligned with testPred. */
  testActual: number[]
  ms: number
}

export function runTraining(req: TrainRequest, onProgress?: (done: number, total: number) => void): TrainOutput {
  const t0 = performance.now()
  const k = req.task === 'classification' ? req.classes.length : 1
  const res =
    req.algo === 'trees'
      ? trainTrees(req.Xtrain, req.ytrain, req.task, k, req.trees, req.seed, onProgress)
      : trainLinear(req.Xtrain, req.ytrain, req.task, k, req.linear, onProgress)
  const testPred = req.Xtest.map((x) => predict(res.model, x))
  const metrics =
    req.task === 'classification'
      ? classMetrics(req.ytest, testPred, req.classes, req.ytrain)
      : regMetrics(
          req.ytest,
          testPred.map((p) => p[0]),
          req.ytrain.reduce((a, b) => a + b, 0) / Math.max(1, req.ytrain.length),
        )
  return { ...res, metrics, testPred, testActual: req.ytest, ms: performance.now() - t0 }
}
