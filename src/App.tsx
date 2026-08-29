import { useCallback, useEffect, useRef, useState } from 'react';
import { LibraryPanel } from './ui/LibraryPanel';
import { PlanCanvas, type PlanApi } from './ui/PlanCanvas';
import { StageBottom } from './ui/StageBottom';
import { SitePanel } from './ui/SitePanel';
import { TimeBar } from './ui/TimeBar';
import { useStore } from './state/store';
import { getSpecies } from './model/plants';
import { polygonBounds } from './model/geometry';

interface DragState {
  speciesId: string;
  x: number;
  y: number;
  moved: boolean;
}

type Sheet = 'plants' | 'site' | null;

const NARROW = '(max-width: 900px)';

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

export default function App() {
  const planRef = useRef<PlanApi>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const narrow = useIsNarrow();

  const addPlant = useStore((s) => s.addPlant);
  const plot = useStore((s) => s.plot);
  const plants = useStore((s) => s.plants);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const clearPlants = useStore((s) => s.clearPlants);
  const resetPlot = useStore((s) => s.resetPlot);

  const [rect, setRect] = useState({ w: 14, h: 10 });

  const onStartDrag = useCallback((speciesId: string, x: number, y: number) => {
    setDrag({ speciesId, x, y, moved: false });
  }, []);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      setDrag((d) => {
        if (!d) return d;
        // A few pixels of slop, so a tap on a touchscreen is not read as a drag.
        const moved = d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6;
        return { ...d, x: e.clientX, y: e.clientY, moved };
      });
    };

    const onUp = (e: PointerEvent) => {
      const current = drag;
      setDrag(null);
      if (!current) return;

      const dropped = current.moved ? planRef.current?.fromClient(e.clientX, e.clientY) : null;
      if (dropped) {
        addPlant(current.speciesId, dropped);
        return;
      }
      // A tap rather than a drag: put it in the middle of the plot and get out
      // of the way. On a phone the library covers the canvas, so dragging onto
      // something you cannot see is not a real option — tap, then reposition.
      const b = polygonBounds(plot);
      addPlant(current.speciesId, { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
      if (window.matchMedia(NARROW).matches) setSheet(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, addPlant, plot]);

  // Escape closes an open sheet before it does anything else.
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSheet(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [sheet]);

  const plotTools = (
    <>
      <button
        className={tool === 'draw-plot' ? 'on' : ''}
        onClick={() => {
          setTool(tool === 'draw-plot' ? 'select' : 'draw-plot');
          setSheet(null);
        }}
      >
        {tool === 'draw-plot' ? 'Drawing outline…' : 'Draw plot outline'}
      </button>

      <div className="rect-tool">
        <input
          type="number"
          min={2}
          max={80}
          value={rect.w}
          onChange={(e) => setRect((r) => ({ ...r, w: Number(e.target.value) || 1 }))}
          aria-label="Plot width in metres"
        />
        <span>×</span>
        <input
          type="number"
          min={2}
          max={80}
          value={rect.h}
          onChange={(e) => setRect((r) => ({ ...r, h: Number(e.target.value) || 1 }))}
          aria-label="Plot depth in metres"
        />
        <span className="unit">m</span>
        <button onClick={() => resetPlot(rect.w, rect.h)}>Set plot</button>
      </div>

      <button onClick={clearPlants} disabled={plants.length === 0}>
        Clear planting
      </button>
    </>
  );

  return (
    <div className="app" data-sheet={sheet ?? 'none'}>
      <header className="topbar">
        <div className="brand">
          <h1>Garden Designer</h1>
          <span>
            prototype — draw a plot, plant it, then move through the day, the year and the next
            twenty years
          </span>
        </div>

        <div className="tools">{plotTools}</div>

        <div className="sheet-tabs">
          <button
            className={sheet === 'plants' ? 'on' : ''}
            onClick={() => setSheet(sheet === 'plants' ? null : 'plants')}
          >
            Plants{plants.length > 0 ? ` · ${plants.length}` : ''}
          </button>
          <button
            className={sheet === 'site' ? 'on' : ''}
            onClick={() => setSheet(sheet === 'site' ? null : 'site')}
          >
            Site
          </button>
        </div>
      </header>

      <aside className="library">
        {narrow && (
          <div className="sheet-head">
            <span className="grabber" />
            <button className="sheet-close" onClick={() => setSheet(null)} aria-label="Close">
              Done
            </button>
          </div>
        )}
        <LibraryPanel onStartDrag={onStartDrag} />
      </aside>

      <main className="stage">
        <PlanCanvas ref={planRef} />
        <StageBottom />
      </main>

      <aside className="site-panel">
        {narrow && (
          <div className="sheet-head">
            <span className="grabber" />
            <button className="sheet-close" onClick={() => setSheet(null)} aria-label="Close">
              Done
            </button>
          </div>
        )}
        <SitePanel extraTools={narrow ? plotTools : null} />
      </aside>

      <TimeBar />

      {narrow && sheet && (
        <button className="sheet-backdrop" onClick={() => setSheet(null)} aria-label="Close panel" />
      )}

      {drag && drag.moved && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          {getSpecies(drag.speciesId).common}
        </div>
      )}
    </div>
  );
}
