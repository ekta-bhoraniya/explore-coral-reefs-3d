import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { Intro } from './Intro';
import { HUD } from './HUD';
import { FishCard } from './FishCard';
import { Credits } from './Credits';

export function App() {
  const [route, setRoute] = useState(location.hash);
  useEffect(() => {
    const on = () => setRoute(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const phase = useApp((s) => s.phase);
  const announcement = useApp((s) => s.announcement);

  return (
    <>
      <Intro />
      {phase === 'explore' && <HUD />}
      <FishCard />
      {route === '#credits' && <Credits />}
      <div className="sr-only" aria-live="polite" role="status">{announcement}</div>
    </>
  );
}
