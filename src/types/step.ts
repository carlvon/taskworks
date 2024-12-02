import { StepInput } from './step-input'

/**
 * Represents a single step within a workflow. 

 * @interface Step
 * @property {string} name The unique name of the step.
 * @property {StepInput[]} inputs An array of `StepInput` objects representing the inputs of the step.
 * @property {string[]} [outputs] An optional array of output names produced by the step.
 */
export interface Step {
  name: string
  inputs: StepInput[]
  outputs?: string[]
}
