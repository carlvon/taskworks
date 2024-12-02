import {
  GeneralMessage,
  MessagingService,
  Messenger,
  messengerAsArray,
  messengerAsString,
} from 'messageworks'

import {
  StartCommand,
  StatusUpdate,
  StopCommand,
  InitializeCommand,
  ReadRequest,
  ReadResponse,
} from '../models/messaging'

import { State } from '../types/state'

import { Result } from '../types/result'
import { ResultType } from '../types/result-type'

import { WriteRequest } from 'models/messaging/requests/write-request'
import { WriteResponse } from 'models/messaging/responses/write-response'

import logging from '../logging'

/**
 * Abstract class for step input workers.
 *
 * Provides a base implementation for initializing, starting, handling messages, processing data, and stopping the worker.
 * Subclasses should extend this class and implement the abstract methods to provide specific behavior.
 */
export abstract class StepInputWorker {
  /**
   * Singleton instance of the worker.
   */
  public static instance: StepInputWorker | null = null

  /**
   * Promise to resolve when the instance is created.
   */
  public static instancePromise: Promise<StepInputWorker> | null = null

  /**
   * Reference to the `worker_threads` module, if available.
   */
  private workerThreads: typeof import('worker_threads') | undefined = undefined

  /**
   * Name of the worker.
   */
  public name: string = '???'

  /**
   * Messaging service instance.
   */
  protected messagingService!: MessagingService

  /**
   * Timestamp of when the worker started.
   */
  protected started: number | undefined

  /**
   * Private constructor to enforce the Singleton pattern.
   */
  protected constructor() {}

  /**
   * Gets the singleton instance of the worker.
   *
   * @returns A Promise that resolves to the instance.
   */
  public static async getInstance(): Promise<StepInputWorker> {
    if (!StepInputWorker.instance) {
      this.instancePromise = new Promise<StepInputWorker>(async (resolve, reject) => {
        try {
          StepInputWorker.instance = new (this as any)()

          if (StepInputWorker.instance) {
            if (typeof process !== 'undefined' && process.versions && process.versions.node) {
              StepInputWorker.instance.workerThreads = await import('worker_threads')
              const { workerData } = StepInputWorker.instance.workerThreads
              StepInputWorker.instance.name = workerData.name
              logging.info(workerData.name, 'running in node.')
            } else if (typeof self !== 'undefined' && self.name) {
              StepInputWorker.instance.name = self.name
              logging.info(self.name, 'running in browser.')
            } else {
              logging.error('Step input encountered an unknown worker environment.')
              throw new Error('Step input encountered an unknown worker environment.')
            }

            await StepInputWorker.instance.initializeMessagingService()

            logging.debug(`${StepInputWorker.instance.name} sending uninitialized status update.`)
            StepInputWorker.instance.messagingService.sendMessage(
              new StatusUpdate(StepInputWorker.instance.getStepMessenger(), State.UNINITIALIZED)
            )

            resolve(StepInputWorker.instance)
          } else {
            logging.erro('Error creating step input instance.')
            reject('Error creating step input instance.')
          }
        } catch (err) {
          logging.error(`Error creating step input instance:`, err)
          reject(err)
        }
      })
    }

    return StepInputWorker.instancePromise!
  }

