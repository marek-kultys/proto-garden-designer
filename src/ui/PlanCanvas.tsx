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
import { isDrawingTool, useStore } from '../state/store';
import { getSpecies } from '../model/plants';
import { isOval, ovalHandles } from '../model/oval';
import { plantAge, sizeAt } from '../model/growth';
import { computeShadeGrid, shadeBandLabel, type ShadeGrid } from '../model/shade';
import { coversPoint, describeStructure, segmentsOf } from '../model/structures';
import { pointToSegment } from '../model/geometry';
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
  | { kind: 'structure'; id: string; lastX: number; lastY: number }
  | { kind: 'structure-point'; id: string; index: number }
  | { kind: 'sight'; end: 'a' | 'b' }
  | { kind: 'observer' };

/**
 * How much room at the foot of the plan the readout needs to itself.
 *
 * The pill is pinned to the bottom of the plan, which is where it is least in
 * the way — until the thing you are pointing at is down there too, and then it
 * lands squarely on top of it. What has to clear it is not the pointer but the
 * plant drawn around the pointer, so the band is wider than the pill: a hundred
 * and ten pixels covers it and a good-sized canopy. Capped as a share of the
 * height so that a short plan does not keep the readout permanently aloft.
 */
const FOOT_OF_THE_PLAN = 110;

function nearTheFoot(height: number, y: number): boolean {
  return y > height - Math.min(FOOT_OF_THE_PLAN, height * 0.3);
}

