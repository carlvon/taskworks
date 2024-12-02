import { GeneralMessage, Messenger } from 'messageworks'

/**
 * This class is used to close a specific output channel of a step.
 *
 * @extends GeneralMessage<null> It uses a null payload because no payload is required.
 */
export class CloseOutput extends GeneralMessage<null> {
  /**
   * The static name of the message type, used for identification.
   */
  static NAME = 'CLOSE-OUTPUT'

  /**
   * The name of the output channel to be closed.
   */
  output: string

  /**
   * Constructs a CloseOutput message instance.
   *
   * @param destination {Messenger} The target recipient of the message.
   * @param output {string} The name of the output channel to be closed.
   */
  constructor(destination: Messenger, output: string) {
    super(CloseOutput.NAME, destination)
    this.output = output
  }
}
