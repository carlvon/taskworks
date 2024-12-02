import { GeneralMessage, Messenger } from 'messageworks'

import { Data } from '../payloads/data'

import { State } from '../../../types/state'
import { Status } from '../../../types/status'

/**
 * This class is used to report the current status of workers.
 *
 * @extends GeneralMessage<Status> The current status is stored in the payload.
 */
export class StatusUpdate extends GeneralMessage<Status> {
  /**
   * The static name of the message type, used for identification.
   */
  static NAME = 'STATUS-UPDATE'

  /**
   * Constructs a StatusUpdate message instance.
   *
   * @param destination {Messenger} The target recipient of the message.
   * @param state {State} The current state of the worker (e.g., INITIALIZED, RUNNING, ERROR).
   * @param started {number} (Optional) The optional Unix timestamp (milliseconds) when the worker was started.
   * @param message {string} (Optional) An additional message related to the status update (e.g., error details).
   * @param context {Data} (Optional) Any additional context information relevant to the status update.
   */
  constructor(
    destination: Messenger,
    state: State,
    started?: number,
    message?: string,
    context?: Data
  ) {
    super(StatusUpdate.NAME, destination, {
      state: state,
      timestamp: Date.now(),
      started: started,
      message: message,
      context: context,
    })
  }
}
