import { ResponseMessage } from 'messageworks'

import { WriteRequest } from '../requests/write-request'

/**
 * Responds to a write data request.
 * @extends GeneralMessage<boolean> The payload stores if the link is open (true) or closed (false).
 */
export class WriteResponse extends ResponseMessage<boolean> {
  /**
   * The static name of the message type, used for identification.
   */
  static NAME = 'WRITE-RESPONSE'

  /**
   * Any errors encountered with the write request.
   */
  error?: string

  /**
   * Constructs a new ReadResponse message.
   *
   * @param request {WriteRequest} The original write request that triggered this response.
   * @param open {boolean} The data read from the link.
   * @param error {string} (Optional) Any errors encountered with the write request.
   */
  constructor(request: WriteRequest, open: boolean, error?: string) {
    super(WriteResponse.NAME, request, open)
    this.error = error
  }
}
