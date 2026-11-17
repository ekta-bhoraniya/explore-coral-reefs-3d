import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { Species } from './data/schemas';

export type Phase = 'intro' | 'explore';
export type Quality = 'high' | 'medium' | 'low';

export interface AppState {
  phase: Phase;
  /** 0..1 progress of the dive intro (scroll) */
  introProgress: number;
  loadProgress: number;
  sceneReady: boolean;
  species: Species[];
  selectedFish: { instanceId: string; speciesId: string } | null;
  hoveredSpecies: string | null;
  focusedFish: string | null;
  soundOn: boolean;
  soundUnlocked: boolean;
  maskOn: boolean;
  quality: Quality;
  announcement: string;
  hint: { swam: boolean; looked: boolean; clicked: boolean };
}

const storage = {
  get(key: string) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, v: string) {
    try { localStorage.setItem(key, v); } catch { /* storage blocked */ }
  },
};
export { storage };

export const store = createStore<AppState>(() => ({
  phase: 'intro',
  introProgress: 0,
  loadProgress: 0,
  sceneReady: false,
  species: [],
  selectedFish: null,
  hoveredSpecies: null,
  focusedFish: null,
  soundOn: storage.get('reef.muted') !== '1',
  soundUnlocked: false,
  maskOn: storage.get('reef.mask') !== '0',
  quality: 'high',
  announcement: '',
  hint: { swam: false, looked: false, clicked: false },
}));

export const useApp = <T,>(sel: (s: AppState) => T) => useStore(store, sel);
export const setState = store.setState;
export const getState = store.getState;

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const params = new URLSearchParams(location.search);
