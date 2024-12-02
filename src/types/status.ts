import { State } from './state'

/**
 * Represents the current status of a worker.

 * @interface Status
 * @property {State} state The current state of the worker.
 * @property {number} timestamp The timestamp (in milliseconds) when the status was last updated.
 * @property {number} [started] The timestamp (in milliseconds) when the worker started running.
 * @property {string} [message] An optional message providing additional information about the current state.
 * @property {any} [context] Optional additional context data related to the current state.
 */
export interface Status {
  state: State
  timestamp: number
  started?: number
  message?: string
  context?: any
}
