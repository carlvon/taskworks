import { Status } from './status'
import { WorkflowResult } from './workflow-result'

/**
 * Represents a handle to a workflow.

 * @interface WorkflowHandle
 * @property {string} name The name of the workflow.
 * @property {() => Status | undefined} getStatus Gets the current status of the workflow, step, or input.
 * @property {() => Promise<WorkflowResult>} getResult Gets the final result of the workflow.
 * @property {() => Promise<void>} start Starts the workflow execution.
 * @property {() => Promise<void>} stop Stops the workflow execution.
 * @property {() => Promise<void>} remove Removes the workflow from the system.
 */
export interface WorkflowHandle {
  name: string
  getStatus: (stepName?: string, inputName?: string) => Status | undefined
  getResult: () => Promise<WorkflowResult>
  start: () => Promise<void>
  stop: () => Promise<void>
  remove: () => Promise<void>
}
