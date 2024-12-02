import { Step } from './step'
import { Link } from './link'

/**
 * Represents a workflow, defining a sequence of steps and their connections.

 * @interface Workflow
 * @property {string} name The unique name of the workflow.
 * @property {Step[]} steps An array of `Step` objects representing the individual steps in the workflow.
 * @property {Link[]} links An array of `Link` objects representing the connections between steps in the workflow.
 */
export interface Workflow {
  name: string
  steps: Step[]
  links: Link[]
}
