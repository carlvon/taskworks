import { GeneralMessage, Messenger } from 'messageworks'

import { Data } from '../payloads/data'

/**
 * This class is used to initialize workers with initial configuration data in the payload.
 *
 * @extends GeneralMessage<Data> The initialization configuration object is stored in the payload.
 */
export class InitializeCommand extends GeneralMessage<Data> {
  /**
   * The static name of the message type, used for identification.
   */
  static NAME = 'INITIALIZE-COMMAND'

  /**
   * Constructs a InitializeCommand message instance.
   *
   * @param destination {Messenger} The target recipient of the message.
   * @param data {Data} (Optional) An optional object containing the initialization configuration.
   */
  constructor(destination: Messenger, data?: Data) {
    super(InitializeCommand.NAME, destination, data)
  }
}
