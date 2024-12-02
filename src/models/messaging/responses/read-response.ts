import { ResponseMessage } from 'messageworks'

import { ReadRequest } from '../requests/read-request'
import { Data } from '../payloads/data'

/**
 * Responds to a read data request.
 * @extends GeneralMessage<Data> The data read from the link is stored in the payload.
 */
export class ReadResponse extends ResponseMessage<Data> {
  /**
   * The static name of the message type, used for identification.
   */
  public static NAME = 'READ-RESPONSE'

  /**
   * Constructs a new ReadResponse message.
   *
   * @param request {ReadRequest} The original read request that triggered this response.
   * @param data {Data} The data read from the link.
   */
  constructor(request: ReadRequest, data: Data) {
    super(ReadResponse.NAME, request, data)
  }
}