export const PlanCanvas = forwardRef<PlanApi>(function PlanCanvas(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 480 });
  /**
   * What is under the cursor, and whether the readout has to get out of its
   * way. One piece of state rather than two, because the text and its place are
   * decided by the same pointer move and must never disagree.
   */
  const [hoverInfo, setHoverInfo] = useState<{ text: string; aloft: boolean } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const drag = useRef<DragMode>({ kind: 'none' });
  // Long press stands in for right-click on a touchscreen, where there is no
  // second button to press.
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);

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
        // Height and position both change the shadow, so both belong in the key
        // — without them, raising a wall would leave the sun map showing the
        // answer for the old one.
        state.structures.map((x) => [
          x.kind,
          x.height,
          x.thickness,
          x.points.map((p) => [Math.round(p.x * 20), Math.round(p.y * 20)]),
        ]),
      ])
    : null;

  useEffect(() => {
    if (!state.showOverlay) {
      setShadeGrid(null);
      return;
    }
    const handle = window.setTimeout(() => {
      setShadeGrid(
        computeShadeGrid(
          state.plot,
          state.plants,
          state.site,
          state.time,
          calendarYear,
          state.structures,
        ),
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
        structures: state.structures,
        site: state.site,
        time: state.time,
        calendarYear,
        light,
        selectedId: state.selectedId,
        selectedStructureId: state.selectedStructureId,
        sightLine: state.sightLine,
        sliceDepth: state.sliceDepth,
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
        draftPolygon: isDrawingTool(state.tool) ? state.draft : null,
        draftCursor: state.draftCursor,
      },
    );
  }, [state, viewport, size, light, calendarYear, shadeGrid]);

  const hitPlant = useCallback(
    (p: Vec2): string | null => {
      let best: { id: string; d: number } | null = null;
      for (const plant of state.plants) {
        const species = getSpecies(plant.speciesId);
        const radius = Math.max(
          sizeAt(species, plantAge(plant.plantedAge, state.time.year)).spread / 2,
          10 / viewport.scale,
        );
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

  const openMenu = useCallback((clientX: number, clientY: number, id: string) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenu({ x: clientX - rect.left, y: clientY - rect.top, id });
  }, []);

  const cancelPress = useCallback(() => {
    if (press.current) {
      window.clearTimeout(press.current.timer);
      press.current = null;
    }
  }, []);

  /*
   * Where on the plot a pointer is, in metres.
   *
   * Takes anything with page coordinates — pointer, mouse and context-menu
   * events all arrive here — and reads the canvas off the event rather than out
   * of the ref. Every caller is a handler on the canvas itself, so
   * `currentTarget` is that canvas and the type says so: there is no absent
   * case to handle, rather than one handled by asserting it cannot happen.
   */
  const localPoint = (e: {
    clientX: number;
    clientY: number;
    currentTarget: HTMLCanvasElement;
  }): Vec2 => {
    const rect = e.currentTarget.getBoundingClientRect();
    return toPlot(viewport, e.clientX - rect.left, e.clientY - rect.top);
  };

  /**
   * A corner handle of the selected structure, if the pointer is on one.
   *
   * Only the selected structure's corners are grabbable, because only its
   * handles are drawn — an invisible grab target is worse than none.
   */
  const hitStructurePoint = (p: { x: number; y: number }): number | null => {
    const structure = state.structures.find((x) => x.id === state.selectedStructureId);
    if (structure === undefined) return null;
    // An oval is grabbed by its four axis handles, never by the forty corners
    // that happen to describe it — see `model/oval.ts`.
    const grabbable = isOval(structure) ? ovalHandles(structure.points) : structure.points;
    const grab = 11 / viewport.scale;
    let best: { index: number; d: number } | null = null;
    for (let i = 0; i < grabbable.length; i += 1) {
      const d = Math.hypot(grabbable[i].x - p.x, grabbable[i].y - p.y);
      if (d <= grab && (best === null || d < best.d)) best = { index: i, d };
    }
    return best === null ? null : best.index;
  };

  /**
   * The structure under a point, if any.
   *
   * A thin wall is hard to hit exactly, so the test is widened to a comfortable
   * grab distance rather than the true thickness — the same reason a plant is
   * hit by its canopy and not its stem.
   */
  const hitStructure = (p: { x: number; y: number }): string | null => {
    const grab = 12 / viewport.scale;
    // Last drawn is on top, so search backwards.
    for (let i = state.structures.length - 1; i >= 0; i -= 1) {
      const structure = state.structures[i];
      if (coversPoint(structure, p)) return structure.id;
      const reach = Math.max(grab, structure.thickness / 2);
      for (const seg of segmentsOf(structure)) {
        if (pointToSegment(p, seg.a, seg.b).dist <= reach) return structure.id;
      }
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);
    setMenu(null);

    if (isDrawingTool(state.tool)) {
      state.pushDraftPoint(p);
      // An oval is two opposite corners and nothing else, so the second click
      // has said everything there is to say. Waiting for an Enter that could
      // add nothing would be asking for a keystroke to confirm a decision
      // already made.
      if (state.tool === 'draw-oval-bed' && state.draft.length >= 1) state.commitDraft();
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

    // A corner of the selected structure wins over anything under it: you have
    // already said which thing you are working on by selecting it.
    const corner = hitStructurePoint(p);
    if (corner !== null && state.selectedStructureId !== null) {
      drag.current = { kind: 'structure-point', id: state.selectedStructureId, index: corner };
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    const id = hitPlant(p);
    if (id === null) {
      // Structures are tested only where there is no plant: a shrub standing in
      // a raised bed should be what you grab, not the bed underneath it.
      const structureId = hitStructure(p);
      if (structureId !== null) {
        state.selectStructure(structureId);
        drag.current = { kind: 'structure', id: structureId, lastX: p.x, lastY: p.y };
        canvasRef.current?.setPointerCapture(e.pointerId);
        return;
      }
    }

    state.select(id);
    const grabbed = id === null ? undefined : state.plants.find((x) => x.id === id);
    if (id && grabbed !== undefined) {
      drag.current = { kind: 'plant', id, grabX: p.x - grabbed.x, grabY: p.y - grabbed.y };
      canvasRef.current?.setPointerCapture(e.pointerId);

      if (e.pointerType !== 'mouse') {
        const { clientX, clientY } = e;
        press.current = {
          x: clientX,
          y: clientY,
          timer: window.setTimeout(() => openMenu(clientX, clientY, id), 480),
        };
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);

    // Any real movement means this is a drag, not a press-and-hold.
    if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) {
      cancelPress();
    }

    if (isDrawingTool(state.tool)) {
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
    if (mode.kind === 'structure-point') {
      state.moveStructurePoint(mode.id, mode.index, p);
      return;
    }
    if (mode.kind === 'structure') {
      // Moved by how far the pointer went, not to where it is: a wall is a run
      // of points with no single centre to snap to the cursor.
      state.moveStructure(mode.id, { x: p.x - mode.lastX, y: p.y - mode.lastY });
      drag.current = { ...mode, lastX: p.x, lastY: p.y };
      return;
    }

    // Idle: report what is under the cursor, somewhere it is not covering it.
    const rect = e.currentTarget.getBoundingClientRect();
    const aloft = nearTheFoot(rect.height, e.clientY - rect.top);
    const report = (text: string | null) => setHoverInfo(text === null ? null : { text, aloft });

    if (hitStructurePoint(p) !== null) {
      report('Drag this corner to reshape');
      return;
    }
    const id = hitPlant(p);
    const structureId = id === null ? hitStructure(p) : null;
    const hoveredStructure = state.structures.find((x) => x.id === structureId);
    const plant = id === null ? undefined : state.plants.find((x) => x.id === id);
    if (plant !== undefined) {
      const species = getSpecies(plant.speciesId);
      const s = sizeAt(species, plantAge(plant.plantedAge, state.time.year));
      report(`${species.common} · ${s.height.toFixed(1)} m tall, ${s.spread.toFixed(1)} m across`);
    } else if (hoveredStructure !== undefined) {
      report(describeStructure(hoveredStructure));
    } else if (shadeGrid) {
      const hours = sampleShade(shadeGrid, p.x, p.y);
      report(
        hours === null
          ? null
          : `${hours.toFixed(1)} h of direct sun here today — ${shadeBandLabel(hours, shadeGrid.thresholds)}`,
      );
    } else {
      report(null);
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    cancelPress();
    if (drag.current.kind !== 'none') {
      canvasRef.current?.releasePointerCapture(e.pointerId);
      drag.current = { kind: 'none' };
    }
  };

  const onDoubleClick = () => {
    if (isDrawingTool(state.tool)) state.commitDraft();
  };

  // Keyboard: finish or abandon a plot outline, delete the selected plant.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === 'Escape') {
        if (menu) setMenu(null);
        else if (isDrawingTool(state.tool)) state.cancelDraft();
        else state.select(null);
      } else if ((e.key === 'd' || e.key === 'D') && (e.metaKey || e.ctrlKey) && state.selectedId) {
        e.preventDefault();
        state.duplicatePlant(state.selectedId);
      } else if (e.key === 'Enter' && isDrawingTool(state.tool)) {
        state.commitDraft();
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && state.selectedId) {
        e.preventDefault();
        state.removePlant(state.selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, menu]);

  const selected = state.plants.find((p) => p.id === state.selectedId);

  return (
    <div className="plan-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={`plan-canvas ${isDrawingTool(state.tool) ? 'drawing' : ''}`}
        style={{ width: size.width, height: size.height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHoverInfo(null)}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          const id = hitPlant(localPoint(e));
          if (!id) {
            setMenu(null);
            return;
          }
          state.select(id);
          openMenu(e.clientX, e.clientY, id);
        }}
      />

      {menu && <PlantMenu menu={menu} onClose={() => setMenu(null)} />}

      {isDrawingTool(state.tool) && (
        <div className="canvas-hint">
          Click to place corners · <b>Enter</b> or double-click to close · <b>Esc</b> to cancel
        </div>
      )}

      {hoverInfo && !isDrawingTool(state.tool) && (
        <div className={`canvas-readout ${hoverInfo.aloft ? 'aloft' : ''}`}>{hoverInfo.text}</div>
      )}

      {selected && (
        /*
         * What you can do to the plant you have just selected, without going
         * anywhere for it. Duplicating was already here twice — on the
         * right-click menu and on ⌘D — but both are things you have to know
         * about, and planting is done in threes and fives.
         *
         * These never move. They were briefly made to step aside when the
         * readout came up, which meant they fled the cursor that was reaching
         * for them: moving towards a button leaves the canvas, which clears the
         * readout, which sent the buttons back where they came from. The
         * readout gets out of their way instead — see `.canvas-readout.aloft`.
         */
        <div className="plant-chips">
          <button
            onClick={() => state.removePlant(selected.id)}
            title={`Remove ${getSpecies(selected.speciesId).common}`}
          >
            Remove {getSpecies(selected.speciesId).common}
          </button>
          <button
            onClick={() => state.duplicatePlant(selected.id)}
            title="Plant another of the same, just off this one (⌘D)"
          >
            Duplicate
          </button>
        </div>
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

/**
 * Right-click menu on a planted plant.
 *
 * Duplicating is the one thing a designer does constantly — planting is done in
 * threes and fives, not ones — and until now it meant going back to the library
 * and dragging the same species out again, losing your place in a list of
 * thirty. The copy lands beside the original with a fresh seed, so it reads as
 * a second plant of the same kind rather than a clone of the same individual.
 */
function PlantMenu({
  menu,
  onClose,
}: {
  menu: { x: number; y: number; id: string };
  onClose: () => void;
}) {
  const plants = useStore((s) => s.plants);
  const duplicatePlant = useStore((s) => s.duplicatePlant);
  const removePlant = useStore((s) => s.removePlant);

  const plant = plants.find((p) => p.id === menu.id);
  if (!plant) return null;
  const species = getSpecies(plant.speciesId);
  const tally = plants.filter((p) => p.speciesId === plant.speciesId).length;

  return (
    <>
      <button className="menu-shield" onClick={onClose} aria-label="Close menu" />
      <div className="plant-menu" style={{ left: menu.x, top: menu.y }} role="menu">
        <div className="plant-menu-head">
          {species.common}
          <span>
            {tally} on plan
          </span>
        </div>
        <button
          role="menuitem"
          onClick={() => {
            duplicatePlant(menu.id);
            onClose();
          }}
        >
          Add another <kbd>⌘D</kbd>
        </button>
        <button
          role="menuitem"
          className="danger"
          onClick={() => {
            removePlant(menu.id);
            onClose();
          }}
        >
          Remove <kbd>⌫</kbd>
        </button>
      </div>
    </>
  );
}
