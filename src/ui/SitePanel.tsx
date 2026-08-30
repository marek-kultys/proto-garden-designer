import { useCallback, useRef, type ReactNode } from 'react';
import { LOCATION_PRESETS, useStore } from '../state/store';
import { StructuresPanel } from './StructuresPanel';
import { seasonShift } from '../model/phenology';
import { EYE_PRESETS, GROUND_PRESETS, eyeElevation } from '../model/panorama';
import { compassLabel, formatHour, useSun } from './useSun';

/** Drag the ring to say which way north lies on the drawing. */
function NorthDial() {
  const site = useStore((s) => s.site);
  const setSite = useStore((s) => s.setSite);
  const ref = useRef<SVGSVGElement>(null);
  const { position, light } = useSun();

  const setFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = (Math.atan2(clientX - cx, cy - clientY) * 180) / Math.PI;
      setSite({ northAngle: Math.round(((angle % 360) + 360) % 360) });
    },
    [setSite],
  );

  const sunAngle = light.altitude > -6 ? position.azimuth + site.northAngle : null;

  return (
    <div className="dial-wrap">
      <svg
        ref={ref}
        viewBox="-60 -60 120 120"
        className="dial"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromEvent(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons) setFromEvent(e.clientX, e.clientY);
        }}
      >
        <circle r="46" className="dial-face" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line
            key={a}
            x1="0"
            y1="-46"
            x2="0"
            y2={a % 90 === 0 ? -38 : -42}
            className="dial-tick"
            transform={`rotate(${a})`}
          />
        ))}

        {sunAngle !== null && (
          <g transform={`rotate(${sunAngle})`}>
            <line x1="0" y1="0" x2="0" y2="-46" className="dial-sunray" />
            <circle cy="-46" r="6" className={light.altitude > 0 ? 'dial-sun' : 'dial-sun down'} />
          </g>
        )}

        <g transform={`rotate(${site.northAngle})`} className="dial-north">
          <line x1="0" y1="24" x2="0" y2="-24" />
          <polygon points="0,-34 -6,-20 6,-20" />
          <text x="0" y="-40" textAnchor="middle">
            N
          </text>
        </g>
      </svg>
      <label className="inline">
        North at
        <input
          type="number"
          value={site.northAngle}
          min={0}
          max={359}
          onChange={(e) => setSite({ northAngle: Number(e.target.value) || 0 })}
        />
        °
      </label>
    </div>
  );
}

/**
 * Who is doing the looking, for the 360° view.
 *
 * Worth a control rather than a constant because the answer changes the design
 * brief: at 1.12 m a child is enclosed by a 1.5 m hedge that a tall adult sees
 * straight over, and the same twenty centimetres decides whether a stand of
 * miscanthus is a screen or a haze.
 */
