import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { getState, setState, storage, useApp, reducedMotion } from '../store';
import { engine } from '../engine/Engine';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

let rewinding = false;
/** HUD "Back to the beach": replay the intro in reverse. */
export function backToBeach() {
  setState({ phase: 'intro', selectedFish: null });
  document.body.classList.remove('locked');
  rewinding = true;
  gsap.to(window, {
    scrollTo: { y: 0 }, duration: reducedMotion() ? 0.6 : 3.5, ease: 'power1.inOut',
    onComplete: () => { rewinding = false; },
  });
}

/** Landing page + scroll-scrubbed dive (250 vh). Drives the 3D camera through store.introProgress. */
export function Intro() {
  const track = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const phase = useApp((s) => s.phase);
  const progress = useApp((s) => s.introProgress);
  const ready = useApp((s) => s.sceneReady);
  const loadProgress = useApp((s) => s.loadProgress);
  const soundUnlocked = useApp((s) => s.soundUnlocked);
  const [returning] = useState(() => storage.get('reef.visited') === '1');

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: track.current, start: 'top top', end: 'bottom bottom', scrub: reducedMotion() ? true : 0.5 },
      });
      tlRef.current = tl;
      // 0–20%: title and hint fade out; avatar crouches
      tl.to('.intro-copy', { opacity: 0, y: -30, duration: 0.15 }, 0)
        .to('#av-body', { y: 14, duration: 0.18 }, 0.02)
        .to('#av-legs', { scaleY: 0.78, transformOrigin: '50% 100%', duration: 0.18 }, 0.02)
        .to('#av-arms', { rotation: -40, transformOrigin: '50% 10%', duration: 0.18 }, 0.02)
        // 20–45%: jump in an arc; the scene follows it down
        .to('#av-legs', { scaleY: 1, duration: 0.04 }, 0.2)
        .to('#av-arms', { rotation: 160, duration: 0.1 }, 0.2)
        .to('#avatar', { keyframes: { x: [0, 140, 300, 420], y: [0, -170, -120, 150], rotation: [0, 40, 110, 165] }, transformOrigin: '50% 50%', duration: 0.25 }, 0.2)
        .to('#world', { y: -260, duration: 0.25, ease: 'power1.in' }, 0.2)
        // 45–55%: splash at the water line, brief white flash
        .to('#avatar', { opacity: 0, duration: 0.02 }, 0.46)
        .fromTo('#splash', { scale: 0.2, opacity: 0, transformOrigin: '50% 100%' }, { scale: 1.2, opacity: 1, duration: 0.04 }, 0.46)
        .to('#splash', { scale: 1.6, opacity: 0, duration: 0.06 }, 0.5)
        .fromTo(flash.current, { opacity: 0 }, { opacity: 0.85, duration: 0.03 }, 0.47)
        .to(flash.current, { opacity: 0, duration: 0.05 }, 0.5)
        // 55–70%: the illustration fades to reveal the live 3D canvas
        .to(svg.current, { opacity: 0, duration: 0.15 }, 0.55)
        .to({}, { duration: 0.3 }, 0.7); // 70–100%: the camera sinks through the surface (Engine)
      tl.eventCallback('onUpdate', () => {
        const p = tl.progress();
        if (getState().phase === 'intro') setState({ introProgress: p });
        if (p >= 0.999 && getState().phase === 'intro' && !rewinding) arrive();
      });
    });
    return () => ctx.revert();
  }, []);

  // Hold on the splash frame if the scene isn't ready yet.
  useEffect(() => {
    if (!ready && progress > 0.55 && svg.current) svg.current.style.visibility = 'visible';
  }, [ready, progress]);

  const arrive = () => {
    storage.set('reef.visited', '1');
    engine.arrive();
    setState({ phase: 'explore', introProgress: 1 });
    document.body.classList.add('locked');
  };

  const skip = () => {
    if (!getState().sceneReady) return;
    window.scrollTo(0, document.documentElement.scrollHeight);
    tlRef.current?.progress(1);
    arrive();
  };

  const diveAgain = () => {
    gsap.to(window, { scrollTo: { y: 'max' }, duration: reducedMotion() ? 0.5 : 4, ease: 'power1.inOut' });
  };

  const turnSoundOn = () => {
    engine.unlockSound();
    setState({ soundOn: true });
    storage.set('reef.muted', '0');
  };

  const holding = !ready && progress >= 0.5;

  return (
    <>
      <div ref={track} style={{ height: '350vh' }} aria-hidden={phase === 'explore'}>
        <div className="sticky top-0 h-screen w-full overflow-hidden" style={{ visibility: phase === 'explore' ? 'hidden' : 'visible' }}>
          <Landing svgRef={svg} />
          <div ref={flash} className="pointer-events-none absolute inset-0 bg-white opacity-0" />
          <div className="intro-copy absolute inset-x-0 top-[16vh] px-6 text-center" style={{ color: '#073447' }}>
            <h1 className="font-display text-5xl font-semibold md:text-7xl">Snorkel the Andaman Sea</h1>
            <p className="mx-auto mt-4 max-w-xl text-lg md:text-xl" style={{ color: '#0d4a60' }}>Float over a coral reef and meet the fish who live there.</p>
            <p className="mt-10 text-sm tracking-widest uppercase" style={{ color: '#0d4a60' }}>
              Scroll to dive <span aria-hidden="true">↓</span>
            </p>
            {!ready && (
              <p className="mt-3 text-xs" style={{ color: '#21627a' }} aria-live="polite">
                Preparing the reef… {Math.round(loadProgress * 100)}%
              </p>
            )}
          </div>
          {progress > 0.45 && progress < 0.98 && !soundUnlocked && (
            <button onClick={turnSoundOn} className="glass focus-ring absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full px-5 py-3 text-sm font-medium text-white">
              🔊 Turn sound on
            </button>
          )}
          {holding && (
            <div className="absolute inset-0 flex items-center justify-center" role="status" aria-label={`Loading ${Math.round(loadProgress * 100)}%`}>
              <ProgressRing value={loadProgress} />
            </div>
          )}
        </div>
      </div>
      {phase === 'intro' && (
        <div className="fixed top-5 right-5 flex gap-2">
          {returning && progress < 0.05 && (
            <button onClick={diveAgain} className="glass focus-ring rounded-full px-4 py-2 text-sm text-white">Dive in again</button>
          )}
          <button onClick={skip} disabled={!ready} className="glass focus-ring rounded-full px-4 py-2 text-sm text-white disabled:opacity-50">
            {returning ? 'Skip' : 'Skip intro'}
          </button>
        </div>
      )}
    </>
  );
}

