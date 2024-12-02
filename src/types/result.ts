import { ResultType } from './result-type'

/**
 * Represents the result of a worker execution.

 * @interface Result
 * @property {string} message A human-readable message describing the result.
 * @property {ResultType} [type] The type of result (e.g., success, failure, canceled).
 * @property {number} [started] The timestamp (in milliseconds) when the worker execution started.
 * @property {number} [ended] The timestamp (in milliseconds) when the worker execution ended.
 * @property {any} [context] Additional context information related to the result.
 */
export interface Result {
  message: string
  type?: ResultType
  started?: number
  ended?: number
  context?: any
}