function ViewpointSection() {
  const observer = useStore((s) => s.observer);
  const setEyeHeight = useStore((s) => s.setEyeHeight);
  const setGroundHeight = useStore((s) => s.setGroundHeight);
  const stageView = useStore((s) => s.stageView);
  const setStageView = useStore((s) => s.setStageView);
  const centreObserver = useStore((s) => s.centreObserver);

  const matchedEye = EYE_PRESETS.find((p) => Math.abs(p.height - observer.eyeHeight) < 0.005);
  const matchedGround = GROUND_PRESETS.find(
    (p) => Math.abs(p.height - observer.groundHeight) < 0.005,
  );

  return (
    <>
      <h3>Viewpoint</h3>

      <label className="field">
        <span>Eye height</span>
        <select
          value={matchedEye ? matchedEye.label : 'custom'}
          onChange={(e) => {
            const preset = EYE_PRESETS.find((p) => p.label === e.target.value);
            if (preset) setEyeHeight(preset.height);
          }}
        >
          {EYE_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label} — {p.height.toFixed(2)} m
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </label>

      <div className="field-row">
        <label className="field">
          <span>Eyes at (m)</span>
          <input
            type="number"
            step="0.05"
            min="0.3"
            max="3"
            value={observer.eyeHeight}
            onChange={(e) => setEyeHeight(Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>Ground at (m)</span>
          <input
            type="number"
            step="0.05"
            min="0"
            max="20"
            value={observer.groundHeight}
            onChange={(e) => setGroundHeight(Number(e.target.value))}
          />
        </label>
      </div>

      <label className="field">
        <span>Standing on</span>
        <select
          value={matchedGround ? matchedGround.label : 'custom'}
          onChange={(e) => {
            const preset = GROUND_PRESETS.find((p) => p.label === e.target.value);
            if (preset) setGroundHeight(preset.height);
          }}
        >
          {GROUND_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
              {p.height > 0 ? ` — +${p.height.toFixed(2)} m` : ''}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </label>

      <p className="hint">
        Eyes {eyeElevation(observer).toFixed(2)} m above the ground.{' '}
        {stageView === 'panorama' ? (
          'Drag the eye on the plan to move it.'
        ) : (
          <button className="linkish" onClick={() => setStageView('panorama')}>
            Show the 360° view
          </button>
        )}
      </p>

      <button
        className="viewpoint-centre"
        onClick={() => {
          centreObserver();
          setStageView('panorama');
        }}
        title="Put the eye back in the middle of the plot"
      >
        Centre the viewpoint
      </button>
    </>
  );
}

export interface SitePanelProps {
  /** On a phone the plot tools have nowhere else to live, so they come here. */
  extraTools?: ReactNode;
}

export function SitePanel({ extraTools }: SitePanelProps) {
  const site = useStore((s) => s.site);
  const setSite = useStore((s) => s.setSite);
  const showShadows = useStore((s) => s.showShadows);
  const showGrid = useStore((s) => s.showGrid);
  const showOverlay = useStore((s) => s.showOverlay);
  const toggle = useStore((s) => s.toggle);
  const { position, day } = useSun();

  const shift = seasonShift(site);
  const shiftText =
    Math.abs(shift.spring) < 1.5
      ? 'Season as London'
      : shift.spring > 0
        ? `Spring ${Math.round(shift.spring)} days later, autumn ${Math.round(shift.spring)} earlier`
        : `Spring ${Math.round(-shift.spring)} days earlier, autumn ${Math.round(-shift.spring)} later`;

  return (
    <>
      <h2>Site</h2>

      <NorthDial />

      <label className="field">
        <span>Location</span>
        <select
          value={LOCATION_PRESETS.some((p) => p.label === site.label) ? site.label : 'custom'}
          onChange={(e) => {
            const preset = LOCATION_PRESETS.find((p) => p.label === e.target.value);
            if (preset) {
              setSite({
                label: preset.label,
                latitude: preset.latitude,
                longitude: preset.longitude,
                altitude: preset.altitude,
              });
            }
          }}
        >
          {LOCATION_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </label>

      <div className="field-row">
        <label className="field">
          <span>Latitude</span>
          <input
            type="number"
            step="0.01"
            value={site.latitude}
            onChange={(e) => setSite({ latitude: Number(e.target.value), label: 'Custom' })}
          />
        </label>
        <label className="field">
          <span>Longitude</span>
          <input
            type="number"
            step="0.01"
            value={site.longitude}
            onChange={(e) => setSite({ longitude: Number(e.target.value), label: 'Custom' })}
          />
        </label>
      </div>

      <label className="field">
        <span>Altitude (m)</span>
        <input
          type="number"
          step="10"
          value={site.altitude}
          onChange={(e) => setSite({ altitude: Number(e.target.value), label: 'Custom' })}
        />
      </label>

      <label className="check">
        <input type="checkbox" checked={site.dst} onChange={() => setSite({ dst: !site.dst })} />
        Summer time (BST)
      </label>

      <div className="readout">
        <div className="readout-row">
          <span>Sun</span>
          <b>
            {position.altitude > 0
              ? `${position.altitude.toFixed(1)}° up, ${compassLabel(position.azimuth)}`
              : 'below the horizon'}
          </b>
        </div>
        <div className="readout-row">
          <span>Sunrise</span>
          <b>{day.sunrise === null ? '—' : formatHour(day.sunrise)}</b>
        </div>
        <div className="readout-row">
          <span>Sunset</span>
          <b>{day.sunset === null ? '—' : formatHour(day.sunset)}</b>
        </div>
        <div className="readout-row">
          <span>Daylight</span>
          <b>{day.daylight.toFixed(1)} h</b>
        </div>
        <div className="readout-note">{shiftText}</div>
      </div>

      <StructuresPanel />

      <h3>Show</h3>
      <label className="check">
        <input type="checkbox" checked={showShadows} onChange={() => toggle('showShadows')} />
        Shadows
      </label>
      <label className="check">
        <input type="checkbox" checked={showGrid} onChange={() => toggle('showGrid')} />
        Metre grid
      </label>
      <label className="check">
        <input type="checkbox" checked={showOverlay} onChange={() => toggle('showOverlay')} />
        Sun / shade map
      </label>

      <ViewpointSection />

      {extraTools && (
        <>
          <h3>Plot</h3>
          <div className="tools stacked">{extraTools}</div>
        </>
      )}
    </>
  );
}
