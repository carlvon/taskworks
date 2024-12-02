import { Link } from '../../types/link'
import { State } from '../../types/state'

import logging from '../../logging'

/**
 * This class represents a buffered link for data transfer between processing steps.
 * It provides methods for writing and reading data while managing buffer size and state.
 */
export class BufferedLink {
  private buffer: any[] = []
  private maxBufferSize: number
  private state: State = State.OPEN

  private resolveRead?: (value: any) => void
  private rejectRead?: (value: any) => void

  private resolveWrite?: (value: any) => void
  private rejectWrite?: (value: any) => void

  link: Link

  /**
   * Initializes the BufferedLink with the provided link and maximum buffer size.
   * @param link The Link object representing the data transfer connection.
   * @param maxBufferSize The maximum number of items allowed in the buffer (default 100).
   */
  constructor(link: Link, maxBufferSize: number = 100) {
    this.link = link
    this.maxBufferSize = maxBufferSize
    logging.info(this.getName(), 'link created')
  }

  /**
   * Checks if the buffer is full.
   * @returns `true` if the buffer is full, `false` otherwise.
   */
  isFull(): boolean {
    return this.buffer.length >= this.maxBufferSize
  }

  /**
   * Checks if the buffer is empty.
   * @returns `true` if the buffer is empty, `false` otherwise.
   */
  isEmpty(): boolean {
    return this.buffer.length === 0
  }

  /**
   * Checks if the link is open.
   * @returns `true` if the link is open, `false` otherwise.
   */
  isOpen(): boolean {
    return this.state === State.OPEN
  }

  /**
   * Checks if the link is closed.
   * @returns `true` if the link is closed, `false` otherwise.
   */
  isClosed(): boolean {
    return this.state === State.CLOSED
  }

  /**
   * Closes the link and updates its state.
   */
  close() {
    this.state = State.CLOSED
    logging.info(this.getName(), 'link closed')
  }

  /**
   * Writes data to the buffer with flow control using promises.
   * Throws an error if the link is closed.
   * @param data The data to write to the buffer.
   * @returns A Promise that resolves to `true` if the data was written successfully, or `false` if the link was closed.
   */
  async writeData(data: any): Promise<boolean> {
    // Wait for buffer space if it's full and the link is open
    while (this.isFull() && this.isOpen()) {
      await new Promise((resolve, reject) => {
        this.resolveWrite = resolve
        this.rejectWrite = reject
      })
    }

    if (!this.isOpen()) {
      throw new Error(`Unable to write data to closed link "${this.getName()}"`)
    }

    // Add data to the end of the buffer
    this.buffer.push(data)

    // Notify any waiting reader that data is available
    if (this.resolveRead) {
      const resolve = this.resolveRead
      this.resolveRead = undefined
      resolve(true)
    }

    logging.debug(this.getName(), 'data written to link:', data)
    return this.isOpen()
  }

  /**
   * Reads data from the buffer with flow control using promises.
   * Returns `null` if the link is closed and the buffer is empty.
   * @returns A Promise that resolves to the read data, or `null` if the link is closed and the buffer is empty.
   */
  async readData(): Promise<any> {
    // Wait for buffer data if it's empty and the link is open
    while (this.isEmpty() && this.isOpen()) {
      await new Promise((resolve, reject) => {
        this.resolveRead = resolve
        this.rejectRead = reject
      })
    }

    // Return null if the buffer is empty and the link is closed
    if (this.isEmpty() && !this.isOpen()) {
      return null
    }

    // Retrieve data item from the beginnig of the buffer
    const data = this.buffer?.shift()

    // Notify any waiting writer that the buffer has space
    if (this.resolveWrite && data) {
      const resolve = this.resolveWrite
      this.resolveWrite = undefined
      resolve(true)
    }

    logging.debug(this.getName(), 'data read from link:', data)
    return data
  }

  /**
   * Returns a descriptive name for the link based on the description or link input/output.
   * @returns The link name (description if available, or constructed from input/output steps).
   */
  private getName(): string {
    if (this.link.description) {
      return this.link.description
    } else {
      return `${this.link.input.step}/${this.link.input.output} -> ${this.link.output.step}/${this.link.output.input}`
    }
  }
}
