import { useCallback, useEffect, useRef, useState } from 'react';
import { LibraryPanel } from './ui/LibraryPanel';
import { PlanCanvas, type PlanApi } from './ui/PlanCanvas';
import { ElevationStrip } from './ui/ElevationStrip';
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

export default function App() {
  const planRef = useRef<PlanApi>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

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
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, moved: true } : d));
    };

    const onUp = (e: PointerEvent) => {
      const current = drag;
      setDrag(null);
      if (!current) return;

      const dropped = planRef.current?.fromClient(e.clientX, e.clientY);
      if (dropped) {
        addPlant(current.speciesId, dropped);
        return;
      }
      // A click rather than a drag: put it in the middle of the plot so the
      // library still works on a trackpad or a touchscreen.
      if (!current.moved) {
        const b = polygonBounds(plot);
        addPlant(current.speciesId, {
          x: (b.minX + b.maxX) / 2,
          y: (b.minY + b.maxY) / 2,
        });
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, addPlant, plot]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Garden Designer</h1>
          <span>prototype — draw a plot, plant it, then move through the day, the year and the next twenty years</span>
        </div>

        <div className="tools">
          <button
            className={tool === 'draw-plot' ? 'on' : ''}
            onClick={() => setTool(tool === 'draw-plot' ? 'select' : 'draw-plot')}
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
            <button onClick={() => resetPlot(rect.w, rect.h)}>Rectangular plot</button>
          </div>

          <button onClick={clearPlants} disabled={plants.length === 0}>
            Clear planting
          </button>
        </div>
      </header>

      <LibraryPanel onStartDrag={onStartDrag} />

      <main className="stage">
        <PlanCanvas ref={planRef} />
        <ElevationStrip />
      </main>

      <SitePanel />
      <TimeBar />

      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          {getSpecies(drag.speciesId).common}
        </div>
      )}
    </div>
  );
}
