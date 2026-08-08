import { useMemo } from 'react';
import { dayLength, solarPosition } from '../model/sun';
import { lightingFor } from '../render/palette';
import { useStore } from '../state/store';

export function useSun() {
  const site = useStore((s) => s.site);
  const time = useStore((s) => s.time);
  const baseYear = useStore((s) => s.baseYear);

  return useMemo(() => {
    const calendarYear = baseYear + Math.round(time.year);
    const position = solarPosition(site, time.doy, time.hour, calendarYear);
    const day = dayLength(site, time.doy, calendarYear);
    const light = lightingFor(position.altitude, position.azimuth);
    return { position, day, light, calendarYear };
  }, [site, time, baseYear]);
}

export function formatHour(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  const hh = m === 60 ? (h + 1) % 24 : h;
  const mm = m === 60 ? 0 : m;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function compassLabel(bearing: number): string {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round(((bearing % 360) + 360) % 360 / 22.5) % 16];
}
