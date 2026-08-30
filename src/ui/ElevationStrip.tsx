import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { drawElevation } from '../render/drawElevation';
import { useSun } from './useSun';

export interface ElevationStripProps {
  width: number;
  height: number;
}

export function ElevationStrip({ width, height }: ElevationStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const plants = useStore((s) => s.plants);
  const site = useStore((s) => s.site);
  const time = useStore((s) => s.time);
  const sightLine = useStore((s) => s.sightLine);
  const selectedId = useStore((s) => s.selectedId);
  const structures = useStore((s) => s.structures);
  const plot = useStore((s) => s.plot);
  const selectedStructureId = useStore((s) => s.selectedStructureId);
  const sliceDepth = useStore((s) => s.sliceDepth);
  const { light } = useSun();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawElevation(ctx, width, height, {
      plot,
      plants,
      structures,
      site,
      time,
      light,
      sightLine,
      sliceDepth,
      selectedId,
      selectedStructureId,
    });
  }, [
    plot,
    plants,
    structures,
    site,
    time,
    light,
    sightLine,
    sliceDepth,
    selectedId,
    selectedStructureId,
    width,
    height,
  ]);

  return (
    <>
      <canvas ref={canvasRef} style={{ width, height }} />
      <div className="elevation-label">Elevation — slice A→B</div>
    </>
  );
}
