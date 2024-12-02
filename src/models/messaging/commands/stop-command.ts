import { GeneralMessage, Messenger } from 'messageworks'

/**
 * This class is used to stop workers.
 *
 * @extends GeneralMessage<null> It uses a null payload because no payload is required.
 */
export class StopCommand extends GeneralMessage<null> {
  /**
   * The static name of the message type, used for identification.
   */
  static NAME = 'STOP-COMMAND'

  /**
   * Constructs a StopCommand message instance.
   *
   * @param destination {Messenger} The target recipient of the message.
   */
  constructor(destination: Messenger) {
    super(StopCommand.NAME, destination)
  }
}
