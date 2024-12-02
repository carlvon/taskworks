import { InputLink } from './input-link'
import { OutputLink } from './output-link'

/**
 * Represents a link between two steps in a workflow.

 * @interface Link
 * @property {string} [description] An optional description of the link.
 * @property {InputLink} input The input end of the link, specifying the step and output that feeds into this link.
 * @property {OutputLink} output The output end of the link, specifying the step and input that receives the data from this link.
 */
export interface Link {
  description?: string
  input: InputLink
  output: OutputLink
}
