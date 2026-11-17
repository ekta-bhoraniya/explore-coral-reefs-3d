import { z } from 'zod';

const vec2 = z.object({ x: z.number(), z: z.number() });

export const CORAL_TYPES = ['branching', 'brain', 'table', 'soft', 'anemone', 'fan', 'rock'] as const;

export const placementSchema = z.object({
  id: z.string().optional(),
  /** "gen:<type>" for CoralGen output, otherwise a path under /public/models */
  asset: z.string().regex(/^(gen:(branching|brain|table|soft|anemone|fan|rock)|[\w\-/]+\.glb)$/),
  x: z.number(),
  z: z.number(),
  rotY: z.number().default(0),
  scale: z.number().positive().default(1),
  seed: z.number().int().default(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const reefSchema = z.object({
  version: z.literal(1),
  start: z.object({ x: z.number(), z: z.number(), yaw: z.number(), pitch: z.number() }),
  bounds: z.object({ softRadius: z.number().positive(), radius: z.number().positive() }),
  placements: z.array(placementSchema).min(1),
});

export const BEHAVIOUR_TYPES = ['anemone', 'circleCoral', 'glide', 'patrol', 'forage', 'den', 'rest', 'graze'] as const;

export const photoSchema = z.object({
  src: z.string(),
  alt: z.string(),
  credit: z.string(),
  licence: z.string(),
  url: z.string(),
});

export const speciesSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  commonName: z.string().min(1),
  scientificName: z.string().min(1),
  /** article used by the screen-reader announcement, e.g. "A sea turtle is nearby" */
  shortName: z.string().min(1),
  model: z.object({
    /** path under /public, or "proc:fish" for the procedural stand-in body */
    src: z.string(),
    /** radians around Y so the head points +X after normalising */
    rotationY: z.number().default(0),
    /** extra radians around X/Z for models modelled lying down */
    rotationX: z.number().default(0),
    rotationZ: z.number().default(0),
    tint: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    tintStrength: z.number().min(0).max(1).default(0),
    /** colours for the procedural body: [body, accent, tail] */
    procColors: z.array(z.string()).length(3).optional(),
    animated: z.boolean().default(false),
  }),
  /** length in the scene, metres (a typical adult) */
  sceneLength: z.number().positive(),
  description: z.string().min(1),
  facts: z.object({
    length: z.string().min(1),
    weight: z.string().optional(),
    depth: z.string().min(1),
    hides: z.string().min(1),
  }),
  source: z.object({ label: z.string(), url: z.string().url() }),
  factStatus: z.enum(['draft', 'verified']),
  photos: z.array(photoSchema).max(3),
  behaviour: z.object({
    type: z.enum(BEHAVIOUR_TYPES),
    home: z.string().optional(),
    radius: z.number().positive().optional(),
    speed: z.number().positive(),
    maxSpeed: z.number().positive(),
    shyDistance: z.number().nonnegative(),
    count: z.number().int().positive().default(1),
    spawn: vec2.optional(),
  }),
});

export const speciesFileSchema = z.object({ version: z.literal(1), species: z.array(speciesSchema).min(1) });

export const CREDIT_CATEGORIES = ['3D models', 'Textures', 'Photos', 'Fish facts', 'Sound', 'Code libraries'] as const;
export const creditSchema = z.object({
  category: z.enum(CREDIT_CATEGORIES),
  title: z.string(),
  author: z.string(),
  licence: z.string(),
  url: z.string(),
  files: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
export const creditsFileSchema = z.object({ version: z.literal(1), credits: z.array(creditSchema).min(1) });

const num = z.number();
export const tuningSchema = z.object({
  exposure: num,
  sun: z.object({ intensity: num, elevationDeg: num, azimuthDeg: num, color: z.string() }),
  hemi: z.object({ intensity: num, sky: z.string(), ground: z.string() }),
  fog: z.object({ color: z.string(), density: num, edgeDensity: num }),
  depthLoss: z.object({ redDistance: num, greenDistance: num, strength: num }),
  surface: z.object({ rippleSpeed: num, normalStrength: num, windowDeg: num, skyColor: z.string(), deepColor: z.string() }),
  caustics: z.object({ strength: num, scale: num, speed: num }),
  shafts: z.object({ opacityMin: num, opacityMax: num }),
  particles: z.object({ size: num, drift: num }),
  bloom: z.object({ strength: num, threshold: num, radius: num }),
  grade: z.object({ saturation: num, contrast: num, tint: z.string(), tintStrength: num, vignette: num, mask: num, warmth: num }),
  swim: z.object({ accel: num, maxSpeed: num, kick: num, drag: num, lookInertia: num, lookSensitivity: num }),
  fish: z.object({ wiggleAmp: num, wiggleFreq: num }),
  sway: z.object({ strength: num, speed: num }),
});

export type Placement = z.infer<typeof placementSchema>;
export type Reef = z.infer<typeof reefSchema>;
export type Species = z.infer<typeof speciesSchema>;
export type Credit = z.infer<typeof creditSchema>;
export type Tuning = z.infer<typeof tuningSchema>;
