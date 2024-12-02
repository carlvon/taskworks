/**
 * Represents an input of a step in a workflow.

 * @interface StepInput
 * @property {string} name The unique name of the input.
 * @property {URL | string} workerScript The URL or path to the worker script responsible for processing the input.
 * @property {any} [config] Optional configuration data for the worker.
 */
export interface StepInput {
  name: string
  workerScript: URL | string
  config?: any
}
