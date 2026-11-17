import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { App } from './ui/App';
import { Fallback } from './ui/Fallback';
import { engine } from './engine/Engine';

const canvas = document.getElementById('reef-canvas') as HTMLCanvasElement;
const hasWebGL2 = (() => {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
})();
const isMobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
const root = createRoot(document.getElementById('root')!);

if (!hasWebGL2 || (isMobile && !location.hash.includes('credits'))) {
  canvas.remove();
  root.render(<Fallback reason={hasWebGL2 ? 'mobile' : 'webgl'} />);
} else {
  root.render(<StrictMode><App /></StrictMode>);
  // Start loading the 3D scene as soon as the landing page renders.
  engine.init(canvas).catch((e) => {
    console.error(e);
    root.render(<Fallback reason="error" />);
  });
}
