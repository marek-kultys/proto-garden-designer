import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { drawElevation } from '../render/drawElevation';
import { useSun } from './useSun';

/**
 * Panel heights the strip cycles through.
 *
 * The scale is uniform in both directions, which means the vertical is always
 * the binding constraint once there is a tree in the slice: a 14 m birch and a
 * 13 m slice cannot both fill a short wide strip without distorting one of them.
 * Rather than stretch the drawing, the panel can be made taller — which raises
 * the shared scale and fills the width as a side effect.
 */
const HEIGHTS = [170, 300, 470];
const NARROW_HEIGHTS = [110, 190, 300];

export function ElevationStrip() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [heightIndex, setHeightIndex] = useState(1);
  const [size, setSize] = useState({ width: 800, height: HEIGHTS[1] });
  // A phone has a third of the vertical room, so the same three steps are
  // offered at a smaller scale rather than the control being taken away.
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  const heights = narrow ? NARROW_HEIGHTS : HEIGHTS;

  const plants = useStore((s) => s.plants);
  const site = useStore((s) => s.site);
  const time = useStore((s) => s.time);
  const sightLine = useStore((s) => s.sightLine);
  const selectedId = useStore((s) => s.selectedId);
  const { light } = useSun();

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawElevation(ctx, size.width, size.height, {
      plants,
      site,
      time,
      light,
      sightLine,
      selectedId,
    });
  }, [plants, site, time, light, sightLine, selectedId, size]);

  return (
    <div
      className="elevation-wrap"
      ref={wrapRef}
      style={{ flex: `0 0 ${heights[heightIndex]}px` }}
    >
      <canvas ref={canvasRef} style={{ width: size.width, height: size.height }} />
      <div className="elevation-label">Elevation — slice A→B</div>
      <button
        className="elevation-size"
        onClick={() => setHeightIndex((i) => (i + 1) % heights.length)}
        title="Change the height of the elevation view"
      >
        {['Compact', 'Normal', 'Tall'][heightIndex]} ↕
      </button>
    </div>
  );
}
