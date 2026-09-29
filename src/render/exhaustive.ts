/**
 * The case nobody wrote.
 *
 * Every drawing decision that branches on a plant's shape is a list of cases,
 * and adding a shape to that list is the one edit a person reliably forgets.
 * The type checker will catch it — but only if something asks it to, because a
 * `switch` with a `default` is perfectly valid code with a shape missing from
 * it, and the app goes on drawing: a generic tree in the side view, a blob on
 * the plan, and in the skeleton builder nothing at all.
 *
 * Passing the value here is what asks. In the last branch of an exhaustive
 * switch the value's type has narrowed to `never`, so the call compiles; leave
 * a shape out and it has not, and the build fails naming the shape. Four new
 * shapes went in last month and any of them could have slipped through.
 *
 * It does not throw. A type error has already been raised at the only moment
 * that can help — before the drawing is ever run — and a throw here would black
 * out a whole canvas at the moment someone is trying to see what they have
 * drawn. The callers keep whatever sensible fallback they had.
 */
export function unhandled(value: never, what: string): void {
  if (import.meta.env.DEV) {
    console.warn(`${what}: nothing drawn for ${JSON.stringify(value)}`);
  }
}
