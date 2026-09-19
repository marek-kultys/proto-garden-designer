import type { Species } from '../types';

/**
 * Planting styles: groups of plants a designer reaches for as a set, shown as
 * buttons beside the plant types in the library.
 *
 * Editorial, not botanical. "Mediterranean" here means the dry, sunny, silver
 * and aromatic garden, not plants native to the Mediterranean basin: the list
 * holds Brachyglottis from New Zealand, Baptisia from the American prairie and
 * shrubby sages from Mexico because they do that job, and it holds bugle and
 * edelweiss because they were chosen for it, although bugle's own record says it
 * wants damp shade. That is why membership is written down here rather than
 * worked out from sun and soil — it is a designer's judgement about how plants
 * are used together, not a fact about any one of them.
 *
 * A plant can be in more than one style, and a style can hold plants of any type;
 * the library still groups whatever it shows under Trees, Shrubs and the rest.
 */
export type PlantingStyle = 'mediterranean';

export const STYLE_LABELS: Record<PlantingStyle, string> = {
  mediterranean: 'Mediterranean',
};

export const PLANTING_STYLES = Object.keys(STYLE_LABELS) as PlantingStyle[];

const MEMBERS: Record<PlantingStyle, readonly string[]> = {
  mediterranean: [
    // The plants asked for by name.
    'ballota-pseudodictamnus',
    'brachyglottis-sunshine',
    'salvia-yangii',
    'salvia-caradonna',
    'salvia-jamensis-la-luna',
    'salvia-officinalis',
    'salvia-rosmarinus',
    'rosemary-foxtail',
    'echium-pininana',
    'eremurus-cleopatra',
    'centranthus-ruber',
    'verbascum-gainsborough',
    'phlomis-amazone',
    'baptisia-australis',
    'achillea-terracotta',
    'ajuga-atropurpurea',
    'leontopodium-alpinum',
    'cistus-purpureus',
    'cistus-argenteus',
    'cistus-albidus',
    // The Mediterranean staples already in the library, added so that the
    // button holds what anyone pressing it would expect to find.
    'lavandula-hidcote',
    'santolina-chamaecyparissus',
    'santolina-lemon-fizz',
    'olea-europaea',
    'olea-europaea-ancient',
    'laurus-nobilis',
    'cupressus-totem',
    'arbutus-unedo',
    'euphorbia-characias',
    'euphorbia-wulfenii',
    'stipa-gigantea',
    'phlomis-russeliana',
    'convolvulus-cneorum',
    'helianthemum-nummularium',
    'foeniculum-purpureum',
    'acanthus-mollis',
    'cerinthe-purpurascens',
    'tamarix-tetrandra',
    'allium-sphaerocephalon',
    'nectaroscordum-siculum',
    'festuca-glauca',
    'helictotrichon-sempervirens',
  ],
};

const SETS: Record<PlantingStyle, ReadonlySet<string>> = {
  mediterranean: new Set(MEMBERS.mediterranean),
};

/** The plant ids in a style, in the order they are listed above. */
export function styleMembers(style: PlantingStyle): readonly string[] {
  return MEMBERS[style];
}

export function inStyle(species: Species, style: PlantingStyle): boolean {
  return SETS[style].has(species.id);
}
