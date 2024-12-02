import { MessagingService, GeneralMessage, messengerAsArray, messengerAsString } from 'messageworks'

import { InitializeCommand, StartCommand, StopCommand, StatusUpdate } from '../models/messaging'

import { Workflow } from '../types/workflow'
import { WorkflowResult } from '../types/workflow-result'
import { WorkflowHandle } from '../types/workflow-handle'

import { Status } from '../types/status'
import { State } from '../types/state'

import logging from '../logging'

/**
 * This class represents the TaskWorks engine, which is responsible for managing workflows.
 * It provides methods for adding, removing, starting, and stopping workflows.
 * The engine also handles communication with worker threads or web workers
 * (depending on the environment) that execute the actual workflow logic.
 */
export class TaskWorksEngine {
  /**
   * The singleton instance of the `TaskWorksEngine`.
   */
  private static instance: TaskWorksEngine | null = null

  /**
   * A promise that resolves to the singleton instance of the `TaskWorksEngine`.
   */
  private static instancePromise: Promise<TaskWorksEngine> | null = null

  /**
   * A reference to the `worker_threads` module, if available.
   */
  private workerThreads: typeof import('worker_threads') | undefined = undefined

  /**
   * The messaging service used for communication between the engine and worker threads.
   */
  protected messagingService!: MessagingService

  /**
   * A map storing registered workflows by their names.
   */
  protected workflows: Map<string, Workflow> = new Map()

  /**
   * A map storing the current status of each workflow.
   */
  protected workflowStatus: Map<string, Status> = new Map()

  /**
   * A map storing handlers for workflow state changes.
   */
  protected workflowStateHandlers: Map<string, Map<State, (workflowName: string) => void>> =
    new Map()

  /**
   * A map storing promises for completed workflows.
   */
  protected workflowDonePromises: Map<string, Promise<any>> = new Map()

  /**
   * A map storing worker threads associated with each workflow.
   */
  protected workers: Map<string, any> = new Map()

  /**
   * A record storing the results of completed workflows.
   */
  protected workflowResults: Record<string, WorkflowResult> = {}

  /**
   * A map storing handlers for workflow result events.
   */
  protected workflowResultHandlers: Map<string, (workflowName: string) => void> = new Map()

  /**
   * A map storing promises for workflow results.
   */
  protected workflowResultPromises: Map<string, Promise<WorkflowResult>> = new Map()

  /**
   * Private constructor to enforce the singleton pattern.
   */
  private constructor() {}

  /**
   * Gets the singleton instance of the `TaskWorksEngine`.
   *
   * @returns A Promise that resolves to the singleton instance.
   */
  public static async getInstance(): Promise<TaskWorksEngine> {
    if (!TaskWorksEngine.instance) {
      this.instancePromise = new Promise<TaskWorksEngine>(async (resolve, reject) => {
        try {
          TaskWorksEngine.instance = new TaskWorksEngine()

          if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            logging.debug(TaskWorksEngine.instance.getName(), 'running in node.')
            TaskWorksEngine.instance.workerThreads = await import('worker_threads')
          }

          await TaskWorksEngine.instance.initializeMessagingService()
          resolve(TaskWorksEngine.instance)
        } catch (err) {
          logging.error(TaskWorksEngine.instance?.getName(), 'error creating instance:', err)
          reject(err)
        }
      })
    }