  /**
   * Initializes the messaging service.
   */
  private async initializeMessagingService(): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      try {
        await MessagingService.getInstance().then((messagingService) => {
          this.messagingService = messagingService
          this.messagingService.messageReceivedCallback = this.messageReceived.bind(this)
          resolve()
        })
      } catch (err) {
        logging.error(this.name, 'error initializing messaging service:', err)
        reject(err)
      }
    })
  }

  /**
   * Handles incoming messages.
   *
   * @param message The received message.
   */
  private messageReceived(message: GeneralMessage<any>) {
    logging.debug(this.name, 'message received:', message)

    if (message.name === InitializeCommand.NAME) {
      this.handleInitializeCommand(message as InitializeCommand)
    } else if (message.name === StartCommand.NAME) {
      this.handleStartCommand(message as StartCommand)
    } else if (message.name === StopCommand.NAME) {
      this.handleStopCommand(message as StopCommand)
    } else {
      this.handleMessage(message).catch((err) => {
        this.failed('Error handeling message.', err)
      })
    }
  }

  /**
   * Handles the initialization command received from the system.
   *
   * This method processes the initialization configuration data and updates the step's status accordingly.
   * If an error occurs during initialization, an error message is logged and a failure status is sent.
   *
   * @param initializeCommand The initialization command received from the system.
   */
  protected handleInitializeCommand(initializeCommand: InitializeCommand) {
    logging.debug(this.name, 'sending initializing status update.')
    this.messagingService.sendMessage(new StatusUpdate(this.getStepMessenger(), State.INITIALIZING))

    const data = initializeCommand.data

    this.initialize(data)
      .then(() => {
        logging.debug(this.name, 'sending initialized status update.')
        this.messagingService.sendMessage(
          new StatusUpdate(this.getStepMessenger(), State.INITIALIZED)
        )
      })
      .catch((err) => {
        logging.error(this.name, 'error initializing:', err)
        this.failed(`${this.name} error initializing.`, err)
      })
  }

  /**
   * Handles the `StartCommand` to initiate the process.
   *
   * This method performs the following steps:
   * 1. Records the start time using `Date.now()`.
   * 2. Logs a debug message indicating that a "starting" status update is being sent.
   * 3. Sends a message to the `messagingService` with the current step messenger, `State.STARTING`, and the start time.
   * 4. Calls the `start()` method. Upon successful completion:
   *     - Logs a debug message indicating that a "running" status update is being sent.
   *     - Sends a message to the `messagingService` with the current step messenger, `State.RUNNING`, and the start time.
   *     - Calls the `process()` method. Upon successful completion:
   *         - Calls the `success()` method with the result from `process()`.
   *     - In case of an error in `process()`:
   *         - Logs an error message with the error details.
   *         - Calls the `failed()` method with an error message and the original error.
   * 5. In case of an error during the start phase:
   *     - Logs an error message indicating the start failure.
   *     - Calls the `failed()` method with an error message and the original error.
   *
   * @param startCommand The received `StartCommand` object.
   * @throws Exception An exception might be thrown by `start()` or `process()`.
   */
  protected handleStartCommand(startCommand: StartCommand) {
    this.started = Date.now()

    logging.debug(this.name, 'sending starting status update.')
    this.messagingService.sendMessage(
      new StatusUpdate(this.getStepMessenger(), State.STARTING, this.started)
    )

    this.start()
      .then(() => {
        logging.debug(this.name, 'sending running status update.')
        this.messagingService.sendMessage(
          new StatusUpdate(this.getStepMessenger(), State.RUNNING, this.started)
        )

        this.process()
          .then((result) => {
            this.success(result)
          })
          .catch((err) => {
            logging.error(this.name, 'error processing:', err)
            this.failed(`${this.name} error processing.`, err)
          })
      })
      .catch((err) => {
        logging.err(this.name, 'error starting:', err)
        this.failed(`${this.name} error starting.`, err)
      })
  }

  /**
   * Protected method to handle the stop command.
   *
   * This method is invoked when a stop command is received. It performs the following actions:
   *  1. Sends a "stopping" status update via the messaging service.
   *  2. Calls the `stop` method to stop the process.
   *  3. Upon successful stop:
   *      - Sends a "stopped" status update.
   *      - Calls the `cancled` method with the result.
   *  4. In case of error during stop:
   *      - Logs the error with the `logging.error` function.
   *      - Calls the `failed` method with an error message and the actual error.
   *
   * @param stopCommand The StopCommand object representing the received stop command.
   */
  protected handleStopCommand(stopCommand: StopCommand) {
    logging.debug(this.name, 'sending stopping status update.')
    this.messagingService.sendMessage(
      new StatusUpdate(this.getStepMessenger(), State.STOPPING, this.started)
    )

    this.stop()
      .then((result: Result) => {
        logging.debug(this.name, 'sending stopped status update.')
        this.messagingService.sendMessage(
          new StatusUpdate(this.getStepMessenger(), State.STOPPED, this.started)
        )

        this.cancled(result)
      })
      .catch((err) => {
        logging.error(this.name, 'error stopping input:', err)
        this.failed(`${this.name} error stopping input.`, err)
      })
  }

  /**
   * Sends an "unknown" status update with the provided message and context.
   *
   * @param message The error message to be sent.
   * @param context Additional context information for the error.
   */
  protected unknown(message: string, context?: any) {
    this.sendDone(ResultType.UNKNOWN, message, context)
  }

  /**
   * Sends a "success" status update with the provided result or a default message.
   *
   * @param result The optional result object containing a message and context.
   */
  protected success(result?: Result) {
    if (result) {
      this.sendDone(ResultType.SUCCESS, result.message, result.context)
    } else {
      this.sendDone(ResultType.SUCCESS, 'Finished successfully.')
    }
  }

  /**
   * Sends a "failed" status update with the provided message and context.
   *
   * @param message The error message to be sent.
   * @param context Additional context information for the error.
   */
  protected failed(message: string, context?: any) {
    this.sendDone(ResultType.FAILED, message, context)
  }

  /**
   * Sends a "canceled" status update with the provided result or a default message.
   *
   * @param result The optional result object containing a message and context.
   */
  protected cancled(result?: Result) {
    if (result) {
      this.sendDone(ResultType.CANCLED, result.message, result.context)
    } else {
      this.sendDone(ResultType.CANCLED, 'Stopped.')
    }
  }

  /**
   * Sends a done message with the specified result type, message, and context.
   *
   * @param type The result type.
   * @param message The result message.
   * @param context Optional context information.
   */
  private sendDone(type: ResultType, message: string, context?: any) {
    const result: Result = {
      type: type,
      started: this.started ?? Date.now(),
      ended: Date.now(),
      message: message,
      context: context,
    }

    logging.debug(this.name, 'sending done status update.')
    this.messagingService.sendMessage(
      new StatusUpdate(this.getStepMessenger(), State.DONE, this.started, result.message, result)
    )

    logging.info(this.name, 'done.')
  }

  /**
   * Writes data to the specified output.
   *
   * @param output The output name.
   * @param data The data to write.
   */
  protected async writeData(output: string, data: any) {
    // TODO: only allow output to named outputs
    const writeRequest: WriteRequest = new WriteRequest(this.getWorkflowMessenger(), output, data)
    const writeResponse: WriteResponse = (await this.messagingService.sendMessage(
      writeRequest
    )) as WriteResponse

    if (writeResponse) {
      if (!writeResponse.data) {
        logging.error(this.name, output, 'is closed:')
        throw new Error(`${this.name} ${output} is closed.`)
      }
    }
  }

  /**
   * Reads data from the specified input.
   *
   * @returns The read data.
   */
  protected async readData(): Promise<any> {
    const readRequest: ReadRequest = new ReadRequest(this.getWorkflowMessenger())
    const readResponse: ReadResponse = (await this.messagingService.sendMessage(
      readRequest
    )) as ReadResponse

    if (readResponse) {
      logging.debug(this.name, 'read data:', readResponse.data)
      return readResponse.data
    } else {
      logging.error(this.name, 'error reading input data.')
      throw new Error(`${this.name} error reading input data.`)
    }
  }

  /**
   * Gets the workflow name from the worker's name.
   *
   * @returns The workflow name.
   */
  private getWorkflowName(): string {
    return messengerAsArray(this.name)[0]
  }

  /**
   * Gets the workflow messenger.
   *
   * @returns The workflow messenger.
   */
  private getWorkflowMessenger(): Messenger {
    return messengerAsString([this.getWorkflowName()])
  }

  /**
   * Gets the step messenger.
   *
   * @returns The step messenger.
   */
  protected getStepMessenger(): Messenger {
    return messengerAsString(messengerAsArray(this.name).slice(0, -1))
  }

  /**
   * Initializes the worker.
   *
   * @param config Optional configuration data.
   */
  protected abstract initialize(config?: any): Promise<void>

  /**
   * Starts the worker.
   */
  protected abstract start(): Promise<void>

  /**
   * Handles incoming messages.
   *
   * @param message The received message.
   */
  protected abstract handleMessage(message: GeneralMessage<any>): Promise<void>

  /**
   * Processes data.
   *
   * @returns A Promise that resolves to the processing result.
   */
  protected abstract process(): Promise<Result>

  /**
   * Stops the worker.
   *
   * @returns A Promise that resolves when the worker is stopped.
   */
  protected abstract stop(): Promise<Result>
}
