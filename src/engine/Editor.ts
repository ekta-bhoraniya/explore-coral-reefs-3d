import * as THREE from 'three';
import GUI from 'lil-gui';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { Engine } from './Engine';
import type { Placement } from '../data/schemas';
import { setState } from '../store';

/**
 * ?editor=1 (dev only): fly camera, asset palette, click terrain to place,
 * TransformControls to move / rotate / scale, seed + colour, scatter brush, Export → reef.json.
 */
export function mountEditor(engine: Engine) {
  setState({ phase: 'explore' });
  engine.editorActive = true;
  const placements: Placement[] = structuredClone(engine.reefData.placements);
  const cam = engine.camera;
  cam.position.set(0, 6, 18);
  cam.rotation.set(-0.5, 0, 0, 'YXZ');
  const keys = engine.input.keys;
  let yaw = 0, pitch = -0.5;

  const state = {
    asset: 'gen:branching',
    mode: 'place' as 'place' | 'select' | 'scatter',
    seed: 1,
    color: '#e9dcc0',
    scale: 1,
    scatterRadius: 2,
    selected: -1,
    export: () => {
      const data = { ...engine.reefData, placements };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1) + '\n'], { type: 'application/json' }));
      a.download = 'reef.json';
      a.click();
    },
    delete: () => {
      if (state.selected < 0) return;
      placements.splice(state.selected, 1);
      select(-1);
      rebuild();
    },
  };
  const assets = ['gen:branching', 'gen:brain', 'gen:table', 'gen:soft', 'gen:fan', 'gen:anemone', 'gen:rock', 'coral02.glb'];
  const gui = new GUI({ title: 'Reef editor' });
  gui.add(state, 'mode', ['place', 'select', 'scatter']);
  gui.add(state, 'asset', assets);
  gui.add(state, 'seed', 1, 999999, 1);
  gui.addColor(state, 'color');
  gui.add(state, 'scale', 0.2, 3, 0.05);
  gui.add(state, 'scatterRadius', 0.5, 6, 0.1);
  gui.add(state, 'delete').name('Delete selected');
  gui.add(state, 'export').name('Export reef.json');

  const proxy = new THREE.Object3D();
  engine.scene.add(proxy);
  const tc = new TransformControls(cam, engine.renderer.domElement);
  engine.scene.add(tc.getHelper());
  tc.addEventListener('dragging-changed', (e) => {
    if (!e.value && state.selected >= 0) {
      const p = placements[state.selected];
      p.x = +proxy.position.x.toFixed(2);
      p.z = +proxy.position.z.toFixed(2);
      p.rotY = +proxy.rotation.y.toFixed(3);
      p.scale = +proxy.scale.x.toFixed(2);
      rebuild();
    }
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'g') tc.setMode('translate');
    if (e.key === 'r') tc.setMode('rotate');
    if (e.key === 'y') tc.setMode('scale');
  });

  const rebuild = async () => {
    await engine.reef.preload(placements);
    engine.reef.build(placements);
  };
  const select = (i: number) => {
    state.selected = i;
    if (i < 0) { tc.detach(); return; }
    const p = placements[i];
    proxy.position.set(p.x, engine.terrain.heightAt(p.x, p.z), p.z);
    proxy.rotation.set(0, p.rotY, 0);
    proxy.scale.setScalar(p.scale);
    tc.attach(proxy);
  };

  const ray = new THREE.Raycaster();
  const el = engine.renderer.domElement;
  el.addEventListener('click', (e) => {
    if (engine.input.wasDrag || (tc as unknown as { dragging: boolean }).dragging) return;
    const r = el.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
    const hit = ray.intersectObject(engine.terrain.mesh)[0];
    if (!hit) return;
    const { x, z } = hit.point;
    if (state.mode === 'select') {
      let best = -1, bd = 1.2;
      placements.forEach((p, i) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = i; } });
      select(best);
      return;
    }
    const add = (px: number, pz: number, scale: number) => placements.push({
      asset: state.asset, x: +px.toFixed(2), z: +pz.toFixed(2), rotY: +(Math.random() * 6.283).toFixed(3), scale: +scale.toFixed(2),
      seed: state.mode === 'scatter' ? Math.floor(Math.random() * 1e6) : state.seed, color: state.color,
    });
    if (state.mode === 'place') add(x, z, state.scale);
    else {
      const n = 5 + Math.floor(Math.random() * 16);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * state.scatterRadius;
        add(x + Math.cos(a) * d, z + Math.sin(a) * d, state.scale * (0.4 + Math.random() * 0.5));
      }
    }
    rebuild();
  });

  // Fly camera: WASD + Q/E, drag to look.
  engine.onFrame.push((dt) => {
    const d = engine.input.consumeDrag();
    if (!(tc as unknown as { dragging: boolean }).dragging) {
      yaw -= d.x * 0.004;
      pitch = THREE.MathUtils.clamp(pitch - d.y * 0.004, -1.5, 1.5);
    }
    cam.rotation.set(pitch, yaw, 0, 'YXZ');
    const sp = (keys.has('ShiftLeft') ? 12 : 4) * dt;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const rgt = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    if (keys.has('KeyW')) cam.position.addScaledVector(f, sp);
    if (keys.has('KeyS')) cam.position.addScaledVector(f, -sp);
    if (keys.has('KeyA')) cam.position.addScaledVector(rgt, -sp);
    if (keys.has('KeyD')) cam.position.addScaledVector(rgt, sp);
    if (keys.has('KeyE')) cam.position.y += sp;
    if (keys.has('KeyQ')) cam.position.y -= sp;
  });
}
