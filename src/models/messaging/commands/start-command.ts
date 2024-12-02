import { GeneralMessage, Messenger } from 'messageworks'

/**
 * This class is used to start workers.
 *
 * @extends GeneralMessage<null> It uses a null payload because no payload is required.
 */
export class StartCommand extends GeneralMessage<null> {
  /**
   * The static name of the message type, used for identification.
   */
  static NAME = 'START-COMMAND'

  /**
   * Constructs a StartCommand message instance.
   *
   * @param destination {Messenger} The target recipient of the message.
   */
  constructor(destination: Messenger) {
    super(StartCommand.NAME, destination)
  }
}
