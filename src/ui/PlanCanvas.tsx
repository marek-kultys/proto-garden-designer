import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStore } from '../state/store';
import { getSpecies } from '../model/plants';
import { sizeAt } from '../model/growth';
import { computeShadeGrid, shadeBandLabel, type ShadeGrid } from '../model/shade';
import { polygonBounds } from '../model/geometry';
import type { Vec2 } from '../model/types';
import { drawPlan } from '../render/drawPlan';
import { BAND_SWATCHES, sampleShade } from '../render/overlay';
import { fitViewport, toPlot, toScreen, type Viewport } from '../render/viewport';
import { useSun } from './useSun';

export interface PlanApi {
  /** Convert a page coordinate to plot metres, or null if outside the canvas. */
  fromClient: (clientX: number, clientY: number) => Vec2 | null;
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'plant'; id: string; grabX: number; grabY: number }
  | { kind: 'sight'; end: 'a' | 'b' }
  | { kind: 'observer' };

export const PlanCanvas = forwardRef<PlanApi>(function PlanCanvas(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 480 });
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);
  const drag = useRef<DragMode>({ kind: 'none' });

  const state = useStore();
  const { light, calendarYear } = useSun();

  const viewport: Viewport = useMemo(() => {
    const bounds = polygonBounds(state.plot.length >= 3 ? state.plot : [{ x: 0, y: 0 }, { x: 12, y: 9 }]);
    return fitViewport(bounds, size.width, size.height, 64);
  }, [state.plot, size]);

  useImperativeHandle(
    ref,
    (): PlanApi => ({
      fromClient(clientX, clientY) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return null;
        if (
          clientX < rect.left ||
          clientX > rect.right ||
          clientY < rect.top ||
          clientY > rect.bottom
        ) {
          return null;
        }
        return toPlot(viewport, clientX - rect.left, clientY - rect.top);
      },
    }),
    [viewport],
  );

  // Keep the canvas matched to its container and to the display density.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ width: Math.max(260, r.width), height: Math.max(110, r.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The shade map is the one genuinely expensive thing here, so it is computed
  // off the interaction path and only once the inputs have settled.
  const [shadeGrid, setShadeGrid] = useState<ShadeGrid | null>(null);
  const overlayKey = state.showOverlay
    ? JSON.stringify([
        state.time.doy,
        Math.round(state.time.year),
        state.site,
        state.plot,
        state.plants.map((p) => [p.speciesId, Math.round(p.x * 20), Math.round(p.y * 20)]),
      ])
    : null;

  useEffect(() => {
    if (!state.showOverlay) {
      setShadeGrid(null);
      return;
    }
    const handle = window.setTimeout(() => {
      setShadeGrid(
        computeShadeGrid(state.plot, state.plants, state.site, state.time, calendarYear),
      );
    }, 120);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayKey, state.showOverlay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawPlan(
      ctx,
      size.width,
      size.height,
      viewport,
      {
        plot: state.plot,
        plants: state.plants,
        site: state.site,
        time: state.time,
        calendarYear,
        light,
        selectedId: state.selectedId,
        sightLine: state.sightLine,
        observer: state.observer,
      },
      {
        showShadows: state.showShadows,
        showGrid: state.showGrid,
        // The two viewpoints compete for attention, so each is shown only while
        // the drawing it drives is the one on screen.
        showSightLine: state.stageView === 'elevation',
        showObserver: state.stageView === 'panorama',
        renderedFov: state.renderedFov,
        shadeGrid,
        draftPolygon: state.tool === 'draw-plot' ? state.draft : null,
        draftCursor: state.draftCursor,
      },
    );
  }, [state, viewport, size, light, calendarYear, shadeGrid]);

  const hitPlant = useCallback(
    (p: Vec2): string | null => {
      let best: { id: string; d: number } | null = null;
      for (const plant of state.plants) {
        const species = getSpecies(plant.speciesId);
        const radius = Math.max(sizeAt(species, state.time.year).spread / 2, 10 / viewport.scale);
        const d = Math.hypot(plant.x - p.x, plant.y - p.y);
        if (d <= radius && (!best || d < best.d)) best = { id: plant.id, d };
      }
      return best?.id ?? null;
    },
    [state.plants, state.time.year, viewport.scale],
  );

  const hitObserver = useCallback(
    (p: Vec2): boolean =>
      Math.hypot(state.observer.x - p.x, state.observer.y - p.y) < 16 / viewport.scale,
    [state.observer, viewport.scale],
  );

  const hitSightHandle = useCallback(
    (p: Vec2): 'a' | 'b' | null => {
      const tolerance = 12 / viewport.scale;
      if (Math.hypot(state.sightLine.a.x - p.x, state.sightLine.a.y - p.y) < tolerance) return 'a';
      if (Math.hypot(state.sightLine.b.x - p.x, state.sightLine.b.y - p.y) < tolerance) return 'b';
      return null;
    },
    [state.sightLine, viewport.scale],
  );

  const localPoint = (e: React.PointerEvent | PointerEvent): Vec2 => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return toPlot(viewport, e.clientX - rect.left, e.clientY - rect.top);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);

    if (state.tool === 'draw-plot') {
      state.pushDraftPoint(p);
      return;
    }

    if (state.stageView === 'panorama' && hitObserver(p)) {
      drag.current = { kind: 'observer' };
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (state.stageView === 'elevation') {
      const handle = hitSightHandle(p);
      if (handle) {
        drag.current = { kind: 'sight', end: handle };
        canvasRef.current?.setPointerCapture(e.pointerId);
        return;
      }
    }

    const id = hitPlant(p);
    state.select(id);
    if (id) {
      const plant = state.plants.find((x) => x.id === id)!;
      drag.current = { kind: 'plant', id, grabX: p.x - plant.x, grabY: p.y - plant.y };
      canvasRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);

    if (state.tool === 'draw-plot') {
      state.setDraftCursor(p);
      return;
    }

    const mode = drag.current;
    if (mode.kind === 'plant') {
      state.movePlant(mode.id, { x: p.x - mode.grabX, y: p.y - mode.grabY });
      return;
    }
    if (mode.kind === 'sight') {
      state.setSightEnd(mode.end, p);
      return;
    }
    if (mode.kind === 'observer') {
      state.moveObserver(p);
      return;
    }

    // Idle: report what is under the cursor.
    const id = hitPlant(p);
    if (id) {
      const plant = state.plants.find((x) => x.id === id)!;
      const species = getSpecies(plant.speciesId);
      const s = sizeAt(species, state.time.year);
      setHoverInfo(`${species.common} · ${s.height.toFixed(1)} m tall, ${s.spread.toFixed(1)} m across`);
    } else if (shadeGrid) {
      const hours = sampleShade(shadeGrid, p.x, p.y);
      setHoverInfo(
        hours === null
          ? null
          : `${hours.toFixed(1)} h of direct sun here today — ${shadeBandLabel(hours, shadeGrid.thresholds)}`,
      );
    } else {
      setHoverInfo(null);
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag.current.kind !== 'none') {
      canvasRef.current?.releasePointerCapture(e.pointerId);
      drag.current = { kind: 'none' };
    }
  };

  const onDoubleClick = () => {
    if (state.tool === 'draw-plot') state.commitDraft();
  };

  // Keyboard: finish or abandon a plot outline, delete the selected plant.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === 'Escape') {
        if (state.tool === 'draw-plot') state.cancelDraft();
        else state.select(null);
      } else if (e.key === 'Enter' && state.tool === 'draw-plot') {
        state.commitDraft();
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && state.selectedId) {
        e.preventDefault();
        state.removePlant(state.selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  const selected = state.plants.find((p) => p.id === state.selectedId);

  return (
    <div className="plan-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={`plan-canvas ${state.tool === 'draw-plot' ? 'drawing' : ''}`}
        style={{ width: size.width, height: size.height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHoverInfo(null)}
        onDoubleClick={onDoubleClick}
      />

      {state.tool === 'draw-plot' && (
        <div className="canvas-hint">
          Click to place corners · <b>Enter</b> or double-click to close · <b>Esc</b> to cancel
        </div>
      )}

      {hoverInfo && state.tool !== 'draw-plot' && <div className="canvas-readout">{hoverInfo}</div>}

      {selected && (
        <button className="delete-chip" onClick={() => state.removePlant(selected.id)}>
          Remove {getSpecies(selected.speciesId).common}
        </button>
      )}

      {state.showOverlay && shadeGrid && <ShadeLegend grid={shadeGrid} />}
    </div>
  );
});

function ShadeLegend({ grid }: { grid: ShadeGrid }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const h = (v: number) => (v >= 1 ? `${v.toFixed(v % 1 ? 1 : 0)} h` : `${Math.round(v * 60)} min`);
  const { fullSun, partial } = grid.thresholds;

  return (
    <div className="legend">
      <div className="legend-title">Direct sun on this day</div>
      <div className="legend-row">
        <span className="swatch" style={{ background: BAND_SWATCHES.fullSun }} />
        <span>Full sun · {h(fullSun)}+</span>
        <b>{pct(grid.bands.fullSun)}</b>
      </div>
      <div className="legend-row">
        <span className="swatch" style={{ background: BAND_SWATCHES.partial }} />
        <span>
          Partial · {h(partial)}–{h(fullSun)}
        </span>
        <b>{pct(grid.bands.partial)}</b>
      </div>
      <div className="legend-row">
        <span className="swatch" style={{ background: BAND_SWATCHES.shade }} />
        <span>Shade · under {h(partial)}</span>
        <b>{pct(grid.bands.shade)}</b>
      </div>
      <div className="legend-foot">
        {grid.maxHours.toFixed(1)} h of daylight
        {fullSun < 5.99 && ' — thresholds scaled to the short day'}
      </div>
    </div>
  );
}

export { toScreen };
