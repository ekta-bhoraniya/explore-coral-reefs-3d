import { useEffect, useState } from 'react';
import { loadCredits } from '../data/load';
import { CREDIT_CATEGORIES, type Credit } from '../data/schemas';

/** #credits: generated from credits.json, grouped by category. */
export function Credits() {
  const [credits, setCredits] = useState<Credit[] | null>(null);
  useEffect(() => { loadCredits().then(setCredits).catch(() => setCredits([])); }, []);
  const closeHref = location.pathname + location.search;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="credits-title" className="fixed inset-0 z-30 overflow-y-auto bg-[#06202b]/85 backdrop-blur-md">
      <div className="mx-auto max-w-3xl px-6 py-16 text-white">
        <a href={closeHref} onClick={(e) => { e.preventDefault(); history.pushState('', '', closeHref); dispatchEvent(new HashChangeEvent('hashchange')); }} className="glass focus-ring fixed top-5 right-5 rounded-full px-4 py-2 text-sm">Close</a>
        <h1 id="credits-title" className="font-display mb-2 text-4xl">Credits</h1>
        <p className="mb-10 text-white/70">Every model, texture, photo, fact source, sound and code library used in this reef, with its licence.</p>
        {credits === null && <p>Loading…</p>}
        {credits && CREDIT_CATEGORIES.map((cat) => {
          const list = credits.filter((c) => c.category === cat);
          return (
            <section key={cat} className="mb-10">
              <h2 className="font-display mb-3 text-2xl">{cat}</h2>
              {list.length === 0 ? <p className="text-sm text-white/60">None yet.</p> : (
                <ul className="divide-y divide-white/10 text-sm">
                  {list.map((c, i) => (
                    <li key={i} className="py-3">
                      <div className="font-medium">{c.url && c.url !== '#' ? <a href={c.url} target="_blank" rel="noreferrer" className="underline">{c.title}</a> : c.title}</div>
                      <div className="text-white/70">{c.author} · {c.licence}</div>
                      {c.notes && <div className="text-white/50">{c.notes}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
