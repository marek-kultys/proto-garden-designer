import { describe, expect, it } from 'vitest';
import { getForm } from '../form';
import { SPECIES } from '../../model/plants';
import type { Species } from '../../model/types';

/**
 * Every shape the library uses can actually be built and drawn.
 *
 * Three places in the drawing code choose what to do with a plant's shape, and
 * a shape left out of any of them fails silently: the side view drew a generic
 * tree, the plan drew a generic blob, and the skeleton builder produced an
 * empty form — a plant with no outline, no leaf masses and no stems, which
 * draws as nothing at all and cannot look wrong because there is nothing on the
 * paper to look at.
 *
 * All three now refuse to compile with a shape missing, which is the real
 * guard. This is the runtime half: the shapes that exist today each produce
 * something to draw, whatever the type checker thinks.
 */

/** One plant per shape in the library, so every shape is exercised once. */
const BY_HABIT = new Map<Species['habit'], Species>();
for (const species of SPECIES) if (!BY_HABIT.has(species.habit)) BY_HABIT.set(species.habit, species);

const cases = [...BY_HABIT].map(([habit, species]) => [habit, species] as const);

describe('the skeleton every plant is drawn from', () => {
  it('covers every shape the library actually uses', () => {
    // Sixteen today. The number is not asserted — the library test that every
    // shape has a plant using it owns that — but the map must not be empty.
    expect(cases.length).toBeGreaterThan(10);
  });

  it.each(cases)('gives a %s something to draw', (habit, species) => {
    const form = getForm(species, 4242);
    const parts =
      form.outline.length +
      form.planClumps.length +
      form.elevClumps.length +
      form.stems.length +
      form.branches.length +
      (form.trained === undefined ? 0 : 1);
    expect(parts, `${habit} (${species.id}) builds an empty skeleton`).toBeGreaterThan(0);
  });

  it.each(cases)('builds the same %s twice from one seed', (habit, species) => {
    // The forms are cached by id and seed; two plants of one kind sharing a
    // seed must be the same plant, or the drawing would shimmer between frames.
    expect(getForm(species, 77), habit).toEqual(getForm(species, 77));
  });
});
