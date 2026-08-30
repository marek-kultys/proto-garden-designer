import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { drawPanorama } from '../render/drawPanorama';
import {
  MAX_PITCH_DOWN,
  MAX_PITCH_UP,
  FOV_RANGE,
  effectiveFov,
  eyeElevation,
  pixelsPerDegree,
} from '../model/panorama';
import { compassLabel, useSun } from './useSun';

export interface PanoramaViewProps {
  width: number;
  height: number;
}

/**
 * Drag left or right anywhere in the picture to turn on the spot.
 *
 * Pixels convert back to degrees through the same pixels-per-degree the drawing
 * uses, so a feature stays under your finger as you swing round — the thing that
 * makes it feel like turning your head rather than scrubbing a slider.
 */
export function PanoramaView({ width, height }: PanoramaViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<{ x: number; y: number; heading: number; pitch: number } | null>(null);
  const [hint, setHint] = useState(true);

  const plot = useStore((s) => s.plot);
  const plants = useStore((s) => s.plants);
  const site = useStore((s) => s.site);
  const time = useStore((s) => s.time);
  const observer = useStore((s) => s.observer);
  const selectedId = useStore((s) => s.selectedId);
  const structures = useStore((s) => s.structures);
  const selectedStructureId = useStore((s) => s.selectedStructureId);
  const setHeading = useStore((s) => s.setHeading);
  const setRenderedFov = useStore((s) => s.setRenderedFov);
  const setPitch = useStore((s) => s.setPitch);
  const setFov = useStore((s) => s.setFov);
  const centreObserver = useStore((s) => s.centreObserver);
  const turnObserver = useStore((s) => s.turnObserver);
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
    drawPanorama(ctx, width, height, {
      plot,
      plants,
      structures,
      site,
      time,
      light,
      observer,
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
    observer,
    selectedId,
    selectedStructureId,
    width,
    height,
  ]);

  const fov = effectiveFov(width, height, observer.fov);
  const degPerPx = 1 / pixelsPerDegree(width, height, observer.fov);

  useEffect(() => {
    setRenderedFov(fov);
  }, [fov, setRenderedFov]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="panorama-canvas"
        style={{ width, height }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = {
            x: e.clientX,
            y: e.clientY,
            heading: observer.heading,
            pitch: observer.pitch,
          };
          setHint(false);
        }}
        onPointerMove={(e) => {
          const d = dragging.current;
          if (!d) return;
          // Drag right, the world slides right, so the viewer turns left; drag
          // down and you tilt your head up. Both are the same gesture as moving
          // the picture itself, which is what makes it feel like looking rather
          // than scrubbing.
          setHeading(d.heading - (e.clientX - d.x) * degPerPx);
          setPitch(d.pitch - (e.clientY - d.y) * degPerPx);
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          dragging.current = null;
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
      />

      <div className="pano-controls">
        <button onClick={() => turnObserver(-45)} title="Turn left" aria-label="Turn left">
          ‹
        </button>
        <span className="pano-heading">
          {compassLabel(observer.heading)} · {Math.round(observer.heading)}°
        </span>
        <span className="pano-fov">
          {Math.round(fov)}° wide · eyes {eyeElevation(observer).toFixed(2)} m
        </span>
        <label className="pano-width" title="How wide a view — narrower bends the picture less">
          <span>View</span>
          <input
            type="range"
            min={FOV_RANGE.min}
            max={FOV_RANGE.max}
            step={FOV_RANGE.step}
            value={observer.fov}
            onChange={(e) => setFov(Number(e.target.value))}
            aria-label="Width of the view in degrees"
          />
        </label>
        <button
          onClick={() => setPitch(observer.pitch + 12)}
          disabled={observer.pitch >= MAX_PITCH_UP}
          title="Look up"
          aria-label="Look up"
        >
          ⌃
        </button>
        <button
          onClick={() => setPitch(observer.pitch - 12)}
          disabled={observer.pitch <= -MAX_PITCH_DOWN}
          title="Look down"
          aria-label="Look down"
        >
          ⌄
        </button>
        <button onClick={() => turnObserver(45)} title="Turn right" aria-label="Turn right">
          ›
        </button>
        {/* Here rather than only in the side panel: this is where you are
            standing when you notice the eye has wandered off the plan. */}
        <button
          className="pano-centre"
          onClick={centreObserver}
          title="Put the eye back in the middle of the plot"
        >
          Centre
        </button>
      </div>

      {hint && <div className="pano-hint">Drag to look around and up · move the eye on the plan</div>}
    </>
  );
}
