import type { StoreApi } from 'zustand';
import type { AppState } from './store';

/**
 * One subject's share of the store.
 *
 * Every slice is handed the same `set` and `get` as the whole store, because a
 * slice frequently has to read or write beyond its own subject — placing a
 * plant writes the undo history, opening a project moves the eye. What the
 * split buys is not isolation but a place to look: one file per thing the app
 * knows about, rather than nine hundred lines of all of them interleaved.
 */
export type SliceOf<T> = (
  set: StoreApi<AppState>['setState'],
  get: StoreApi<AppState>['getState'],
) => T;
