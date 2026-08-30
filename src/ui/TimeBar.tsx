import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { doyToLabel, monthStartDoy } from '../model/phenology';
import { formatHour, useSun } from './useSun';

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** One full day of animation takes this long, in milliseconds. */
const DAY_DURATION = 26_000;

export function TimeBar() {
  const time = useStore((s) => s.time);
  const setTime = useStore((s) => s.setTime);
  const playing = useStore((s) => s.playing);
  const toggle = useStore((s) => s.toggle);
  const baseYear = useStore((s) => s.baseYear);
  const { day } = useSun();

  const frame = useRef<number>(0);
  const last = useRef<number>(0);

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const delta = now - last.current;
      last.current = now;
      const hours = (delta / DAY_DURATION) * 24;
      setTime({ hour: (useStore.getState().time.hour + hours) % 24 });
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, setTime]);

  // Night / day banding on the time slider, from the actual sunrise and sunset.
  const dayBand =
    day.sunrise === null || day.sunset === null
      ? 'linear-gradient(90deg, #cfd6e4, #cfd6e4)'
      : `linear-gradient(90deg,
          #38405c 0%,
          #38405c ${((day.sunrise - 0.6) / 24) * 100}%,
          #f0b070 ${(day.sunrise / 24) * 100}%,
          #cfe4f2 ${((day.sunrise + 1.5) / 24) * 100}%,
          #cfe4f2 ${((day.sunset - 1.5) / 24) * 100}%,
          #f0b070 ${(day.sunset / 24) * 100}%,
          #38405c ${((day.sunset + 0.6) / 24) * 100}%,
          #38405c 100%)`;

  const seasonBand = `linear-gradient(90deg,
    #b9c2cc 0%, #b9c2cc 6%,
    #b7cf94 24%,
    #6ea45c 42%,
    #4f8442 60%,
    #d59a3f 78%,
    #b9603a 88%,
    #b9c2cc 98%)`;

  const yearLabel =
    time.year < 0.25
      ? 'Today'
      : `${time.year % 1 === 0 ? time.year : time.year.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} years from now`;

  return (
    <footer className="timebar">
      <div className="timebar-readout">
        <b>{formatHour(time.hour)}</b>
        <span className="sep">·</span>
        <b>{doyToLabel(time.doy)}</b>
        <span className="sep">·</span>
        <b>{yearLabel}</b>
        <span className="muted">({baseYear + Math.round(time.year)})</span>
      </div>

      <div className="sliders">
        <div className="slider">
          <div className="slider-head">
            <label htmlFor="hour">Time of day</label>
            <button
              className={`play ${playing ? 'on' : ''}`}
              onClick={() => toggle('playing')}
              title={playing ? 'Pause' : 'Run the day'}
            >
              {playing ? '❙❙ Pause' : '▶ Run the day'}
            </button>
          </div>
          <div className="track" style={{ background: dayBand }}>
            <input
              id="hour"
              type="range"
              min={0}
              max={24}
              step={0.05}
              value={time.hour}
              onChange={(e) => setTime({ hour: Number(e.target.value) })}
            />
          </div>
          <div className="ticks">
            {[0, 6, 12, 18, 24].map((h) => (
              <span key={h}>{h === 24 ? '24' : String(h).padStart(2, '0')}</span>
            ))}
          </div>
        </div>

        <div className="slider">
          <div className="slider-head">
            <label htmlFor="doy">Time of year</label>
            <span className="muted">{doyToLabel(time.doy)}</span>
          </div>
          <div className="track" style={{ background: seasonBand }}>
            <input
              id="doy"
              type="range"
              min={1}
              max={365}
              step={1}
              value={time.doy}
              onChange={(e) => setTime({ doy: Number(e.target.value) })}
            />
          </div>
          <div className="ticks months">
            {MONTH_LABELS.map((m, i) => (
              <span key={i} style={{ left: `${(monthStartDoy(i) / 365) * 100}%` }}>
                {m}
              </span>
            ))}
          </div>
        </div>

        <div className="slider">
          <div className="slider-head">
            <label htmlFor="year">Age of garden</label>
            <span className="muted">{yearLabel}</span>
          </div>
          <div className="track plain">
            <input
              id="year"
              type="range"
              min={0}
              max={20}
              step={0.25}
              value={time.year}
              onChange={(e) => setTime({ year: Number(e.target.value) })}
            />
          </div>
          <div className="ticks">
            {[0, 5, 10, 15, 20].map((y) => (
              <span key={y}>{y === 0 ? 'now' : `+${y}y`}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
