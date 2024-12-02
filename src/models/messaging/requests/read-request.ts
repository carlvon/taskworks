import { Messenger, RequestMessage } from 'messageworks'

/**
 * This class is used to read data from the input link.
 *
 * @extends GeneralMessage<null> It uses a null payload because no payload is required.
 */
export class ReadRequest extends RequestMessage<null> {
  /**
   * The static name of the message type, used for identification.
   */
  static NAME = 'READ-REQUEST'

  /**
   * Constructs a ReadRequest message instance.
   *
   * @param destination {Messenger} The target recipient of the message.
   */
  constructor(destination: Messenger) {
      super(ReadRequest.NAME, destination)
  }
}
