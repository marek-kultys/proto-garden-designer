import { getSpecies } from '../../model/plants';
import type { PlantInstance, Vec2 } from '../../model/types';
import { newId } from '../ids';
import type { SliceOf } from '../slice';
import { pushHistory } from './history';

/**
 * How old a plant is when it goes in, in years of growth already made.
 *
 * Nursery stock is what you buy by default. Ten years is the semi-mature
 * specimen a designer brings in when a garden needs structure on day one rather
 * than in a decade — one tree, usually, at many times the price.
 */
export const PLACEMENT_AGES = [
  { label: 'Nursery stock', years: 0 },
  { label: '10 years old', years: 10 },
];

export interface PlantsSlice {
  plants: PlantInstance[];
  /**
   * The head start given to the next plant placed. A tool setting rather than
   * part of the design, so it is deliberately not saved with one.
   */
  placementAge: number;
  addPlant: (speciesId: string, at: Vec2) => void;
  setPlacementAge: (years: number) => void;
  /** Turn a climber's plane to follow the fence it is growing on. */
  setPlantFacing: (id: string, degrees: number) => void;
  movePlant: (id: string, at: Vec2) => void;
  removePlant: (id: string) => void;
  /** Plant another of the same kind, just off the original. */
  duplicatePlant: (id: string) => void;
  clearPlants: () => void;
}

export const plantsSlice: SliceOf<PlantsSlice> = (set) => ({
  plants: [],
  placementAge: 0,

  addPlant: (speciesId, at) =>
    set((s) => {
      const history = pushHistory(s, 'Add plant');
      const plant: PlantInstance = {
        id: newId(),
        speciesId,
        x: at.x,
        y: at.y,
        seed: Math.floor(Math.random() * 1e9),
        plantedAge: s.placementAge,
      };
      return { ...history, plants: [...s.plants, plant], selectedId: plant.id };
    }),

  setPlacementAge: (years) => set({ placementAge: Math.max(0, years) }),

  setPlantFacing: (id, degrees) =>
    set((s) => ({
      // Coalesced: turning the dial fires continuously, and one undo step per
      // degree would bury whatever came before it.
      ...pushHistory(s, 'Turn plant', `facing:${id}`),
      // A plane reads the same from either side, so the useful range is a half
      // turn; anything else is the same plane described twice.
      plants: s.plants.map((p) => (p.id === id ? { ...p, facing: ((degrees % 180) + 180) % 180 } : p)),
    })),

  movePlant: (id, at) =>
    set((s) => ({
      // Keyed on the plant, so one drag is one undo step but moving two plants
      // in turn stays two.
      ...pushHistory(s, 'Move plant', `move:${id}`),
      plants: s.plants.map((p) => (p.id === id ? { ...p, x: at.x, y: at.y } : p)),
    })),

  removePlant: (id) =>
    set((s) => ({
      ...pushHistory(s, 'Remove plant'),
      plants: s.plants.filter((p) => p.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  duplicatePlant: (id) =>
    set((s) => {
      const source = s.plants.find((p) => p.id === id);
      if (!source) return {};
      const history = pushHistory(s, 'Add another');
      const spread = getSpecies(source.speciesId).matureSpread;
      // Offset by a share of the mature spread so the copy lands beside its
      // parent rather than exactly on top of it, where it would be invisible
      // and impossible to grab.
      const step = Math.max(0.4, Math.min(2.5, spread * 0.55));
      const copy: PlantInstance = {
        id: newId(),
        speciesId: source.speciesId,
        x: source.x + step,
        y: source.y + step * 0.35,
        // A fresh seed: a second plant of the same kind, not a clone of the
        // same individual. Two hostas in a border are never identical.
        seed: Math.floor(Math.random() * 1e9),
        // The same age as the one it was taken from, not whatever the tool is
        // currently set to — "add another" means another of *that* plant.
        plantedAge: source.plantedAge,
      };
      return { ...history, plants: [...s.plants, copy], selectedId: copy.id };
    }),

  // The one genuinely destructive action here, and the reason undo exists.
  clearPlants: () =>
    set((s) => ({ ...pushHistory(s, 'Clear planting'), plants: [], selectedId: null })),
});
