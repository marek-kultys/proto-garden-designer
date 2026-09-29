/**
 * What each plant does that the model does not.
 *
 * `PLANTS.md` marks every plant FULL or PARTIAL, and a PARTIAL one carries a
 * sentence saying what is missing. Those sentences used to live only in that
 * document, which meant a gap could be closed in the code and go on being
 * claimed in the checklist, or a new plant could arrive with no judgement at
 * all. They live here instead, beside the library they describe: a plant listed
 * below is PARTIAL, a plant absent from it is FULL, and `PLANTS.md` is written
 * from this file rather than by hand.
 *
 * Four of these gaps are shared — the climber cap, the dahlias' tenderness, the
 * trained trees drawn flat, the shrubs not marked as clipped — so their wording
 * is written once and referenced. That is not tidiness: when one of them is
 * fixed, the fix should delete one constant rather than hunt eighteen copies of
 * the same sentence.
 *
 * A gap is about the *model*, not the plant. "Biennial in life but modelled as
 * a perennial" belongs here; "prone to mildew" belongs in the plant's notes.
 */

const CLIMBER_CAP =
  'Height is capped at 2.2 m and there is no wall or pergola to attach to, so above that it spreads sideways instead of climbing.';

const TENDER_TUBER =
  'A tender tuber lifted or heavily mulched in most of the UK, but not marked as one, so it is modelled as a permanently hardy perennial.';

const TRAINED_FLAT =
  'Drawn face-on in the elevation and 360° view whichever way it is turned, and throws a round shadow rather than a flat one.';

const UNCLIPPED_SHRUB =
  'Not marked as a clipped subject, so it reaches full shrub size instead of holding a hedge height.';

/** Plant id → the one thing it does in life that the app does not model. */
export const PLANT_GAPS: Readonly<Record<string, string>> = {
  'akebia-quinata': CLIMBER_CAP,
  'alcea-rosea':
    'No winter standing window, so the tall seed spikes vanish rather than standing into winter.',
  'campsis-radicans': CLIMBER_CAP,
  'clematis-armandii': CLIMBER_CAP,
  'clematis-montana': CLIMBER_CAP,
  'clematis-viticella': CLIMBER_CAP,
  'cordon-tree': TRAINED_FLAT,
  'cyclamen-coum':
    'Winter-growing cycle approximated: shown in leaf from January, which is right for eight months of the year and wrong for four.',
  'dahlia-bishop-of-dover': TENDER_TUBER,
  'dahlia-bishop-of-llandaff': TENDER_TUBER,
  'dahlia-bishop-of-oxford': TENDER_TUBER,
  'dahlia-bishop-of-york': TENDER_TUBER,
  'dahlia-cafe-au-lait': TENDER_TUBER,
  'digitalis-purpurea':
    'Biennial in life but modelled as a persistent perennial; the notes say so, but the age slider still shows it living for ever.',
  'echium-pininana':
    'Monocarpic — it flowers once and dies — but the age slider models it as persisting.',
  'elaeagnus-submacrophylla': UNCLIPPED_SHRUB,
  'fan-trained-tree':
    'Drawn face-on in the elevation and 360° view whichever way it is turned, and throws a round shadow as wide as it is — which overstates the shadow of something flat against a wall.',
  'hedera-helix': CLIMBER_CAP,
  'humulus-lupulus-aureus': CLIMBER_CAP,
  'hydrangea-limelight':
    'No winter standing window, so the dried cone heads — half the reason for growing it — vanish in autumn.',
  'hydrangea-petiolaris': CLIMBER_CAP,
  'hydrangea-serrata':
    'No winter standing window, so the dried lacecap heads vanish in autumn rather than standing.',
  'ilex-aquifolium':
    'Not marked as a clipped subject, so a clipped holly hedge or standard grows into a full tree.',
  'jasminum-nudiflorum': CLIMBER_CAP,
  'jasminum-polyanthum': CLIMBER_CAP,
  'lathyrus-odoratus': CLIMBER_CAP,
  'lonicera-japonica-halliana': CLIMBER_CAP,
  'muscari-armeniacum':
    'In life the leaves come up in autumn and lie about all winter; the seasonal model runs bud burst to leaf fall inside one year, so it is drawn with an ordinary spring cycle instead.',
  'olea-europaea-ancient':
    'Drawn with the young olive’s single straight trunk; the massive, gnarled trunk that is the whole point of an ancient specimen is not drawn.',
  'parthenocissus-tricuspidata': CLIMBER_CAP,
  'passiflora-caerulea': CLIMBER_CAP,
  'photinia-red-robin': UNCLIPPED_SHRUB,
  'pleached-tree': TRAINED_FLAT,
  'rosa-madame-alfred-carriere': CLIMBER_CAP,
  'trachelospermum-jasminoides': CLIMBER_CAP,
  'viburnum-tinus':
    'Not marked as a clipped subject, so it reaches full size instead of holding a clipped dome.',
  'vitis-coignetiae': CLIMBER_CAP,
  'wisteria-sinensis': CLIMBER_CAP,
  'yucca-rostrata':
    'Drawn with a palm’s drooping crown on its trunk rather than a stiff sphere of blue leaves, and its flower spike is not drawn.',
};

/** The sentence for a PARTIAL plant, or null when the plant is fully modelled. */
export function plantGap(id: string): string | null {
  return PLANT_GAPS[id] ?? null;
}
