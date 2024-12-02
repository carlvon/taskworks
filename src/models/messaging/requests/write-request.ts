import { Messenger, RequestMessage } from 'messageworks'

import { Data } from '../payloads/data'

/**
 * This class is used to write data to the output link.
 *
 * @extends GeneralMessage<Data> The data to write to the output channel is stored in the payload.
 */
export class WriteRequest extends RequestMessage<Data> {
  /**
   * The static name of the message type, used for identification.
   */
  static NAME = 'WRITE-REQUEST'

  /**
   * The name of the output channel to write to.
   */
  output: string

  /**
   * Constructs a WriteRequest message instance.
   *
   * @param destination {Messenger} The target recipient of the message.
   * @param output {string} The name of the output channel to write to.
   * @param data {Data} The object to write to the output channel.
   */
  constructor(destination: Messenger, output: string, data: Data) {
    super(WriteRequest.NAME, destination, data)
    this.output = output
  }
}
