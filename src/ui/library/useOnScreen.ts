import { useEffect, useState, type RefObject } from 'react';

/**
 * Has this element come near the screen yet?
 *
 * The library holds a card per plant — nearly three hundred of them — and about
 * half a dozen fit on screen at once. Drawing all of them on mount cost fourteen
 * megabytes of canvas and a visible stall every time a filter was cleared, all
 * of it spent on portraits nobody was looking at.
 *
 * The answer only ever goes from false to true. A portrait that has been drawn
 * stays drawn; this is about never doing the work early, not about undoing it
 * when you scroll away.
 */

/**
 * How far ahead of the screen an element counts as near.
 *
 * Generous on purpose, and the figure is measured rather than guessed. The
 * browser only reports an element as near on the next frame, so a fast scroll
 * can outrun the drawing: dragging the scrollbar the length of the library in a
 * second — about four hundred pixels a frame, faster than any wheel or trackpad
 * — left a card briefly empty at four hundred pixels of warning, and none at
 * eight hundred. The cost of the extra margin is six more portraits drawn ahead
 * of you — fifteen in all, which on a retina screen is three quarters of a
 * megabyte against the fourteen above.
 */
const NEAR = '800px';

/**
 * Which box the lookahead is measured from.
 *
 * Not the window, which is the tempting default and silently useless here: a
 * card below the fold of the library's own scrolling box is clipped out of the
 * window entirely, so it never counts as near until it is actually visible, and
 * the margin above buys nothing. Measured against the scrolling box itself, the
 * margin means what it says.
 *
 * Found by walking up rather than passed down, because which element scrolls is
 * a fact about the layout, and passing it down would thread a prop through two
 * components that have no other interest in scrolling. Null means the page
 * itself scrolls.
 */
function scrollingBox(el: Element): Element | null {
  for (let node = el.parentElement; node !== null; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') return node;
  }
  return null;
}

/**
 * One observer per scrolling box rather than one per card. Three hundred
 * observers all watching the same scroll would each report separately; one
 * reports them in a single batch.
 */
const waiting = new Map<Element, () => void>();
const observers = new Map<Element | null, IntersectionObserver>();

function observerFor(root: Element | null): IntersectionObserver {
  const known = observers.get(root);
  if (known !== undefined) return known;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const arrived = waiting.get(entry.target);
        if (arrived === undefined) continue;
        waiting.delete(entry.target);
        io.unobserve(entry.target);
        arrived();
      }
    },
    { root, rootMargin: NEAR },
  );
  observers.set(root, io);
  return io;
}

export function useOnScreen(ref: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (el === null) return;

    // Without the observer — an old browser, or a test with no layout — the
    // honest fallback is to draw everything. A missing optimisation is a slow
    // library; a missing portrait is a broken one.
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }

    const io = observerFor(scrollingBox(el));
    waiting.set(el, () => setNear(true));
    io.observe(el);
    return () => {
      waiting.delete(el);
      io.unobserve(el);
    };
  }, [ref, near]);

  return near;
}
