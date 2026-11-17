import { creditsFileSchema, reefSchema, speciesFileSchema, tuningSchema } from './schemas';
import type { Credit, Reef, Species, Tuning } from './schemas';

async function getJSON(path: string): Promise<unknown> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

export const loadReef = async (): Promise<Reef> => reefSchema.parse(await getJSON('data/reef.json'));
export const loadSpecies = async (): Promise<Species[]> => speciesFileSchema.parse(await getJSON('data/species.json')).species;
export const loadCredits = async (): Promise<Credit[]> => creditsFileSchema.parse(await getJSON('data/credits.json')).credits;
export const loadTuning = async (): Promise<Tuning> => tuningSchema.parse(await getJSON('data/tuning.json'));
