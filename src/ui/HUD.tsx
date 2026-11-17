import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { setState, storage, useApp } from '../store';
import { engine } from '../engine/Engine';
import { backToBeach } from './Intro';

/** Sound + mask toggles, wordmark, credits link; fades to 40% after 3 s without mouse movement. */
export function HUD() {
  const soundOn = useApp((s) => s.soundOn);
  const unlocked = useApp((s) => s.soundUnlocked);
  const maskOn = useApp((s) => s.maskOn);
  const hint = useApp((s) => s.hint);
  const [idle, setIdle] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    let t = setTimeout(() => setIdle(true), 3000);
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 3000);
    };
    addEventListener('pointermove', wake);
    addEventListener('keydown', wake);
    const h = setTimeout(() => setHintVisible(false), 15000);
    return () => { clearTimeout(t); clearTimeout(h); removeEventListener('pointermove', wake); removeEventListener('keydown', wake); };
  }, []);
  const showHint = hintVisible && !(hint.swam && hint.looked && hint.clicked);

  const toggleSound = () => {
    engine.unlockSound();
    const on = !(soundOn && unlocked);
    setState({ soundOn: on });
    storage.set('reef.muted', on ? '0' : '1');
  };
  const toggleMask = () => {
    setState({ maskOn: !maskOn });
    storage.set('reef.mask', maskOn ? '0' : '1');
  };
  const btn = 'glass focus-ring flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm text-white transition-opacity';

  return (
    <div className="fixed inset-0" style={{ opacity: idle ? 0.4 : 1, transition: 'opacity 600ms' }}>
      <div className="font-display interactive absolute top-5 left-5 text-lg tracking-wide text-white/90 select-none">Reef Snorkel</div>
      <button className={`${btn} absolute top-5 right-5`} onClick={backToBeach}>Back to the beach</button>
      <div className="absolute bottom-5 left-5 flex gap-2">
        <button className={btn} onClick={toggleSound} aria-pressed={soundOn && unlocked} aria-label={soundOn && unlocked ? 'Mute sound' : 'Turn sound on'}>
          {soundOn && unlocked ? '🔊' : '🔇'}
        </button>
        <button className={btn} onClick={toggleMask} aria-pressed={maskOn}>{maskOn ? 'Mask on' : 'Mask off'}</button>
      </div>
      <a className={`${btn} absolute right-5 bottom-5`} href="#credits">Credits</a>
      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
            className="glass absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full px-5 py-2 text-sm whitespace-nowrap text-white/90"
          >
            <span className={hint.swam ? 'opacity-40' : ''}>W A S D to swim</span> · <span className={hint.looked ? 'opacity-40' : ''}>Drag to look</span> · <span className={hint.clicked ? 'opacity-40' : ''}>Click a fish</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
