/**
 * Represents the input end of a link, specifying the source step and output.
 * @interface InputLink
 * @property {string} step The name of the source step.
 * @property {string} output The name of the output from the source step.
 */
export interface InputLink {
  step: string
  output: string
}
