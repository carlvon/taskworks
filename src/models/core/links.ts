import { Link } from '../../types/link'
import { InputLink } from '../../types/input-link'
import { OutputLink } from '../../types/output-link'
import { BufferedLink } from './buffered-link'

/**
 * A class that efficiently manages links between steps in a workflow.
 *
 * This class provides methods for adding and retrieving links, ensuring only
 * one link exists between a pair of input and output steps. It uses a `Map`
 * to store links with a unique key based on the step and input/output pair.
 */
export class Links {
  private map = new Map<Set<string>, BufferedLink>()

  /**
   * Adds a new link to the collection.
   *
   * @param link - The `Link` object representing the connection between steps.
   * @throws {Error} - If a link already exists for the same input and output combination.
   */
  public addLink(link: Link) {
    const key = new Set([
      `${link.input.step}/${link.input.output}`,
      `${link.output.step}/${link.output.input}`,
    ])

    if (this.map.has(key)) {
      throw new Error(
        `A link already exists between ${link.input.step}/${link.input.output} and ${link.output.step}/${link.output.input}.`
      )
    }

    const bufferedLink: BufferedLink = new BufferedLink(link)
    this.map.set(key, bufferedLink)
  }

  /**
   * Retrieves a link based on an input or output link object.
   *
   * This method searches the `map` for a link matching the provided `step`
   * and either `output` (for `InputLink`) or `input` (for `OutputLink`).
   *
   * @param link - An `InputLink` or `OutputLink` object.
   * @returns {BufferedLink | undefined} - The retrieved link if found, otherwise `undefined`.
   */
  public getLink(link: InputLink | OutputLink): BufferedLink | undefined {
    for (const [key] of this.map.entries()) {
      if ((link as InputLink).output && key.has(`${link.step}/${(link as InputLink).output}`)) {
        return this.map.get(key)
      } else if (
        (link as OutputLink).input &&
        key.has(`${link.step}/${(link as OutputLink).input}`)
      ) {
        return this.map.get(key)
      }
    }
    return undefined
  }
}
