import {
  MessagingService,
  Messenger,
  GeneralMessage,
  messengerAsArray,
  messengerAsString,
  messengerIsUpstream,
} from 'messageworks'

import {
  InitializeCommand,
  StartCommand,
  StopCommand,
  StatusUpdate,
  CloseOutput,
} from '../models/messaging'

import { Step } from '../types/step'
import { StepResult } from '../types/step-result'
import { StepInput } from '../types/step-input'

import { Result } from '../types/result'
import { ResultType } from '../types/result-type'

import { Status } from '../types/status'
import { State } from '../types/state'

import logging from '../logging'

export class StepWorker {
  public static instance: StepWorker | null = null
  public static instancePromise: Promise<StepWorker> | null = null

  private workerThreads: typeof import('worker_threads') | undefined = undefined

  public name: string = '???'
  private messagingService!: MessagingService
  private started: number | undefined

  private inputs: Map<string, StepInput> = new Map()
  private inputStatus: Map<string, Status> = new Map()

  private outputs: string[] = []

  protected inputStateHandlers: Map<string, Map<State, (inputName: string) => void>> = new Map()

  protected workers: Map<string, any> = new Map()

  protected inputResults: Record<string, Result> = {}

  private constructor() {}

  public static async getInstance(): Promise<StepWorker> {
    if (!StepWorker.instance) {
      this.instancePromise = new Promise<StepWorker>(async (resolve, reject) => {
        try {
          StepWorker.instance = new StepWorker()

          if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            StepWorker.instance.workerThreads = await import('worker_threads')
            const { workerData } = StepWorker.instance.workerThreads
            StepWorker.instance.name = workerData.name
            logging.info(workerData.name, 'running in node.')
          } else if (typeof self !== 'undefined' && self.name) {
            StepWorker.instance.name = self.name
            logging.info(self.name, 'running in browser.')
          } else {
            logging.error('Step encountered an unknown worker environment.')
            throw new Error('Step encountered an unknown worker environment.')
          }

          await StepWorker.instance.initializeMessagingService()

          logging.debug(StepWorker.instance.name, 'sending uninitialized status update.')
          StepWorker.instance.messagingService.sendMessage(
            new StatusUpdate(StepWorker.instance.getWorkflowMessenger(), State.UNINITIALIZED)
          )

          resolve(StepWorker.instance)
        } catch (err) {
          logging.error('Error creating step instance:', err)
          reject(err)
        }
      })
    }

