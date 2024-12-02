import { Result } from './result'

/**
 * Represents the result of a specific step in a workflow. 
 *
 * @interface StepResult
 * @extends Result 
 * @property {Record<string, Result>} inputs A mapping of input names to their corresponding results.
 */
export interface StepResult extends Result {
    inputs: Record<string, Result>
}
