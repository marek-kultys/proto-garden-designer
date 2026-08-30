import { useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { ElevationStrip } from './ElevationStrip';
import { PanoramaView } from './PanoramaView';

/**
 * The strip under the plan, and the two ways of looking at a design from
 * inside it.
 *
 * Elevation is the measured drawing: orthographic, to scale, good for checking
 * heights against each other. The 360° view is the opposite — perspective from
 * one eye point, no use for measuring, but the only view that answers what it
 * will feel like to stand there. They earn their places for different reasons,
 * so they share the panel rather than one replacing the other.
 */
const HEIGHTS = [170, 300, 470];
const NARROW_HEIGHTS = [110, 190, 300];
const SIZE_LABELS = ['Compact', 'Normal', 'Tall'];

export function StageBottom() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [heightIndex, setHeightIndex] = useState(1);
  const [size, setSize] = useState({ width: 800, height: HEIGHTS[1] });

  const stageView = useStore((s) => s.stageView);
  const setStageView = useStore((s) => s.setStageView);

  // A phone has a third of the vertical room, so the same three steps are
  // offered at a smaller scale rather than the control being taken away.
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  const heights = narrow ? NARROW_HEIGHTS : HEIGHTS;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ width: Math.max(260, r.width), height: Math.max(90, r.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="elevation-wrap" ref={wrapRef} style={{ flex: `0 0 ${heights[heightIndex]}px` }}>
      {stageView === 'elevation' ? (
        <ElevationStrip width={size.width} height={size.height} />
      ) : (
        <PanoramaView width={size.width} height={size.height} />
      )}

      <div className="stage-tabs">
        <button
          className={stageView === 'elevation' ? 'on' : ''}
          onClick={() => setStageView('elevation')}
        >
          Elevation
        </button>
        <button
          className={stageView === 'panorama' ? 'on' : ''}
          onClick={() => setStageView('panorama')}
        >
          360° view
        </button>
      </div>

      <button
        className="elevation-size"
        onClick={() => setHeightIndex((i) => (i + 1) % heights.length)}
        title="Change the height of this view"
      >
        {SIZE_LABELS[heightIndex]} ↕
      </button>
    </div>
  );
}
