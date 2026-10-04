/**
 * A fresh id for a plant.
 *
 * Counted rather than random so that two plants placed in the same millisecond
 * cannot collide, and suffixed with noise so that ids from a file opened in
 * this session cannot collide with ids this session goes on to mint.
 */
let counter = 0;
export function newId(): string {
  counter += 1;
  return `p${counter}-${Math.floor(Math.random() * 1e6)}`;
}