function ProgressRing({ value }: { value: number }) {
  const C = 2 * Math.PI * 22;
  return (
    <svg width="64" height="64" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="4" />
      <circle cx="28" cy="28" r="22" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - value)} transform="rotate(-90 28 28)" />
    </svg>
  );
}

/** Illustrated landing scene. The avatar has named groups so GSAP can animate its parts. */
function Landing({ svgRef }: { svgRef: React.RefObject<SVGSVGElement | null> }) {
  return (
    <svg ref={svgRef} className="absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A snorkeller standing on a rocky ledge above a calm sea">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd3f4" />
          <stop offset="0.7" stopColor="#d6f1f7" />
          <stop offset="1" stopColor="#fbefd9" />
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3fb2c4" />
          <stop offset="0.35" stopColor="#1d8aa5" />
          <stop offset="1" stopColor="#0b4a63" />
        </linearGradient>
        <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="0.5" stopColor="#ffeeb0" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7d6a58" />
          <stop offset="1" stopColor="#4a3d33" />
        </linearGradient>
      </defs>
      <g id="world">
        <rect x="0" y="-400" width="1600" height="1000" fill="url(#sky)" />
        <circle cx="1180" cy="210" r="150" fill="url(#sun)" />
        <circle cx="1180" cy="210" r="46" fill="#fffaf0" />
        {/* distant island */}
        <path d="M1260 600 Q1330 540 1400 560 Q1470 545 1540 600 Z" fill="#6f9c8e" opacity="0.6" />
        {/* sea */}
        <rect x="0" y="598" width="1600" height="1400" fill="url(#sea)" />
        <g stroke="#e9fbff" strokeOpacity="0.55" strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M620 640 q20 -6 40 0 t40 0" />
          <path d="M900 700 q25 -7 50 0 t50 0" />
          <path d="M1150 660 q20 -6 40 0 t40 0" />
          <path d="M760 780 q30 -8 60 0 t60 0" />
          <path d="M1300 760 q25 -7 50 0 t50 0" />
        </g>
        <rect x="0" y="598" width="1600" height="6" fill="#bff0f5" opacity="0.6" />
        {/* rocky ledge */}
        <path d="M0 560 L180 540 L330 548 L470 556 L520 600 L540 760 L500 1000 L470 1500 L0 1500 Z" fill="url(#rock)" />
        <path d="M0 560 L180 540 L330 548 L470 556 L500 572 L300 575 L0 585 Z" fill="#9c8670" opacity="0.7" />
        {/* splash */}
        <g id="splash" opacity="0" transform="translate(860 600)">
          <ellipse cx="0" cy="0" rx="90" ry="14" fill="#e9fbff" opacity="0.9" />
          {[-60, -35, -12, 10, 32, 58].map((x, i) => (
            <path key={i} d={`M${x} 0 Q${x * 1.4} ${-60 - (i % 3) * 30} ${x * 1.9} ${-20 - (i % 2) * 20}`} stroke="#e9fbff" strokeWidth="7" strokeLinecap="round" fill="none" />
          ))}
          {[-80, -50, 0, 45, 85, 20, -20].map((x, i) => <circle key={i} cx={x} cy={-50 - (i % 4) * 28} r={5 + (i % 3) * 2} fill="#e9fbff" />)}
        </g>
        {/* avatar: mask, snorkel and fins */}
        <g id="avatar" transform="translate(0 0)">
          <g transform="translate(440 400)">
            <g id="av-legs">
              <rect x="-17" y="70" width="14" height="62" rx="7" fill="#e3a77f" />
              <rect x="3" y="70" width="14" height="62" rx="7" fill="#e3a77f" />
              <g id="av-fins" fill="#f2c230">
                <path d="M-24 128 L-2 128 L4 146 L-34 146 Z" />
                <path d="M0 128 L22 128 L34 146 L-4 146 Z" />
              </g>
            </g>
            <g id="av-body">
              <rect x="-22" y="8" width="44" height="70" rx="18" fill="#137c8c" />
              <rect x="-22" y="52" width="44" height="22" rx="6" fill="#0d5866" />
              <g id="av-arms">
                <rect x="-34" y="12" width="12" height="54" rx="6" fill="#e3a77f" />
                <rect x="22" y="12" width="12" height="54" rx="6" fill="#e3a77f" />
              </g>
              <g id="av-head">
                <circle cx="0" cy="-14" r="20" fill="#e3a77f" />
                <path d="M-20 -20 Q0 -44 20 -20 Q12 -30 0 -31 Q-12 -30 -20 -20 Z" fill="#3b2a20" />
                <g id="av-mask">
                  <rect x="-16" y="-24" width="32" height="15" rx="6" fill="#9fe3f2" stroke="#0e3d4a" strokeWidth="3" />
                  <rect x="-20" y="-20" width="40" height="4" fill="#0e3d4a" />
                </g>
                <path id="av-snorkel" d="M18 -40 L18 -4 Q18 4 10 4 L6 4" stroke="#f26b3a" strokeWidth="5" fill="none" strokeLinecap="round" />
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
