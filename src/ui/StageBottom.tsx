import { useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { SLICE_DEPTH_RANGE } from '../render/constants';
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

/**
 * How the plan and the view below it share the height available.
 *
 * The presets are quick and discoverable; the divider between the two is what
 * you reach for when neither preset is what this particular garden needs — a
 * long shallow plot wants the plan short and the elevation deep, a square one
 * the other way about.
 *
 * Both are kept in pixels rather than a fraction, because the thing being
 * chosen is how much room the drawing gets, not a ratio.
 */
const MIN_STRIP = 90;
/** The plan must keep at least this much, or there is nothing to arrange on. */
const MIN_PLAN = 150;

function nearestLabel(height: number, presets: number[]): string {
  let best = 0;
  for (let i = 1; i < presets.length; i += 1) {
    if (Math.abs(presets[i] - height) < Math.abs(presets[best] - height)) best = i;
  }
  return SIZE_LABELS[best];
}

export function StageBottom() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [heightIndex, setHeightIndex] = useState(1);
  const [size, setSize] = useState({ width: 800, height: HEIGHTS[1] });
  /** Null until the divider has been dragged; a preset is in charge until then. */
  const [dragged, setDragged] = useState<number | null>(null);
  const resize = useRef<{ startY: number; startHeight: number } | null>(null);

  const stageView = useStore((s) => s.stageView);
  const setStageView = useStore((s) => s.setStageView);
  const sliceDepth = useStore((s) => s.sliceDepth);
  const setSliceDepth = useStore((s) => s.setSliceDepth);

  // A phone has a third of the vertical room, so the same three steps are
  // offered at a smaller scale rather than the control being taken away.
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  const heights = narrow ? NARROW_HEIGHTS : HEIGHTS;
  const stripHeight = dragged ?? heights[heightIndex];

  /** How tall the strip may become without squeezing the plan out of existence. */
  const maxStrip = (): number => {
    const stage = wrapRef.current?.parentElement;
    const available = stage?.getBoundingClientRect().height ?? 0;
    return Math.max(MIN_STRIP, available - MIN_PLAN);
  };

  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = { startY: e.clientY, startHeight: stripHeight };
  };

  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const from = resize.current;
    if (!from) return;
    // Dragging the divider up makes the view below it taller, which is the way
    // round that matches what your hand is doing to the boundary.
    const next = from.startHeight - (e.clientY - from.startY);
    setDragged(Math.max(MIN_STRIP, Math.min(maxStrip(), next)));
  };

  const onResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    resize.current = null;
  };

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
    <div className="elevation-wrap" ref={wrapRef} style={{ flex: `0 0 ${stripHeight}px` }}>
      <div
        className="stage-resize"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        onDoubleClick={() => setDragged(null)}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Drag to resize the plan and the view below it"
        title="Drag to resize — double-click to reset"
      />

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
        onClick={() => {
          const next = (heightIndex + 1) % heights.length;
          setHeightIndex(next);
          // A preset takes charge again, overriding whatever was dragged.
          setDragged(null);
        }}
        title="Step through preset heights, or drag the divider above"
      >
        {nearestLabel(stripHeight, heights)} ↕
      </button>

      {/* Only over the elevation: the 360° view has no slice to widen. */}
      {stageView === 'elevation' && (
        <div className="slice-depth">
          <label htmlFor="slice-depth">Slice</label>
          <input
            id="slice-depth"
            type="range"
            min={SLICE_DEPTH_RANGE.min}
            max={SLICE_DEPTH_RANGE.max}
            step={SLICE_DEPTH_RANGE.step}
            value={sliceDepth}
            onChange={(e) => setSliceDepth(Number(e.target.value))}
            title="How deep a slice of the garden this view shows"
          />
          <output htmlFor="slice-depth">{sliceDepth.toFixed(1)} m</output>
        </div>
      )}
    </div>
  );
}
