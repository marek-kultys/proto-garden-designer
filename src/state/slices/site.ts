import { clampSlopeFall, normaliseSlopeDirection } from '../../model/terrain';
import type { Site, TimeState } from '../../model/types';
import type { SliceOf } from '../slice';
import { pushHistory } from './history';

export interface LocationPreset {
  label: string;
  latitude: number;
  longitude: number;
  altitude: number;
}

export const LOCATION_PRESETS: LocationPreset[] = [
  { label: 'London', latitude: 51.51, longitude: -0.13, altitude: 11 },
  { label: 'Bristol', latitude: 51.45, longitude: -2.59, altitude: 11 },
  { label: 'Manchester', latitude: 53.48, longitude: -2.24, altitude: 38 },
  { label: 'Edinburgh', latitude: 55.95, longitude: -3.19, altitude: 47 },
  { label: 'Penzance', latitude: 50.12, longitude: -5.54, altitude: 20 },
  { label: 'Aviemore', latitude: 57.19, longitude: -3.83, altitude: 228 },
];

export const DEFAULT_SITE: Site = {
  latitude: 51.51,
  longitude: -0.13,
  altitude: 11,
  northAngle: 0,
  dst: true,
  label: 'London',
  // Level until told otherwise; south is the fall a slope most often has.
  slopeFall: 0,
  slopeDirection: 180,
};

/** Whether two sites are the same garden, field for field. */
function sameSite(a: Site, b: Site): boolean {
  return (
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    a.altitude === b.altitude &&
    a.northAngle === b.northAngle &&
    a.dst === b.dst &&
    a.label === b.label &&
    a.slopeFall === b.slopeFall &&
    a.slopeDirection === b.slopeDirection
  );
}

/**
 * What the undo button should say it will take back.
 *
 * The tooltip reads "Undo turn north", so the label has to name the thing the
 * person just did rather than the field it lives in.
 */
function siteLabel(patch: Partial<Site>): string {
  const keys = Object.keys(patch);
  if (keys.every((k) => k === 'northAngle')) return 'Turn north';
  if (keys.every((k) => k === 'slopeFall' || k === 'slopeDirection')) return 'Change slope';
  if (keys.every((k) => k === 'dst')) return 'Change summer time';
  if (keys.every((k) => k === 'latitude' || k === 'longitude' || k === 'altitude' || k === 'label'))
    return 'Change location';
  return 'Change site';
}

export interface SiteSlice {
  site: Site;
  time: TimeState;
  baseYear: number;
  setTime: (patch: Partial<TimeState>) => void;
  setSite: (patch: Partial<Site>) => void;
}

export const siteSlice: SliceOf<SiteSlice> = (set) => ({
  site: DEFAULT_SITE,
  // Midday in early June, on the day the garden goes in.
  time: { hour: 13, doy: 155, year: 0 },
  baseYear: new Date().getFullYear(),

  setTime: (patch) => set((s) => ({ time: { ...s.time, ...patch } })),
  /**
   * The slope fields are brought into range on the way in.
   *
   * Everything else on the site is either free text or a figure with no bound
   * the app relies on, but a fall the control cannot reach would leave the
   * slider showing one garden and the drawing showing another — so it is
   * clamped here as well as at the file boundary, and by the same rule.
   */
  setSite: (patch) =>
    set((s) => {
      const site = { ...s.site, ...patch };
      if (patch.slopeFall !== undefined) site.slopeFall = clampSlopeFall(patch.slopeFall);
      if (patch.slopeDirection !== undefined) {
        site.slopeDirection = normaliseSlopeDirection(patch.slopeDirection);
      }
      // Nothing moved — a number field re-emitting the value it already had, or
      // the location already chosen. An undo step that undoes nothing is worse
      // than none: it spends a press and appears to do nothing.
      if (sameSite(s.site, site)) return {};
      // Dragging the dial fires on every pointer move, so the key folds a whole
      // turn into one step; a turn and then a slope are two keys and two steps.
      return {
        ...pushHistory(s, siteLabel(patch), `site:${Object.keys(patch).sort().join(',')}`),
        site,
      };
    }),
});
