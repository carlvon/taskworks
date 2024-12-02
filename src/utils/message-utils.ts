import { GeneralMessage, Messenger, messengerAsArray } from 'messageworks'

/**
 * Extracts the workflow name from a given Messenger object.
 *
 * @param messenger The Messenger object to extract the workflow name from.
 * @returns The workflow name.
 */
export function getWorkflowName(messenger: Messenger): string {
  return messengerAsArray(messenger)[0]
}

/**
 * Extracts the step name from a given Messenger object.
 *
 * @param messenger The Messenger object to extract the step name from.
 * @returns The step name.
 */
export function getStepName(messenger: Messenger): string {
  return messengerAsArray(messenger)[1]
}

/**
 * Extracts the input name from a given Messenger object.
 *
 * @param messenger The Messenger object to extract the input name from.
 * @returns The input name.
 */
export function getInputName(messenger: Messenger): string {
  return messengerAsArray(messenger)[2]
}

/**
 * Extracts the workflow name of the message source.
 *
 * @param message The GeneralMessage object to extract the source workflow name from.
 * @returns The source workflow name.
 */
export function getSourceWorkflowName(message: GeneralMessage<any>): string {
  return getWorkflowName(message.source)
}

/**
 * Extracts the workflow name of the message destination.
 *
 * @param message The GeneralMessage object to extract the destination workflow name from.
 * @returns The destination workflow name.
 */
export function getDestinationWorkflowName(message: GeneralMessage<any>): string {
  return getWorkflowName(message.destination)
}

/**
 * Extracts the step name of the message source.
 *
 * @param message The GeneralMessage object to extract the source step name from.
 * @returns The source step name.
 */
export function getSourceStepName(message: GeneralMessage<any>): string {
  return getStepName(message.source)
}

/**
 * Extracts the step name of the message destination.
 *
 * @param message The GeneralMessage object to extract the destination step name from.
 * @returns The destination step name.
 */
export function getDestinationStepName(message: GeneralMessage<any>): string {
  return getStepName(message.destination)
}

/**
 * Extracts the input name of the message source.
 *
 * @param message The GeneralMessage object to extract the source input name from.
 * @returns The source input name.
 */
export function getSourceInputName(message: GeneralMessage<any>): string {
  return getInputName(message.source)
}

/**
 * Extracts the input name of the message destination.
 *
 * @param message The GeneralMessage object to extract the destination input name from.
 * @returns The destination input name.
 */
export function getDestinationInputName(message: GeneralMessage<any>): string {
  return getInputName(message.destination)
}
