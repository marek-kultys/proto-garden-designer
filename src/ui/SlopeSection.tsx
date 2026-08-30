import { SLOPE_FALL_RANGE, terrainOf, terrainRange } from '../model/terrain';
import { useStore } from '../state/store';

/**
 * The lie of the land, stated the way a site is measured: so many metres of
 * fall, running in a direction.
 *
 * A gradient or a ratio would be more precise and less useful — nobody comes
 * back from a garden with "one in twelve" in their notebook, they come back
 * with "it drops about a metre from the house to the back fence".
 */

const DIRECTIONS = [
  { label: 'N', bearing: 0 },
  { label: 'NE', bearing: 45 },
  { label: 'E', bearing: 90 },
  { label: 'SE', bearing: 135 },
  { label: 'S', bearing: 180 },
  { label: 'SW', bearing: 225 },
  { label: 'W', bearing: 270 },
  { label: 'NW', bearing: 315 },
];

export function SlopeSection() {
  const site = useStore((s) => s.site);
  const setSite = useStore((s) => s.setSite);
  const plot = useStore((s) => s.plot);

  const fall = site.slopeFall ?? 0;
  const direction = site.slopeDirection ?? 180;
  const terrain = terrainOf(plot, site);
  const { low, high } = terrainRange(plot, terrain);

  return (
    <section className="slope">
      <h3>Slope</h3>

      <label className="climber-angle" htmlFor="slope-fall">
        Falls by
        <output htmlFor="slope-fall">{fall === 0 ? 'level' : `${fall.toFixed(1)} m`}</output>
      </label>
      <input
        id="slope-fall"
        type="range"
        min={SLOPE_FALL_RANGE.min}
        max={SLOPE_FALL_RANGE.max}
        step={SLOPE_FALL_RANGE.step}
        value={fall}
        onChange={(e) => setSite({ slopeFall: Number(e.target.value) })}
      />

      {fall > 0 && (
        <>
          <span className="planting-size-label">Falling towards</span>
          <div className="chips">
            {DIRECTIONS.map((d) => (
              <button
                key={d.bearing}
                className={`chip ${Math.round(direction) === d.bearing ? 'on' : ''}`}
                onClick={() => setSite({ slopeDirection: d.bearing })}
              >
                {d.label}
              </button>
            ))}
          </div>

          <p className="hint">
            {/*
              A gradient is what the shadows and the drawing actually use, so it
              is worth saying out loud — a designer knows what 1 in 10 means for
              access and for drainage, and the fall alone does not say it.
            */}
            About 1 in {Math.max(1, Math.round(1 / Math.max(0.001, terrain.gradient)))}. Highest
            ground {high >= 0 ? '+' : ''}
            {high.toFixed(2)} m, lowest {low.toFixed(2)} m, measured from the middle of the plot.
            Shadows run further downhill and are cut short uphill.
          </p>
        </>
      )}
    </section>
  );
}
