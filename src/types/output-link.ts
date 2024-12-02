/**
 * Represents the output end of a link, specifying the target step and input.
 * @interface OutputLink
 * @property {string} step The name of the target step.
 * @property {string} input The name of the input on the target step.
 */
export interface OutputLink {
  step: string
  input: string
}
