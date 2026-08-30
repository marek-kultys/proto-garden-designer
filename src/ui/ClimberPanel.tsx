import { getSpecies } from '../model/plants';
import { matureSize } from '../model/growth';
import { useStore } from '../state/store';

/**
 * Which way a selected climber's plane runs.
 *
 * A climber is the one plant here with an orientation that matters. Everything
 * else is drawn as a mass and looks much the same from any side; a climber is a
 * flat thing on a support, and only the person drawing knows whether the fence
 * runs along the boundary, across the end, or diagonally past the shed.
 *
 * Shown only when a climber is selected, because for anything else the question
 * has no meaning.
 */

/**
 * The four alignments a fence commonly takes, named by compass rather than by
 * the angle stored.
 *
 * A plane reads the same from either side, so a half turn covers every case.
 *
 * The stored `facing` is an angle on the drawing, not a compass bearing: at
 * zero the band lies along the screen's x axis, which is only east–west while
 * north happens to point up the page. Since the north dial can put north
 * anywhere, the two are converted rather than assumed equal — otherwise turning
 * the dial would silently make every one of these labels a lie.
 */
const COMPASS = [
  { label: 'N–S', bearing: 0 },
  { label: 'NE–SW', bearing: 45 },
  { label: 'E–W', bearing: 90 },
  { label: 'NW–SE', bearing: 135 },
];

const halfTurn = (deg: number) => ((deg % 180) + 180) % 180;

/** Compass bearing of a plane drawn at this angle on the plan. */
function bearingOfFacing(facing: number, northAngle: number): number {
  return halfTurn(facing + 90 - northAngle);
}

/** And back the other way, to place a plane on a given compass line. */
function facingForBearing(bearing: number, northAngle: number): number {
  return halfTurn(bearing - 90 + northAngle);
}

function describeBearing(bearing: number): string {
  const nearest = COMPASS.reduce((best, option) => {
    const d = Math.min(
      Math.abs(option.bearing - bearing),
      180 - Math.abs(option.bearing - bearing),
    );
    const bestD = Math.min(
      Math.abs(best.bearing - bearing),
      180 - Math.abs(best.bearing - bearing),
    );
    return d < bestD ? option : best;
  }, COMPASS[0]);
  return nearest.label;
}

export function ClimberPanel() {
  const plants = useStore((s) => s.plants);
  const selectedId = useStore((s) => s.selectedId);
  const setPlantFacing = useStore((s) => s.setPlantFacing);
  const northAngle = useStore((s) => s.site.northAngle);

  const plant = plants.find((p) => p.id === selectedId);
  if (plant === undefined) return null;

  const species = getSpecies(plant.speciesId);
  if (species.type !== 'climber') return null;

  // Until it has been said, the plant keeps the sketchy rotation it was given
  // when it went in, and the dial has nothing to point at.
  const facing = plant.facing;

  return (
    <section className="climber-facing">
      <h3>Climber</h3>
      <p className="hint">
        {species.common} covers about {matureSize(species).height.toFixed(1)} m by{' '}
        {matureSize(species).spread.toFixed(1)} m of fence. Set which way its support runs.
      </p>

      <div className="chips">
        {COMPASS.map((option) => {
          const target = facingForBearing(option.bearing, northAngle);
          const on = facing !== undefined && Math.round(halfTurn(facing - target)) % 180 === 0;
          return (
            <button
              key={option.bearing}
              className={`chip ${on ? 'on' : ''}`}
              onClick={() => setPlantFacing(plant.id, target)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <label className="climber-angle" htmlFor="climber-facing">
        Angle
        <output htmlFor="climber-facing">
          {facing === undefined
            ? 'as planted'
            : `${describeBearing(bearingOfFacing(facing, northAngle))} · ${Math.round(
                bearingOfFacing(facing, northAngle),
              )}°`}
        </output>
      </label>
      <input
        id="climber-facing"
        type="range"
        min={0}
        max={179}
        step={1}
        value={facing ?? 0}
        onChange={(e) => setPlantFacing(plant.id, Number(e.target.value))}
      />
    </section>
  );
}
