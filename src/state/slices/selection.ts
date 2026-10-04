import type { SliceOf } from '../slice';

export interface SelectionSlice {
  selectedId: string | null;
  selectedStructureId: string | null;
  select: (id: string | null) => void;
  /** Step the selection through the instances of one species, for the count badge. */
  selectNextOfSpecies: (speciesId: string) => void;
  selectStructure: (id: string | null) => void;
}

/**
 * What is selected, kept together rather than split between plants and
 * structures, because the one rule worth enforcing spans both: selecting
 * either clears the other.
 */
export const selectionSlice: SliceOf<SelectionSlice> = (set) => ({
  selectedId: null,
  selectedStructureId: null,

  // One selection at a time: the header and the side panel both describe "the
  // selected thing", and two highlights at once would make that a lie.
  select: (id) => set({ selectedId: id, selectedStructureId: null }),
  selectStructure: (id) => set({ selectedStructureId: id, selectedId: null }),

  selectNextOfSpecies: (speciesId) =>
    set((s) => {
      const matches = s.plants.filter((p) => p.speciesId === speciesId);
      if (matches.length === 0) return {};
      const at = matches.findIndex((p) => p.id === s.selectedId);
      // Tapping the badge repeatedly walks round the group rather than sticking
      // on the first one, which is how you find the third of five hostas.
      return { selectedId: matches[(at + 1) % matches.length].id };
    }),
});
