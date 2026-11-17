import GUI from 'lil-gui';
import type { Engine } from './Engine';

/** ?debug=1: every tunable value + FPS / draw calls / triangles. "Save" writes tuning.json. */
export function mountDebug(engine: Engine) {
  const gui = new GUI({ title: 'Reef tuning' });
  const t = engine.tuning as unknown as Record<string, Record<string, unknown> | number>;
  const apply = () => engine.applyTuning();
  gui.add(engine.tuning, 'exposure', 0.3, 2.5, 0.01).onChange(apply);
  for (const [group, values] of Object.entries(t)) {
    if (typeof values !== 'object') continue;
    const f = gui.addFolder(group);
    f.close();
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === 'string' && v.startsWith('#')) f.addColor(values, k).onChange(apply);
      else if (typeof v === 'number') {
        const max = Math.max(1, Math.abs(v) * 4);
        f.add(values, k, v < 0 ? -max : 0, max, max / 400).onChange(apply);
      }
    }
  }
  const actions = {
    save: async () => {
      const body = JSON.stringify(engine.tuning, null, 1);
      try {
        const r = await fetch('/__save-tuning', { method: 'POST', body });
        if (!r.ok) throw new Error(await r.text());
        alert('Saved to public/data/tuning.json');
      } catch {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
        a.download = 'tuning.json';
        a.click();
      }
    },
    quality: engine.renderer.getPixelRatio() > 1.5 ? 'high' : 'medium',
  };
  gui.add(actions, 'save').name('Save tuning.json');
  gui.add(actions, 'quality', ['high', 'medium', 'low']).onChange((q: 'high' | 'medium' | 'low') => engine.applyTier(q));

  const stats = document.createElement('div');
  stats.style.cssText = 'position:fixed;left:8px;top:56px;z-index:60;font:11px/1.4 ui-monospace,monospace;color:#bff6ff;background:rgba(0,20,30,.7);padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre';
  document.body.appendChild(stats);
  let frames = 0, last = performance.now();
  engine.renderer.info.autoReset = false;
  engine.onFrame.push(() => {
    frames++;
    const now = performance.now();
    if (now - last > 500) {
      const info = engine.renderer.info.render;
      stats.textContent = `${Math.round((frames * 1000) / (now - last))} fps\n${info.calls} draw calls\n${(info.triangles / 1000).toFixed(0)}k triangles`;
      frames = 0;
      last = now;
    }
    engine.renderer.info.reset();
  });
}
