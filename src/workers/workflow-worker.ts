import {
  GeneralMessage,
  MessagingService,
  messengerAsArray,
  messengerAsString,
  messengerIsUpstream,
} from 'messageworks'

import {
  InitializeCommand,
  StartCommand,
  StopCommand,
  StatusUpdate,
  ReadRequest,
  ReadResponse,
  WriteRequest,
  WriteResponse,
  CloseOutput,
} from '../models/messaging'

import { Status } from '../types/status'
import { State } from '../types/state'

import { Result } from '../types/result'
import { ResultType } from '../types/result-type'

import { Workflow } from '../types/workflow'
import { WorkflowResult } from '../types/workflow-result'

import { Step } from '../types/step'
import { StepResult } from '../types/step-result'

import { Links } from '../models/core/links'
import { Link } from '../types/link'

import { getSourceInputName, getSourceStepName } from '../utils/message-utils'

import logging from '../logging'

export class WorkflowWorker {
  public static instance: WorkflowWorker | null = null
  public static instancePromise: Promise<WorkflowWorker> | null = null

  private workerThreads: typeof import('worker_threads') | undefined = undefined

  public name: string = '???'
  private messagingService!: MessagingService
  private started: number | undefined

  private steps: Map<string, Step> = new Map()
  private stepStatus: Map<string, Status> = new Map()

  protected stepStateHandlers: Map<string, Map<State, (stepName: string) => void>> = new Map()

  protected workers: Map<string, any> = new Map()

  protected stepResults: Record<string, StepResult> = {}

  protected links: Links = new Links()

  private constructor() {}

  public static async getInstance(): Promise<WorkflowWorker> {
    if (!WorkflowWorker.instance) {
      this.instancePromise = new Promise<WorkflowWorker>(async (resolve, reject) => {
        try {
          WorkflowWorker.instance = new WorkflowWorker()

          if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            WorkflowWorker.instance.workerThreads = await import('worker_threads')
            const { workerData } = WorkflowWorker.instance.workerThreads
            WorkflowWorker.instance.name = workerData.name
            logging.info(workerData.name, 'running in node.')
          } else if (typeof self !== 'undefined' && self.name) {
            WorkflowWorker.instance.name = self.name
            logging.info(self.name, 'running in browser.')
          } else {
            logging.error(`Workflow encountered an unknown worker environment.`)
            throw new Error(`Workflow encountered an unknown worker environment.`)
          }

          await WorkflowWorker.instance.initializeMessagingService()

          logging.debug(WorkflowWorker.instance.name, 'sending uninitialized status update.')
          WorkflowWorker.instance.messagingService.sendMessage(
            new StatusUpdate(WorkflowWorker.instance.getEngineMessenger(), State.UNINITIALIZED)
          )

          resolve(WorkflowWorker.instance)
        } catch (err) {
          logging.error(`Error creating workflow instance:`, err)
          reject(err)
        }
      })
    }

    return WorkflowWorker.instancePromise!
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

