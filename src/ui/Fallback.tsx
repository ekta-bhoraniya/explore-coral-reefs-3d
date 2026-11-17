export function Fallback({ reason }: { reason: 'mobile' | 'webgl' | 'error' }) {
  const text = {
    mobile: ['Best experienced on a desktop', 'This reef is a live 3D scene built for a keyboard and mouse. Open it on a laptop or desktop browser to swim around.'],
    webgl: ['Your browser can’t show this reef', 'It needs WebGL 2, which is available in the latest Chrome, Edge, Firefox and Safari 17+. Try updating your browser.'],
    error: ['Something went wrong', 'The reef failed to load. Please refresh the page to try again.'],
  }[reason];
  return (
    <main className="interactive fixed inset-0 flex items-center justify-center p-6" style={{ background: 'radial-gradient(ellipse at 50% 0%, #6fd0e8 0%, #1d6a86 45%, #0b2f3d 100%)' }}>
      <div className="glass max-w-md rounded-[20px] p-8 text-center">
        <img src={`${import.meta.env.BASE_URL}still.webp`} alt="A still of the coral reef" className="mb-6 w-full rounded-xl" onError={(e) => (e.currentTarget.style.display = 'none')} />
        <h1 className="font-display mb-3 text-3xl">{text[0]}</h1>
        <p className="text-white/80">{text[1]}</p>
      </div>
    </main>
  );
}