    return this.instancePromise!
  }

  /**
   * Initializes the messaging service asynchronously.
   *
   * This method retrieves an instance of the `MessagingService`, sets up a callback for received messages,
   * and resolves the promise upon successful initialization.
   *
   * In case of errors during initialization, the promise is rejected with the encountered error.
   *
   * @private
   * @returns {Promise<void>} A promise that resolves when the messaging service is initialized, or rejects on error.
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
        logging.error(this.getName(), 'error initializing messaging service:', err)
        reject(err)
      }
    })
  }

  /**
   * Handles a received message from a workflow asynchronously.
   *
   * This method extracts the workflow name from the message source, retrieves the corresponding workflow
   * instance, and processes the message content based on its type (StatusUpdate).
   *
   * If the message represents a workflow completion (state === DONE), it extracts the result,
   * calls the registered workflow result handler, and updates the internal workflow state.
   *
   * @protected
   * @param {GeneralMessage<any>} message The received message object.
   */
  protected async messageReceived(message: GeneralMessage<any>) {
    const workflowName = messengerAsArray(message.source).slice(-1).toString()
    const workflow = this.workflows.get(workflowName)

    if (workflow) {
      logging.debug(this.getName(), 'message received from', workflowName, 'message:', message)

      if (message.name === StatusUpdate.NAME) {
        const statusUpdate = message as StatusUpdate
        const status = statusUpdate.data

        if (status) {
          if (status.state === State.DONE) {
            this.workflowResults[workflowName] = status.context as WorkflowResult
            const workflowResultHandler = this.workflowResultHandlers.get(workflowName)

            if (workflowResultHandler) {
              workflowResultHandler(workflowName)
            }
          }

          this.workflowStatus.set(workflowName, status)
          this.handleWorkflowState(workflowName, status.state)
        }
      }
    }
  }

  /**
   * Handles state changes for a given workflow.
   *
   * This method checks if there are registered handlers for the specified state.
   * If a handler exists, it is invoked with the workflow name. After the handler
   * is executed, it is removed from the list of handlers to prevent redundant calls.
   *
   * @private
   * @param {string} workflowName The name of the workflow.
   * @param {State} state The new state of the workflow.
   */
  private handleWorkflowState(workflowName: string, state: State) {
    const workflowHandlers = this.workflowStateHandlers.get(workflowName)

    if (workflowHandlers) {
      const stateHandler = workflowHandlers.get(state)

      if (stateHandler) {
        stateHandler(workflowName)
      }

      workflowHandlers.delete(state)
    } else {
      logging.debug(this.getName(), 'no handlers found for', workflowName, 'state:', state)
    }
  }

  /**
   * Adds a new workflow to the system.
   *
   * @param {Workflow} workflow The workflow object to be added.
   * @returns {Promise<WorkflowHandle>} A promise that resolves to a `WorkflowHandle` object
   *   representing the added workflow. Rejects if a workflow with the same name already exists
   *   or an unknown worker environment is encountered.
   *
   * @throws {Error} If a workflow with the same name already exists.
   * @throws {Error} If an unknown worker environment is encountered.
   *
   * @public
   * @async
   *
   * This method adds a new workflow to the system, performing the following steps:
   *
   * 1. Checks for existing workflow with the same name:
   *    - Throws an error if a workflow with the same name already exists.
   * 2. Creates a worker based on the worker environment:
   *    - Creates a worker thread worker using `this.workerThreads` if available.
   *    - Creates a web worker using the global `Worker` object if `this.workerThreads` is
   *      not available and `Worker` exists in the environment.
   *    - Throws an error if neither worker environment is supported.
   * 3. Registers the workflow and worker in internal maps:
   *    - Adds the workflow to the `this.workflows` map.
   *    - Adds the worker to the `this.workers` map.
   * 4. Adds the worker to the messaging service:
   *    - Calls `this.messagingService.addWorker` to register the worker for communication.
   * 5. Sets up a handler for workflow initialization:
   *    - Creates a promise (`initializedPromise`) to resolve when the workflow is initialized.
   *    - Creates a handler function that checks for the workflow name and resolves the promise
   *      with the corresponding `WorkflowHandle`.
   *    - Stores the handler in a map (`workflowStateHandlers`) associated with the workflow name.
   * 6. Initializes the workflow:
   *    - Sends an `InitializeCommand` message using the messaging service to initiate the
   *      workflow's setup process.
   * 7. Returns the promise:
   *    - Returns the `initializedPromise` that resolves with the `WorkflowHandle` once the
   *      workflow is initialized.
   */
  public async addWorkflow(workflow: Workflow): Promise<WorkflowHandle> {
    if (this.workflows.get(workflow.name)) {
      logging.error(this.getName(), workflow.name, 'already exists.')
      throw new Error(`A workflow with the name "${workflow.name}" already exists.`)
    }

    let worker: any = null

    if (this.workerThreads) {
      const { Worker } = this.workerThreads
      worker = new Worker('./dist/workers/workflow-worker.js', {
        workerData: { name: this.getWorkflowMessenger(workflow) },
      })
      logging.info(this.getName(), 'created worker_threads worker for', workflow.name)
    } else if (typeof Worker !== 'undefined') {
      worker = new Worker('./dist/workers/workflow-worker.js', {
        name: this.getWorkflowMessenger(workflow),
      })
      logging.info(this.getName(), 'created web worker for', workflow.name)
    } else {
      logging.error(this.getName(), 'unknown worker environment.')
      throw new Error(`${this.getName()} unknown worker environment.`)
    }

    this.workflows.set(workflow.name, workflow)
    this.workers.set(workflow.name, worker)
    this.messagingService.addWorker(workflow.name, worker)

    logging.info(this.getName(), 'added', workflow.name)

    const workflowHandlers = new Map<State, (workflowName: string) => void>()

    const initializedPromise = new Promise<WorkflowHandle>(async (resolve, reject) => {
      const initializedHandler = (workflowName: string) => {
        if (workflowName === workflow.name) {
          resolve(this.getWorkflowHandle(workflow.name))
        }
      }
      workflowHandlers.set(State.INITIALIZED, initializedHandler)
    })

    this.workflowStateHandlers.set(workflow.name, workflowHandlers)

    logging.info(this.getName(), 'initializing', workflow.name)
    this.messagingService.sendMessage(
      new InitializeCommand(this.getWorkflowMessenger(workflow), workflow)
    )

    return initializedPromise
  }

  /**
   * Removes a workflow from the system.
   *
   * This method asynchronously removes a workflow identified by its name.
   * It performs the following actions:
   *  - Checks if the workflow exists.
   *  - Terminates the associated worker (if any).
   *  - Removes the workflow from internal maps for workers, status, state handlers, and the main workflow collection.
   *  - Logs a message indicating successful removal.
   *
   * @public
   * @async
   * @param {string} workflow - The name of the workflow to remove.
   * @throws {Error} If the workflow is not found.
   * @returns {Promise<void>} A promise that resolves when the workflow is removed.
   */
  public async removeWorkflow(workflow: string): Promise<void> {
    if (!this.workflows.get(workflow)) {
      logging.error(this.getName(), 'unable to find', workflow)
      throw new Error(`${this.getName()} unable to find "${workflow}".`)
    }

    return new Promise<void>(async (resolve, reject) => {
      await this.workers.get(workflow)?.terminate()
      this.workers.delete(workflow)
      this.workflowStatus.delete(workflow)
      this.workflowStateHandlers.delete(workflow)
      this.workflows.delete(workflow)
      logging.info(this.getName(), 'removed', workflow)
      resolve()
    })
  }

  /**
   * Starts a workflow with the given name.
   *
   * @param {string} workflowName - The name of the workflow to start.
   *
   * @throws {Error} - Thrown if the workflow cannot be found or is not
   *                    initialized.
   *
   * @returns {Promise<void>} - A promise that resolves when the workflow
   *                             starts running.
   */
  public async startWorkflow(workflowName: string): Promise<void> {
    const workflow = this.workflows.get(workflowName)

    if (!workflow) {
      logging.error(this.getName(), 'unable to find', workflowName)
      throw new Error(`${this.getName()} unable to find "${workflowName}".`)
    }

    const workflowStatus = this.workflowStatus.get(workflowName)

    if (!workflowStatus || workflowStatus.state !== State.INITIALIZED) {
      logging.error(this.getName(), workflowName, 'is not initialized.')
      throw new Error(`${this.getName()} ${workflowName} is not initialized.`)
    }

    const runningPromise = new Promise<void>(async (resolve, reject) => {
      const runningHandler = (workflowName: string) => {
        if (workflowName === workflowName) {
          resolve()
        }
      }
      this.workflowStateHandlers.get(workflowName)?.set(State.RUNNING, runningHandler)
    })

    this.workflowDonePromises.set(
      workflowName,
      new Promise<void>(async (resolve, reject) => {
        const doneHandler = async (workflowName: string) => {
          if (workflowName === workflowName) {
            this.messagingService.removeWorker(workflowName)
            this.workers.get(workflowName)?.terminate()
            logging.info(this.getName(), 'terminated worker for', workflowName)
            this.workers.delete(workflowName)
            this.workflowStateHandlers.delete(workflowName)
            resolve()
          }
        }
        this.workflowStateHandlers.get(workflowName)?.set(State.DONE, doneHandler)
      })
    )

    logging.info(this.getName(), 'starting', workflowName)
    this.messagingService.sendMessage(new StartCommand(this.getWorkflowMessenger(workflow)))

    return runningPromise
  }

  /**
   * Stops a running workflow.
   *
   * @public
   * @async
   * @param {string} workflowName - The name of the workflow to stop.
   * @throws {Error} - Thrown if the workflow is not found or not currently running.
   * @returns {Promise<void>} - A promise that resolves when the workflow has been stopped.
   */
  public async stopWorkflow(workflowName: string): Promise<void> {
    const workflow = this.workflows.get(workflowName)

    if (!workflow) {
      logging.error(this.getName(), workflowName, 'not found.')
      throw new Error(`${this.getName()} ${workflowName} not found.`)
    }

    const workflowStatus = this.workflowStatus.get(workflowName)

    if (!workflowStatus || workflowStatus.state !== State.RUNNING) {
      logging.error(this.getName(), workflowName, 'is not running.')
      throw new Error(`${this.getName()} ${workflowName} is not running.`)
    }

    const stoppedPromise = new Promise<void>(async (resolve, reject) => {
      const stoppedHandler = (workflowName: string) => {
        if (workflowName === workflowName) {
          resolve()
        }
      }
      this.workflowStateHandlers.get(workflowName)?.set(State.STOPPED, stoppedHandler)
    })

    logging.info(this.getName(), 'stopping', workflowName)
    this.messagingService.sendMessage(new StopCommand(this.getWorkflowMessenger(workflow)))

    return stoppedPromise
  }

  /**
   * Retrieves a handle for a specific workflow if it exists.
   *
   * @private
   * @param {string} workflow - The name of the workflow to retrieve a handle for.
   * @returns {WorkflowHandle} An object representing the retrieved workflow handle,
   *                          containing methods for getting workflow status, result,
   *                          starting, stopping, and removing the workflow.
   * @throws {Error} If the specified workflow is not found.
   */
  private getWorkflowHandle(workflow: string): WorkflowHandle {
    if (!this.workflows.get(workflow)) {
      logging.error(this.getName(), workflow, 'not found.')
      throw new Error(`${this.getName()} ${workflow} not found.`)
    }

    const workflowHandle: WorkflowHandle = {
      name: workflow,
      getStatus: () => {
        return this.workflowStatus.get(workflow)
      },
      getResult: (): Promise<WorkflowResult> => {
        if (this.workflowResultPromises.get(workflow)) {
          return this.workflowResultPromises.get(workflow)!
        }

        const workflowResultPromise = new Promise<WorkflowResult>(async (resolve, reject) => {
          const doneHandler = (workflowName: string) => {
            if (workflowName === workflow) {
              resolve(this.workflowResults[workflow])
            }
          }

          this.workflowResultHandlers.set(workflow, doneHandler)
        })

        this.workflowResultPromises.set(workflow, workflowResultPromise)

        return this.workflowResultPromises.get(workflow)!
      },
      start: (): Promise<void> => {
        return this.startWorkflow(workflow)
      },
      stop: (): Promise<void> => {
        return this.stopWorkflow(workflow)
      },
      remove: (): Promise<void> => {
        return this.removeWorkflow(workflow)
      },
    }

    return workflowHandle
  }

  /**
   * Converts a workflow object to a string representation, suitable for messaging.
   *
   * @private
   * @param {Workflow} workflow - The workflow object to convert.
   * @returns {string} The string representation of the workflow.
   */
  private getWorkflowMessenger(workflow: Workflow): string {
    return messengerAsString(workflow.name)
  }

  /**
   * Returns the name of the TaskWorks engine.
   *
   * @private
   * @returns {string} The name, which is always "TaskWorks engine".
   */
  private getName(): string {
    return 'TaskWorks engine'
  }
}