  protected async messageReceived(message: GeneralMessage<any>) {
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
      const stepName = getSourceStepName(message)
      const step = this.steps.get(stepName)

      if (step) {
        if (message.name === StatusUpdate.NAME) {
          this.handleStepStatusUpdate(stepName, message as StatusUpdate)
        } else if (message.name === WriteRequest.NAME) {
          await this.handleStepWriteRequest(stepName, message as WriteRequest)
        } else if (message.name === ReadRequest.NAME) {
          await this.handleStepReadRequest(stepName, message as ReadRequest)
        } else if (message.name === CloseOutput.NAME) {
          this.handleStepCloseOutput(stepName, message as CloseOutput)
        }
      }
    }
  }

  private handleInitializeCommand(initializeCommand: InitializeCommand) {
    logging.debug(this.name, 'sending initializing status update.')
    this.messagingService.sendMessage(
      new StatusUpdate(this.getEngineMessenger(), State.INITIALIZING)
    )

    const workflowConfiguration: Workflow = initializeCommand.data
    const stepConfiguration: Step[] = workflowConfiguration.steps
    const linkConfiguration: Link[] = workflowConfiguration.links

    if (stepConfiguration) {
      const stepInitializedPromises: Promise<void>[] = []

      linkConfiguration.forEach((link, index) => {
        this.links.addLink(link)
      })

      stepConfiguration.forEach((step, index) => {
        let worker: any = null

        if (this.workerThreads) {
          const { Worker } = this.workerThreads
          worker = new Worker('./dist/workers/step-worker.js', {
            workerData: { name: this.getStepMessenger(step) },
          })
          logging.info(this.name, 'created worker_threads worker for', step.name)
        } else if (typeof Worker !== 'undefined') {
          worker = new Worker('./dist/workers/step-worker.js', {
            name: this.getStepMessenger(step),
          })
          logging.info(this.name, 'created web worker for', step.name)
        } else {
          logging.error(this.name, 'encountered an unknown worker environment.')
          throw new Error(`${this.name} encountered an unknown worker environment.`)
        }

        this.steps.set(step.name, step)
        this.workers.set(step.name, worker)
        this.messagingService.addWorker(step.name, worker)

        logging.info(this.name, 'added', step.name)

        const stepHandlers = new Map<State, (stepName: string) => void>()

        const initializedPromise = new Promise<void>(async (resolve, reject) => {
          const initializedHandler = (stepName: string) => {
            if (stepName === step.name) {
              resolve()
            }
          }
          stepHandlers.set(State.INITIALIZED, initializedHandler)
        })

        stepInitializedPromises.push(initializedPromise)

        this.stepStateHandlers.set(step.name, stepHandlers)

        logging.debug(this.name, 'initializing', step.name)
        this.messagingService.sendMessage(new InitializeCommand(this.getStepMessenger(step), step))
      })

      Promise.all(stepInitializedPromises)
        .then(() => {
          logging.debug(this.name, 'sending initialized status update.')
          this.messagingService.sendMessage(
            new StatusUpdate(this.getEngineMessenger(), State.INITIALIZED)
          )
        })
        .catch((err) => {
          logging.error(this.name, 'error initializing steps', err)
          this.failed(`${this.name} error initializing steps.`, err)
        })
    }
  }

  private handleStartCommand(startCommand: StartCommand) {
    this.started = Date.now()

    logging.debug(this.name, 'sending starting status update.')
    this.messagingService.sendMessage(
      new StatusUpdate(this.getEngineMessenger(), State.STARTING, this.started)
    )

    const stepRunningPromises: Promise<void>[] = []
    const stepDonePromises: Promise<void>[] = []

    this.steps.forEach((step, key) => {
      const runningPromise = new Promise<void>(async (resolve, reject) => {
        const runningHandler = (stepName: string) => {
          if (stepName === step.name) {
            resolve()
          }
        }
        this.stepStateHandlers.get(step.name)?.set(State.RUNNING, runningHandler)
      })

      stepRunningPromises.push(runningPromise)

      const donePromise = new Promise<void>(async (resolve, reject) => {
        const doneHandler = async (stepName: string) => {
          if (stepName === step.name) {
            this.messagingService.removeWorker(step.name)
            await this.workers.get(stepName)?.terminate()
            logging.debug(this.name, 'terminated', stepName, 'worker.')
            this.workers.delete(stepName)
            this.stepStateHandlers.delete(stepName)
            resolve()
          }
        }
        this.stepStateHandlers.get(step.name)?.set(State.DONE, doneHandler)
      })

      stepDonePromises.push(donePromise)

      logging.info(this.name, 'starting', step.name)
      this.messagingService.sendMessage(new StartCommand(this.getStepMessenger(step)))
    })

    Promise.all(stepRunningPromises)
      .then(() => {
        logging.debug(this.name, 'sending running status update.')
        this.messagingService.sendMessage(
          new StatusUpdate(this.getEngineMessenger(), State.RUNNING, this.started)
        )
      })
      .catch((err) => {
        logging.error(this.name, 'error waiting for steps to start:', err)
        this.failed(`${this.name} error waiting for steps to start.`, err)
      })

    Promise.all(stepDonePromises)
      .then(() => {
        logging.info(this.name, 'finished successfully.')
        this.success({ message: 'Finished successfully.' })
      })
      .catch((err) => {
        logging.error(this.name, 'error waiting for steps to finish:', err)
        this.failed(`${this.name} error waiting for steps to finish.`, err)
      })
  }

  private handleStopCommand(stopCommand: StopCommand) {
    logging.debug(this.name, 'sending stopping status update.')
    this.messagingService.sendMessage(
      new StatusUpdate(this.getEngineMessenger(), State.STOPPING, this.started)
    )

    const stepStoppedPromises: Promise<void>[] = []

    this.steps.forEach((step, key) => {
      const stoppedPromise = new Promise<void>(async (resolve, reject) => {
        const stoppedHandler = (stepName: string) => {
          if (stepName === step.name) {
            resolve()
          }
        }
        this.stepStateHandlers.get(step.name)?.set(State.STOPPED, stoppedHandler)
      })

      stepStoppedPromises.push(stoppedPromise)

      logging.info(this.name, 'stopping', step.name)
      this.messagingService.sendMessage(new StopCommand(this.getStepMessenger(step)))
    })

    Promise.all(stepStoppedPromises)
      .then(() => {
        logging.debug(this.name, 'sending stopped status update.')
        this.messagingService.sendMessage(
          new StatusUpdate(this.getEngineMessenger(), State.STOPPED, this.started)
        )

        logging.info(this.name, 'stopped.')
        this.cancled({ message: 'Stopped.' })
      })
      .catch((err) => {
        logging.error(this.name, 'error waiting for steps to stop:', err)
        this.failed(`${this.name} error waiting for steps to stop.`, err)
      })
  }

  private handleStepStatusUpdate(stepName: string, statusUpdate: StatusUpdate) {
    const status = statusUpdate.data

    if (status) {
      if (status.state === State.DONE) {
        this.stepResults[stepName] = status.context as StepResult
        if (this.stepResults[stepName].type === ResultType.FAILED) {
          logging.error(this.name, stepName, 'failed.')
          this.failed(`${this.name} ${stepName} failed.`)
        }
      }
      this.stepStatus.set(stepName, status)
      this.handleStepState(stepName, status.state)
    }
  }

  private async handleStepWriteRequest(stepName: string, writeRequest: WriteRequest) {
    const output = writeRequest.output
    const data = writeRequest.data

    const link = this.links.getLink({ step: stepName, output: output })

    if (link) {
      logging.debug(this.name, 'writing to link:', link.link.input)
      await link.writeData(data)
    } else {
      logging.error(this.name, 'no link found for', stepName, '/', output)
    }

    const writeResponse = new WriteResponse(writeRequest, link?.isOpen() ?? false)

    logging.debug(this.name, 'sending write response:', writeResponse)
    await this.messagingService.sendMessage(writeResponse)
  }

  private async handleStepReadRequest(stepName: string, readRequest: ReadRequest) {
    const input = getSourceInputName(readRequest)

    const link = this.links.getLink({ step: stepName, input: input })

    let data: any = null

    if (link) {
      logging.debug(this.name, 'reading from link:', link.link.output)
      data = await link.readData()
    } else {
      logging.error(this.name, 'no link found for', stepName, '/', input)
    }

    const readResponse = new ReadResponse(readRequest, data)

    logging.debug(this.name, 'sending read response:', readResponse)
    this.messagingService.sendMessage(readResponse)
  }

  private handleStepCloseOutput(stepName: string, closeOutput: CloseOutput) {
    const output = closeOutput.output

    const link = this.links.getLink({ step: stepName, output: output })

    if (link) {
      logging.info(this.name, 'closing link:', link.link.input)
      link.close()
    } else {
      logging.error(this.name, 'no link found for', stepName, '/', output)
    }
  }

  private handleStepState(stepName: string, state: State) {
    const stepHandlers = this.stepStateHandlers.get(stepName)

    if (stepHandlers) {
      const stateHandler = stepHandlers.get(state)

      if (stateHandler) {
        stateHandler(stepName)
      }

      stepHandlers.delete(state)
    } else {
      logging.debug(this.name, 'no handlers found for', stepName)
    }
  }

  private getEngineMessenger(): string {
    return messengerAsString([])
  }

  private getStepMessenger(step: Step): string {
    const stepMessenger = messengerAsArray(this.name)
    stepMessenger.push(step.name)
    return messengerAsString(stepMessenger)
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
    const result: WorkflowResult = {
      type: type,
      started: this.started ?? Date.now(),
      ended: Date.now(),
      message: message,
      context: context,
      steps: this.stepResults,
    }
    logging.info(this.name, 'sending done status update.')
    this.messagingService.sendMessage(
      new StatusUpdate(this.getEngineMessenger(), State.DONE, this.started, result.message, result)
    )
  }
}

// create an instance of the class - this creates an instance of MessagingService and binds it to listen on this context
const worker = WorkflowWorker.getInstance()
