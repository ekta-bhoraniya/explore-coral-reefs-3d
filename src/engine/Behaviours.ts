import * as THREE from 'three';
import type { Fish, FishContext, Intent } from './Fish';
import type { Obstacle } from './Reef';

/** One function per behaviour.type in species.json. Each returns what the fish wants this frame. */
type Behaviour = (f: Fish, ctx: FishContext) => Intent;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function home(f: Fish, ctx: FishContext): Obstacle {
  const id = f.species.behaviour.home;
  const ob = id ? ctx.reef.byId.get(id) : undefined;
  if (ob) return ob;
  const s = f.species.behaviour.spawn ?? { x: 0, z: 0 };
  const y = ctx.terrain.heightAt(s.x, s.z);
  return { x: s.x, z: s.z, y: y + 0.2, r: 0.3, top: y + 0.4 };
}

function spawnPoint(f: Fish) {
  const s = f.species.behaviour.spawn ?? { x: 0, z: 0 };
  return v3(s.x, 0, s.z);
}

function st<T>(f: Fish, key: string, init: () => T): T {
  if (!(key in f.state)) f.state[key] = init();
  return f.state[key] as T;
}

export const behaviours: Record<string, Behaviour> = {
  /** Clownfish: within 0.6 m of its anemone, short darts, hides in the tentacles when the player is close. */
  anemone(f, ctx) {
    const h = home(f, ctx);
    const anchor = v3(h.x, h.top + 0.02, h.z);
    const s = st(f, 'a', () => ({ target: anchor.clone(), timer: 0, dart: false }));
    s.timer -= ctx.dt;
    const near = ctx.player.distanceTo(anchor) < f.species.behaviour.shyDistance;
    if (near) return { target: anchor.clone().add(v3(0, -0.06, 0)), speed: f.species.behaviour.maxSpeed, handlesShy: true, minClear: 0.08, ignore: h, wiggle: 1.4 };
    if (s.timer <= 0 || f.pos.distanceTo(s.target) < 0.05) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.55;
      s.target = anchor.clone().add(v3(Math.cos(a) * r, rand(0.04, 0.32), Math.sin(a) * r));
      s.dart = Math.random() < 0.25;
      s.timer = rand(0.8, 2.2);
    }
    return { target: s.target, speed: s.dart ? f.species.behaviour.maxSpeed : f.species.behaviour.speed, handlesShy: true, minClear: 0.08, ignore: h };
  },

  /** Emperor angelfish: slow loops around a coral head, pausing to peck. */
  circleCoral(f, ctx) {
    const h = home(f, ctx);
    const b = f.species.behaviour;
    const R = Math.max(b.radius ?? 1.2, h.r + 0.6);
    const s = st(f, 'c', () => ({ angle: Math.random() * 6.28, peck: 0, nextPeck: rand(6, 12), dir: Math.random() < 0.5 ? 1 : -1 }));
    s.nextPeck -= ctx.dt;
    if (s.peck > 0) {
      s.peck -= ctx.dt;
      const toward = v3(h.x - f.pos.x, 0, h.z - f.pos.z).normalize();
      return { target: v3(h.x, 0, h.z).addScaledVector(toward, -(h.r + 0.32)).setY(Math.max(h.top - 0.1, f.pos.y - 0.05)), speed: b.speed * 0.4, pitch: -0.25, wiggle: 0.4 };
    }
    if (s.nextPeck <= 0) { s.peck = rand(1.2, 2.2); s.nextPeck = rand(8, 15); }
    s.angle += (s.dir * b.speed * ctx.dt) / R;
    const y = Math.min(-0.6, h.top + 0.25 + 0.1 * Math.sin(ctx.time * 0.5 + f.index));
    return { target: v3(h.x + Math.cos(s.angle) * R, y, h.z + Math.sin(s.angle) * R), speed: b.speed };
  },

  /** Sea turtle: slow route with gentle up-down and body roll; every few minutes rests on the sand. */
  glide(f, ctx) {
    const b = f.species.behaviour;
    const c = spawnPoint(f);
    const R = b.radius ?? 10;
    const s = st(f, 'g', () => ({ angle: Math.random() * 6.28, rest: 0, nextRest: rand(70, 160), restAt: v3() }));
    s.nextRest -= ctx.dt;
    const roll = THREE.MathUtils.degToRad(4) * Math.sin(ctx.time * 0.9 + f.index);
    if (s.rest > 0) {
      s.rest -= ctx.dt;
      return { target: s.restAt.clone().setY(ctx.terrain.heightAt(s.restAt.x, s.restAt.z) + 0.12), speed: 0.12, minClear: 0.1, roll: roll * 0.2, wiggle: 0.2 };
    }
    if (s.nextRest <= 0) {
      s.rest = rand(10, 20);
      s.nextRest = rand(120, 220);
      s.restAt = f.pos.clone().add(v3(rand(-1, 1), 0, rand(-1, 1)));
    }
    s.angle += (b.speed * ctx.dt) / R;
    const wob = 1 + 0.25 * Math.sin(s.angle * 3);
    const x = c.x + Math.cos(s.angle) * R * wob, z = c.z + Math.sin(s.angle) * R * 0.8 * wob;
    const ground = ctx.terrain.heightAt(x, z);
    const y = THREE.MathUtils.clamp(ground + 1.0 + 0.35 * Math.sin(ctx.time * 0.25 + f.index), ground + 0.5, -0.7);
    return { target: v3(x, y, z), speed: b.speed, roll, minClear: 0.4 };
  },

  /** Napoleon wrasse: large slow loop along the reef edge, ignoring the player until very close. */
  patrol(f, ctx) {
    const b = f.species.behaviour;
    const R = b.radius ?? 18;
    const s = st(f, 'p', () => ({ angle: Math.random() * 6.28 }));
    s.angle += (b.speed * ctx.dt) / R;
    const x = 4 + Math.cos(s.angle) * R, z = -2 + Math.sin(s.angle) * R * 0.85;
    const ground = ctx.terrain.heightAt(x, z);
    return { target: v3(x, THREE.MathUtils.clamp(ground + 1.1, -3.6, -1.0), z), speed: b.speed, minClear: 0.5 };
  },

  /** Orange-dotted tuskfish: stop-and-go hops over sand, nose tilted down while stopped. */
  forage(f, ctx) {
    const b = f.species.behaviour;
    const c = spawnPoint(f);
    const s = st(f, 'f', () => ({ target: f.pos.clone(), stop: 0 }));
    if (s.stop > 0) {
      s.stop -= ctx.dt;
      return { target: f.pos, speed: 0, hold: true, pitch: -THREE.MathUtils.degToRad(20), minClear: 0.14, wiggle: 0.3 };
    }
    if (f.pos.distanceTo(s.target) < 0.15) {
      s.stop = rand(1, 3);
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * 6.28, r = Math.random() * (b.radius ?? 4);
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (ctx.reef.near(x, z).some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.4)) continue;
        s.target = v3(x, ctx.terrain.heightAt(x, z) + 0.18, z);
        break;
      }
    }
    return { target: s.target, speed: b.speed, minClear: 0.14 };
  },

  /** Octopus: stays in its crevice, arms sway, pulls in when the player is near. */
  den(f, ctx) {
    const h = home(f, ctx);
    const near = ctx.player.distanceTo(f.pos) < f.species.behaviour.shyDistance;
    const spot = v3(h.x + h.r * 0.35, h.top + 0.02, h.z);
    return { target: spot, speed: 0.05, handlesShy: true, minClear: 0.05, ignore: h, swell: near ? -0.15 : 0, wiggle: near ? 0.3 : 1, hold: f.pos.distanceTo(spot) < 0.05 };
  },

  /** Whitetip reef shark: rests on sand with slow body flex; sometimes cruises a long loop and returns. */
  rest(f, ctx) {
    const b = f.species.behaviour;
    const c = spawnPoint(f);
    const R = b.radius ?? 10;
    const s = st(f, 'r', () => ({ resting: rand(20, 50), cruise: 0, angle: 0 }));
    if (s.resting > 0) {
      s.resting -= ctx.dt;
      if (s.resting <= 0) { s.cruise = rand(50, 80); s.angle = Math.atan2(f.pos.z - c.z, f.pos.x - c.x); }
      const y = ctx.terrain.heightAt(c.x, c.z) + 0.14;
      return { target: c.clone().setY(y), speed: 0.25, minClear: 0.12, wiggle: 0.35 };
    }
    s.cruise -= ctx.dt;
    if (s.cruise <= 0) {
      s.resting = rand(40, 90);
    }
    s.angle += (b.speed * ctx.dt) / R;
    const x = c.x + Math.cos(s.angle) * R - R, z = c.z + Math.sin(s.angle) * R * 0.7;
    const ground = ctx.terrain.heightAt(x, z);
    return { target: v3(x, THREE.MathUtils.clamp(ground + 0.9, -4, -1.1), z), speed: b.speed, minClear: 0.4 };
  },

  /** Powder blue tang: a group of 3–6 moving together over coral tops, stopping to graze. */
  graze(f, ctx) {
    const b = f.species.behaviour;
    const key = f.species.id;
    let g = ctx.groups.get(key);
    if (!g) {
      const c = spawnPoint(f);
      g = { target: v3(c.x, -1.2, c.z), timer: 0, grazing: false, anchor: c };
      ctx.groups.set(key, g);
    }
    // the group's first fish advances the shared state once per frame
    if (f.index === 0) {
      g.timer -= ctx.dt;
      if (g.timer <= 0) {
        g.grazing = !g.grazing;
        g.timer = g.grazing ? rand(2, 4) : rand(4, 8);
        if (!g.grazing) {
          const tops = ctx.reef.near(g.anchor.x + rand(-(b.radius ?? 6), b.radius ?? 6), g.anchor.z + rand(-(b.radius ?? 6), b.radius ?? 6));
          const t = tops[Math.floor(Math.random() * tops.length)];
          if (t) g.target.set(t.x, Math.min(-0.6, t.top + 0.3), t.z);
        }
      }
    }
    const off = st(f, 'off', () => v3(rand(-0.5, 0.5), rand(-0.15, 0.15), rand(-0.5, 0.5)));
    const tgt = g.target.clone().add(off);
    if (g.grazing) return { target: tgt.add(v3(0, -0.12, 0)), speed: b.speed * 0.35, pitch: -0.3, wiggle: 0.5 };
    return { target: tgt, speed: b.speed };
  },
};