    return StepWorker.instancePromise!
  }

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

  protected messageReceived(message: GeneralMessage<any>) {
    logging.debug(this.name, 'message received:', message)

    if (messengerIsUpstream(this.name, message.source)) {
      if (message.name === InitializeCommand.NAME) {
        this.handleInitializeCommand(message as InitializeCommand)
      } else if (message.name === StartCommand.NAME) {
        this.handleStartCommand(message as StartCommand)
      } else if (message.name === StopCommand.NAME) {
        this.handleStopCommand(message as StopCommand)
      }
    } else {
      const inputName = messengerAsArray(message.source).slice(-1).toString()
      const input = this.inputs.get(inputName)

      if (input) {
        if (message.name === StatusUpdate.NAME) {
          const statusUpdate = message as StatusUpdate
          const status = statusUpdate.data

          if (status) {
            if (status.state === State.DONE) {
              this.inputResults[inputName] = status.context as Result
              if (this.inputResults[inputName].type === ResultType.FAILED) {
                logging.error(this.name, inputName, 'failed.')
                this.failed(`${this.name} ${inputName} failed.`)
              }
            }

            this.inputStatus.set(inputName, status)
            this.handleInputState(inputName, status.state)
          }
        }
      }
    }
  }

  private handleInitializeCommand(initializeCommand: InitializeCommand) {
    logging.debug(this.name, 'sending initializing status update.')
    this.messagingService.sendMessage(
      new StatusUpdate(this.getWorkflowMessenger(), State.INITIALIZING)
    )

    const inputConfiguration: Step = initializeCommand.data

    if (inputConfiguration) {
      const inputInitializedPromises: Promise<void>[] = []

      inputConfiguration.inputs.forEach((input, index) => {
        let worker: any = null

        if (this.workerThreads) {
          const { Worker } = this.workerThreads
          worker = new Worker(input.workerScript, {
            workerData: { name: this.getInputMessenger(input) },
          })
          logging.info(this.name, 'created worker_threads worker for', input.name)
        } else if (typeof Worker !== 'undefined') {
          worker = new Worker(input.workerScript, { name: this.getInputMessenger(input) })
          logging.info(this.name, 'created web worker for', input.name)
        } else {
          logging.error(this.name, 'encountered an unknown worker environment.')
          throw new Error(`${this.name} encountered an unknown worker environment.`)
        }

        this.inputs.set(input.name, input)
        this.workers.set(input.name, worker)
        this.messagingService.addWorker(input.name, worker)

        logging.info(this.name, 'added', input.name)

        const inputHandlers = new Map<State, (inputName: string) => void>()

        const initializedPromise = new Promise<void>(async (resolve, reject) => {
          const initializedHandler = (inputName: string) => {
            if (inputName === input.name) {
              resolve()
            }
          }
          inputHandlers.set(State.INITIALIZED, initializedHandler)
        })

        inputInitializedPromises.push(initializedPromise)

        this.inputStateHandlers.set(input.name, inputHandlers)

        logging.debug(this.name, 'initializing', input.name)
        this.messagingService.sendMessage(
          new InitializeCommand(this.getInputMessenger(input), input.config)
        )
      })

      Promise.all(inputInitializedPromises)
        .then(() => {
          logging.debug(this.name, 'sending initialized status.')
          this.messagingService.sendMessage(
            new StatusUpdate(this.getWorkflowMessenger(), State.INITIALIZED)
          )
        })
        .catch((err) => {
          logging.error(this.name, 'error initializing inputs:', err)
          throw err
        })
    }

    if (inputConfiguration.outputs) {
      this.outputs = inputConfiguration.outputs
    }
  }

  private handleStartCommand(startCommand: StartCommand) {
    this.started = Date.now()

    logging.debug(this.name, 'sending starting status update.')
    this.messagingService.sendMessage(
      new StatusUpdate(this.getWorkflowMessenger(), State.STARTING, this.started)
    )

    const inputRunningPromises: Promise<void>[] = []
    const inputDonePromises: Promise<void>[] = []

    this.inputs.forEach((input, key) => {
      const runningPromise = new Promise<void>(async (resolve, reject) => {
        const runningHandler = (inputName: string) => {
          if (inputName === input.name) {
            resolve()
          }
        }
        this.inputStateHandlers.get(input.name)?.set(State.RUNNING, runningHandler)
      })

      inputRunningPromises.push(runningPromise)

      const donePromise = new Promise<void>(async (resolve, reject) => {
        const doneHandler = async (inputName: string) => {
          if (inputName === input.name) {
            this.messagingService.removeWorker(input.name)
            await this.workers.get(inputName)?.terminate()
            logging.info(this.name, 'terminated', inputName, 'worker.')
            this.workers.delete(inputName)
            this.inputStateHandlers.delete(inputName)
            resolve()
          }
        }
        this.inputStateHandlers.get(input.name)?.set(State.DONE, doneHandler)
      })

      inputDonePromises.push(donePromise)

      logging.info(this.name, 'starting', input.name)
      this.messagingService.sendMessage(new StartCommand(this.getInputMessenger(input)))
    })

    Promise.all(inputRunningPromises)
      .then(() => {
        logging.debug(this.name, 'sending running status update.')
        this.messagingService.sendMessage(
          new StatusUpdate(this.getWorkflowMessenger(), State.RUNNING, this.started)
        )
      })
      .catch((err) => {
        logging.error(this.name, 'error waiting for inputs to start:', err)
        this.failed(`${this.name} error waiting for inputs to start.`, err)
      })

    Promise.all(inputDonePromises)
      .then(() => {
        this.outputs.forEach(async (output) => {
          const closeOutput = new CloseOutput(this.getWorkflowMessenger(), output)
          await this.messagingService.sendMessage(closeOutput)
          logging.info(this.name, 'closed', output)
        })
        logging.info(this.name, 'finished successfully.')
        this.success({ message: 'Finished successfully.' })
      })
      .catch((err) => {
        logging.error(this.name, 'error waiting for inputs to finish:', err)
        this.failed(`${this.name} error waiting for inputs to finish.`, err)
      })
  }

  private handleStopCommand(stopCommand: StopCommand) {
    logging.debug(this.name, 'sending stopping status update.')
    this.messagingService.sendMessage(
      new StatusUpdate(this.getWorkflowMessenger(), State.STOPPING, this.started)
    )

    const stepStoppedPromises: Promise<void>[] = []

    this.inputs.forEach((input, key) => {
      const stoppedPromise = new Promise<void>(async (resolve, reject) => {
        const stoppedHandler = (inputName: string) => {
          if (inputName === input.name) {
            resolve()
          }
        }
        this.inputStateHandlers.get(input.name)?.set(State.STOPPED, stoppedHandler)
      })

      stepStoppedPromises.push(stoppedPromise)

      logging.info(this.name, 'stopping', input.name)
      this.messagingService.sendMessage(new StopCommand(this.getInputMessenger(input)))
    })

    Promise.all(stepStoppedPromises)
      .then(() => {
        logging.debug(this.name, 'sending stopped status update.')
        this.messagingService.sendMessage(
          new StatusUpdate(this.getWorkflowMessenger(), State.STOPPED, this.started)
        )
        logging.info(this.name, 'stopped.')
        this.cancled({ message: 'Stopped.' })
      })
      .catch((err) => {
        logging.error(this.name, 'error while stopping inputs:', err)
        this.failed(`${this.name} error while stopping inputs.`, err)
      })
  }

  private handleInputState(inputName: string, state: State) {
    const inputHandlers = this.inputStateHandlers.get(inputName)

    if (inputHandlers) {
      const stateHandler = inputHandlers.get(state)

      if (stateHandler) {
        stateHandler(inputName)
      }

      inputHandlers.delete(state)
    } else {
      logging.debug(this.name, 'no handlers found for', inputName)
    }
  }

  private getWorkflowMessenger(): Messenger {
    return messengerAsString(messengerAsArray(this.name).slice(0, -1))
  }

  private getInputMessenger(input: StepInput): string {
    const inputMessenger = messengerAsArray(this.name)
    inputMessenger.push(input.name)
    return messengerAsString(inputMessenger)
  }

  protected unknown(message: string, context?: any) {
    this.sendDone(ResultType.UNKNOWN, message, context)
  }

  protected success(result?: Result) {
    if (result) {
      this.sendDone(ResultType.SUCCESS, result.message, result.context)
    } else {
      this.sendDone(ResultType.SUCCESS, 'Finished successfully.')
    }
  }

  protected failed(message: string, context?: any) {
    this.sendDone(ResultType.FAILED, message, context)
  }

  protected cancled(result?: Result) {
    if (result) {
      this.sendDone(ResultType.CANCLED, result.message, result.context)
    } else {
      this.sendDone(ResultType.CANCLED, 'Stopped.')
    }
  }

  private sendDone(type: ResultType, message: string, context?: any) {
    const result: StepResult = {
      type: type,
      started: this.started ?? Date.now(),
      ended: Date.now(),
      message: message,
      context: context,
      inputs: this.inputResults,
    }

    logging.info(this.name, 'sending done status update.')
    this.messagingService.sendMessage(
      new StatusUpdate(
        this.getWorkflowMessenger(),
        State.DONE,
        this.started,
        result.message,
        result
      )
    )
  }
}

// create an instance of the class - this creates an instance of MessagingService and binds it to listen on this context
const worker = StepWorker.getInstance()
