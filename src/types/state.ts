/**
 * Represents the possible states of a worker.

 * @enum {string}
 */
export enum State {
  UNKNOWN = 'UNKNOWN',
  UNINITIALIZED = 'UNINITIALIZED',
  INITIALIZING = 'INITIALIZING',
  INITIALIZED = 'INITIALIZED',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  STOPPING = 'STOPPING',
  STOPPED = 'STOPPED',
  DONE = 'DONE',
  ERROR = 'ERROR',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}
