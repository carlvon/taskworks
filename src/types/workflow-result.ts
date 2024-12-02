import { Result } from './result'
import { StepResult } from './step-result'

/**
 * Represents the overall result of a workflow execution.

 * @interface WorkflowResult
 * @extends Result
 * @property {Record<string, StepResult>} steps A mapping of step names to their corresponding results.
 */
export interface WorkflowResult extends Result {
    steps: Record<string, StepResult>
}
