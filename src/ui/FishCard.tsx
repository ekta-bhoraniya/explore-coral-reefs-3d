import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { setState, useApp } from '../store';
import type { Species } from '../data/schemas';

/** Right-side frosted info card. Same layout as PRD A, Step 7. */
export function FishCard() {
  const sel = useApp((s) => s.selectedFish);
  const species = useApp((s) => s.species);
  const sp = sel ? species.find((s) => s.id === sel.speciesId) : undefined;
  return <AnimatePresence>{sp && <Card key={sel!.instanceId} sp={sp} />}</AnimatePresence>;
}

const close = () => setState({ selectedFish: null });

function Card({ sp }: { sp: Species }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [photo, setPhoto] = useState(0);
  const photos = sp.photos.length ? sp.photos : [0, 1, 2].map((i) => ({ src: '', alt: `Photo ${i + 1} of the ${sp.commonName} coming soon`, credit: '', licence: '', url: '' }));

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      // arrow keys move the carousel instead of swimming
      if (e.key === 'ArrowRight') setPhoto((p) => (p + 1) % photos.length);
      if (e.key === 'ArrowLeft') setPhoto((p) => (p - 1 + photos.length) % photos.length);
      if (e.key === 'Tab' && ref.current) {
        // focus trap
        const f = [...ref.current.querySelectorAll<HTMLElement>('button, a[href]')];
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    addEventListener('keydown', onKey, true);
    return () => {
      removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [photos.length]);

  const ph = photos[photo];
  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fish-name"
      initial={{ x: 440, opacity: 0 }}
      animate={{ x: 0, opacity: 1, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
      exit={{ x: 440, opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } }}
      className="glass fixed top-3 right-3 bottom-3 z-20 flex w-[400px] max-w-[calc(100vw-24px)] flex-col overflow-y-auto rounded-[20px] text-white shadow-2xl"
    >
      <button ref={closeBtn} onClick={close} aria-label="Close" className="focus-ring absolute top-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-xl hover:bg-black/50">×</button>
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-t-[20px] bg-[#0d4a60]">
        {ph.src ? (
          <img src={`${import.meta.env.BASE_URL}${ph.src}`} alt={ph.alt} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-white/70" style={{ background: `linear-gradient(135deg, #1d6a86, #0b3a4a ${40 + photo * 20}%, #145e74)` }}>
            {ph.alt}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/50 to-transparent px-3 pt-8 pb-2 text-[11px] text-white/80">
          <span>{ph.credit ? <>Photo: <a href={ph.url} target="_blank" rel="noreferrer" className="underline">{ph.credit}</a>, {ph.licence}</> : 'Licensed photos to be added'}</span>
          <span className="flex gap-1">
            {photos.map((_, i) => (
              <button key={i} onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`} aria-current={i === photo} className={`focus-ring h-2 w-2 rounded-full ${i === photo ? 'bg-white' : 'bg-white/40'}`} />
            ))}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-4 p-6">
        <div>
          {import.meta.env.DEV && sp.factStatus === 'draft' && (
            <span className="mb-2 inline-block rounded-full bg-amber-400/90 px-2 py-0.5 text-[11px] font-semibold text-black">Draft facts</span>
          )}
          <h2 id="fish-name" className="font-display text-[28px] leading-tight">{sp.commonName}</h2>
          <p className="text-white/70 italic">{sp.scientificName}</p>
        </div>
        <p className="leading-relaxed text-white/90">{sp.description}</p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Fact label="Length" value={sp.facts.length} />
          {sp.facts.weight && <Fact label="Weight" value={sp.facts.weight} />}
          <Fact label="Depth" value={sp.facts.depth} />
          <Fact label="Where it hides" value={sp.facts.hides} wide />
        </dl>
        <p className="text-xs text-white/60">
          Facts: <a href={sp.source.url} target="_blank" rel="noreferrer" className="focus-ring underline">{sp.source.label}</a>
        </p>
      </div>
    </motion.div>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-xl bg-white/8 p-3 ${wide ? 'col-span-2' : ''}`} style={{ background: 'rgba(255,255,255,0.07)' }}>
      <dt className="text-[11px] tracking-wide text-white/60 uppercase">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
