import * as THREE from 'three';
import type { Reef as ReefData, Species, Tuning } from '../data/schemas';
import { loadReef, loadSpecies, loadTuning } from '../data/load';
import { getState, params, reducedMotion, setState, store, type Quality } from '../store';
import { shared } from './shaders';
import { Terrain } from './Terrain';
import { Input, Player, SWIM_HEIGHT, isTyping } from './Player';
import { Lighting, Water } from './Water';
import { Particles } from './Particles';
import { Post } from './Post';
import { Assets } from './Assets';
import { Reef } from './Reef';
import { FishManager } from './FishManager';
import { Schools } from './Schools';
import { Picking } from './Picking';
import { Sound } from './Sound';
import type { Fish } from './Fish';

const STARTERS = ['clownfish', 'emperor-angelfish', 'sea-turtle'];

const TIERS: Record<Quality, { shadow: number; particles: number; shafts: number; bloom: boolean; lod: [number, number]; pr: number; draw: number }> = {
  high: { shadow: 2048, particles: 2000, shafts: 12, bloom: true, lod: [8, 18], pr: 2, draw: 46 },
  medium: { shadow: 1024, particles: 1000, shafts: 8, bloom: true, lod: [6, 14], pr: 1.5, draw: 40 },
  low: { shadow: 0, particles: 400, shafts: 4, bloom: false, lod: [4, 10], pr: 1, draw: 34 },
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Engine {
  renderer!: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
  tuning!: Tuning;
  reefData!: ReefData;
  species: Species[] = [];
  terrain!: Terrain;
  player!: Player;
  input!: Input;
  lighting!: Lighting;
  water!: Water;
  particles!: Particles;
  post!: Post;
  readonly assets = new Assets();
  reef!: Reef;
  fishes!: FishManager;
  schools!: Schools;
  picking!: Picking;
  readonly sound = new Sound();
  private timer = new THREE.Timer();
  private hovered: Fish | null = null;
  private selected: Fish | null = null;
  private focusRing!: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private focusIndex = -1;
  private frameTimes: number[] = [];
  private measureFrom = 0;
  private tier: Quality = 'high';
  private reduced = reducedMotion();
  private lastAnnounce = { species: '', time: -99 };
  private announceTimer = 0;
  private wasUnderwater = false;
  private splashed = false;
  private fovBeforeCard = 72;
  /** set by the editor: when true the engine skips the player and lets the editor drive the camera */
  editorActive = false;
  onFrame: ((dt: number) => void)[] = [];
  private skyColor = new THREE.Color('#9fd8f0');

  async init(canvas: HTMLCanvasElement) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer = r;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight, false);

    let base = 0;
    const progress = (p: number) => setState({ loadProgress: Math.max(getState().loadProgress, Math.min(0.99, base + p)) });
    [this.tuning, this.reefData, this.species] = await Promise.all([loadTuning(), loadReef(), loadSpecies()]);
    setState({ species: this.species });
    r.toneMappingExposure = this.tuning.exposure;
    progress(0.1);

    this.terrain = new Terrain();
    this.scene.add(this.terrain.mesh);
    this.lighting = new Lighting(this.scene, this.tuning);
    this.water = new Water(this.scene, this.tuning);
    this.particles = new Particles(this.scene, this.tuning, r.getPixelRatio());
    this.post = new Post(r, this.tuning);
    this.input = new Input(canvas);
    this.player = new Player(this.camera, this.tuning);
    this.player.reducedMotion = this.reduced;
    const { start, bounds } = this.reefData;
    this.player.boundary.softRadius = bounds.softRadius;
    this.player.boundary.radius = bounds.radius;
    this.player.setPose(start.x, start.z, start.yaw, start.pitch);
    this.picking = new Picking(canvas, this.camera);
    this.applyTuning();
    progress(0.2);

    // Reef: start area first is implicit (all chunks are generated in code and cheap); GLB placements preload.
    this.reef = new Reef(this.terrain, this.assets);
    base = 0.2;
    this.assets.onProgress = (p) => progress(0.2 + p * 0.6);
    await this.reef.preload(this.reefData.placements);
    this.reef.build(this.reefData.placements);
    this.scene.add(this.reef.group);

    this.fishes = new FishManager(this.assets, this.terrain, this.reef, this.reduced);
    this.scene.add(this.fishes.group);
    await Promise.all(this.species.filter((s) => STARTERS.includes(s.id)).map((s) => this.fishes.addSpecies(s)));
    this.schools = new Schools(this.terrain);
    this.scene.add(this.schools.group);

    this.focusRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 48),
      new THREE.MeshBasicMaterial({ color: '#bff6ff', transparent: true, opacity: 0.9, depthTest: false, fog: false }),
    );
    this.focusRing.renderOrder = 20;
    this.focusRing.visible = false;
    this.scene.add(this.focusRing);

    this.applyTier(params.get('quality') as Quality || 'high');
    this.bindEvents(canvas);
    this.resize();
    addEventListener('resize', () => this.resize());
    // compile shaders up front so the first underwater frame doesn't hitch
    this.renderer.compile(this.scene, this.camera);
    setState({ loadProgress: 1, sceneReady: true });
    this.renderer.setAnimationLoop(() => this.frame());

    // Remaining species load in the background after arrival.
    for (const s of this.species.filter((s) => !STARTERS.includes(s.id))) await this.fishes.addSpecies(s);

    if (params.get('debug') === '1') {
      (window as unknown as { __reef: Engine }).__reef = this;
      (await import('./Debug')).mountDebug(this);
    }
    if (params.get('editor') === '1') (await import('./Editor')).mountEditor(this);
  }

  applyTuning() {
    const t = this.tuning;
    this.renderer.toneMappingExposure = t.exposure;
    shared.uCausticStrength.value = t.caustics.strength;
    shared.uCausticScale.value = t.caustics.scale;
    shared.uCausticSpeed.value = t.caustics.speed;
    shared.uSwayStrength.value = t.sway.strength;
    shared.uSwaySpeed.value = t.sway.speed;
    this.lighting.apply();
    this.water.apply();
    this.particles.apply();
    this.post.apply();
  }

  applyTier(q: Quality) {
    if (!TIERS[q]) q = 'high';
    this.tier = q;
    const t = TIERS[q];
    this.lighting.setShadows(t.shadow);
    this.particles.setCount(Math.round(t.particles * (this.reduced ? 0.5 : 1)));
    this.water.setShaftCount(t.shafts);
    this.post.setBloom(t.bloom);
    this.reef.lodDistances = t.lod;
    this.reef.drawDistance = t.draw;
    this.reef.setShadows(t.shadow > 0);
    this.schools.setTier(q);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, t.pr));
    this.particles.setPixelRatio(this.renderer.getPixelRatio());
    this.resize();
    setState({ quality: q });
  }

  private resize() {
    if (!this.post) return;
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private bindEvents(canvas: HTMLCanvasElement) {
    this.player.onKick = () => this.sound.play('kick');
    this.particles.onExhale = () => {
      this.sound.play('bubble');
      setTimeout(() => this.sound.play('bubble', 0.7), 180);
    };
    canvas.addEventListener('click', () => {
      this.unlockSound();
      if (getState().phase !== 'explore' || this.input.wasDrag || this.editorActive) return;
      if (getState().selectedFish) {
        setState({ selectedFish: null });
        return;
      }
      if (this.hovered) this.select(this.hovered);
    });
    addEventListener('keydown', (e) => {
      if (getState().phase !== 'explore' || isTyping(e) || this.editorActive) return;
      if (e.key === 'Escape' && getState().selectedFish) setState({ selectedFish: null });
      if (getState().selectedFish) return;
      const inCanvasContext = document.activeElement === document.body || document.activeElement === canvas;
      if (e.key === 'Tab' && inCanvasContext) {
        const list = this.picking.inView(this.fishes.fish);
        if (!list.length) return;
        e.preventDefault();
        this.focusIndex = (this.focusIndex + (e.shiftKey ? -1 : 1) + list.length) % list.length;
        const f = list[this.focusIndex];
        setState({ focusedFish: f.id });
        setState({ announcement: `${f.species.commonName}. Press Enter to learn more.` });
      }
      if (e.key === 'Enter' && getState().focusedFish && inCanvasContext) {
        const f = this.fishes.byId(getState().focusedFish!);
        if (f) this.select(f);
      }
    });
    // React to selection changes coming from the UI (close button, Esc in the card).
    store.subscribe((s, prev) => {
      if (s.selectedFish !== prev.selectedFish && !s.selectedFish && this.selected) this.deselect();
      if (s.soundOn !== prev.soundOn) this.sound.setMuted(!s.soundOn);
      if (s.maskOn !== prev.maskOn) this.post.grade.uniforms.uMaskOn.value = s.maskOn ? 1 : 0;
    });
    this.sound.setMuted(!getState().soundOn);
    this.post.grade.uniforms.uMaskOn.value = getState().maskOn ? 1 : 0;
  }

  unlockSound() {
    if (getState().soundUnlocked) return;
    this.sound.unlock();
    setState({ soundUnlocked: true });
  }

  private select(f: Fish) {
    this.selected = f;
    f.selected = true;
    this.player.frozen = true;
    this.player.lookTarget = f.pos;
    // centre over ~600 ms, then hand the view back so dragging to look still works
    setTimeout(() => { if (this.selected === f) this.player.lookTarget = null; }, 700);
    this.fovBeforeCard = this.player.targetFov;
    this.player.targetFov = 60;
    this.input.enabled = false;
    this.sound.play('chime');
    setState({ selectedFish: { instanceId: f.id, speciesId: f.species.id }, focusedFish: null, hint: { ...getState().hint, clicked: true } });
  }

  private deselect() {
    const f = this.selected!;
    f.selected = false;
    this.selected = null;
    this.player.frozen = false;
    this.player.lookTarget = null;
    this.player.targetFov = this.fovBeforeCard;
    this.input.enabled = true;
  }

  /** Camera pose for the dive intro, p ∈ [0, 1]. */
  private introPose(p: number) {
    const { start } = this.reefData;
    const s = getState();
    if (!s.sceneReady) p = Math.min(p, 0.55);
    let y: number, pitch: number, back: number;
    if (p < 0.55) {
      const t = smooth(0, 0.55, p);
      y = THREE.MathUtils.lerp(2.6, 0.5, t);
      pitch = THREE.MathUtils.lerp(-0.3, -1.0, t);
      back = THREE.MathUtils.lerp(4.5, 0, t);
    } else if (p < 0.7) {
      y = 0.5; pitch = -1.0; back = 0;
    } else {
      const t = smooth(0.7, 1, p);
      y = THREE.MathUtils.lerp(0.5, SWIM_HEIGHT, t);
      pitch = THREE.MathUtils.lerp(-1.0, start.pitch, smooth(0.8, 1, p));
      back = 0;
    }
    this.player.setPose(start.x, start.z + back, start.yaw, pitch);
    this.player.position.y = y;
    this.player.fov = this.player.targetFov = 72;
    this.camera.position.copy(this.player.position);
    this.camera.rotation.set(pitch, start.yaw, 0, 'YXZ');
    if (this.camera.fov !== 72) { this.camera.fov = 72; this.camera.updateProjectionMatrix(); }
    const g = this.post.grade.uniforms;
    g.uMask.value = this.tuning.grade.mask * smooth(0.85, 1, p);
    // brief white flash at the splash
    g.uFlash.value = Math.max(0, 1 - Math.abs(p - 0.5) / 0.04) * 0.85;
    if (p > 0.47 && !this.splashed) { this.splashed = true; this.sound.play('splash'); }
    if (p < 0.4) this.splashed = false;
  }

  private frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    shared.uTime.value += dt;
    shared.uMotion.value = 1;
    const s = getState();

    if (this.editorActive) {
      // the editor drives the camera
    } else if (s.phase === 'intro') {
      this.introPose(s.introProgress);
    } else {
      this.player.update(dt, this.input);
      this.player.apply();
      if (this.player.moved !== s.hint.swam || this.player.looked !== s.hint.looked) {
        setState({ hint: { ...s.hint, swam: this.player.moved, looked: this.player.looked } });
      }
    }

    const underwater = this.camera.position.y < 0;
    const above = underwater ? 0 : 1;
    if (underwater !== this.wasUnderwater) {
      this.wasUnderwater = underwater;
      this.sound.setUnderwater(underwater);
      if (underwater) this.particles.burst(this.camera.position.clone().add(new THREE.Vector3(0, -0.4, 0)), 40, 0.6);
      (this.scene.background as THREE.Color).set(underwater ? this.tuning.fog.color : this.skyColor);
    }
    this.post.grade.uniforms.uUnderwater.value = underwater ? 1 : 0;
    if (s.phase === 'explore') this.post.grade.uniforms.uMask.value = this.tuning.grade.mask;

    const viewDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.lighting.follow(this.camera.position);
    this.water.update(this.camera.position, viewDir, s.phase === 'explore' ? this.player.edge : 0, above);
    this.reef.update(this.camera.position);
    this.fishes.update(dt, this.camera.position);
    this.schools.update(dt, this.camera.position);
    const kicking = this.input.keys.has('ShiftLeft') || this.input.keys.has('ShiftRight');
    this.particles.update(dt, this.camera, s.phase === 'explore' ? this.player.speed : 0, s.phase === 'explore' && kicking && this.player.speed > 0.2, underwater);
    this.sound.update(this.player.speed / this.tuning.swim.maxSpeed);

    if (s.phase === 'explore' && !this.editorActive) this.updateInteraction(dt);
    else this.focusRing.visible = false;

    for (const fn of this.onFrame) fn(dt);
    this.post.render(this.scene, this.camera);
    if (s.phase === 'explore') this.measure(dt);
  }

  private updateInteraction(dt: number) {
    const s = getState();
    // Hover
    const hit = s.selectedFish ? null : this.picking.pick(this.fishes.fish);
    if (hit !== this.hovered) {
      if (this.hovered) this.hovered.hovered = false;
      this.hovered = hit;
      if (hit) { hit.hovered = true; this.sound.play('tick'); }
      this.renderer.domElement.style.cursor = hit ? 'pointer' : '';
      setState({ hoveredSpecies: hit?.species.id ?? null });
    }
    // Keyboard focus ring
    const focused = s.focusedFish ? this.fishes.byId(s.focusedFish) : null;
    if (focused && !s.selectedFish && focused.pos.distanceTo(this.camera.position) < 13) {
      this.focusRing.visible = true;
      this.focusRing.position.copy(focused.pos);
      this.focusRing.quaternion.copy(this.camera.quaternion);
      this.focusRing.scale.setScalar(Math.max(0.18, focused.length * 0.75));
      focused.hovered = true;
    } else {
      this.focusRing.visible = false;
      if (focused && !s.selectedFish) setState({ focusedFish: null });
    }
    // Screen-reader announcements: "A sea turtle is nearby"
    this.announceTimer -= dt;
    if (this.announceTimer <= 0) {
      this.announceTimer = 1;
      const t = performance.now() / 1000;
      let best: Fish | null = null, bd = 4;
      for (const f of this.fishes.fish) {
        const d = f.pos.distanceTo(this.camera.position);
        if (d < bd) { bd = d; best = f; }
      }
      if (best && (best.species.id !== this.lastAnnounce.species || t - this.lastAnnounce.time > 30)) {
        this.lastAnnounce = { species: best.species.id, time: t };
        setState({ announcement: `${best.species.shortName} is nearby.` });
      }
    }
  }

  /** Auto quality: measure frame time for 3 s; if the average exceeds 20 ms, drop a tier. */
  private measure(dt: number) {
    if (params.get('quality')) return;
    const now = performance.now();
    if (!this.measureFrom) this.measureFrom = now + 500; // skip the first frames after arrival
    if (now < this.measureFrom) return;
    this.frameTimes.push(dt * 1000);
    if (now - this.measureFrom > 3000) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.frameTimes = [];
      this.measureFrom = now + 500;
      if (avg > 20 && this.tier !== 'low') this.applyTier(this.tier === 'high' ? 'medium' : 'low');
      else this.measureFrom = Infinity; // settled
    }
  }

  /** Snap to the start pose (end of the intro / skip). */
  arrive() {
    const { start } = this.reefData;
    this.player.setPose(start.x, start.z, start.yaw, start.pitch);
    this.player.targetFov = this.player.fov = 72;
    this.measureFrom = 0;
  }
}

export const engine = new Engine();
