import { Howl, Howler } from 'howler';

const src = (n: string) => [`${import.meta.env.BASE_URL}audio/${n}.ogg`, `${import.meta.env.BASE_URL}audio/${n}.mp3`];

/** Ambience, breathing, water rush that follows swim speed, and one-shots. Starts only after a click. */
export class Sound {
  private ambience?: Howl;
  private breath?: Howl;
  private rush?: Howl;
  private fx: Record<string, Howl> = {};
  private unlocked = false;
  private muted = false;
  private rushVol = 0;
  private underwater = false;

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.ambience = new Howl({ src: src('ambience'), loop: true, volume: 0 });
    this.breath = new Howl({ src: src('breath'), loop: true, volume: 0 });
    // breathing rate randomised ±3% per cycle
    this.breath.on('end', () => this.breath?.rate(0.97 + Math.random() * 0.06));
    this.rush = new Howl({ src: src('rush'), loop: true, volume: 0 });
    for (const n of ['bubble1', 'bubble2', 'bubble3', 'bubble4', 'kick', 'splash', 'tick', 'chime']) this.fx[n] = new Howl({ src: src(n), volume: 0.5 });
    this.ambience.play();
    this.breath.play();
    this.rush.play();
    this.setUnderwater(this.underwater);
    Howler.mute(this.muted);
    document.addEventListener('visibilitychange', () => {
      Howler.mute(this.muted || document.hidden);
    });
  }

  setMuted(m: boolean) {
    this.muted = m;
    Howler.mute(m || document.hidden);
  }

  setUnderwater(u: boolean) {
    this.underwater = u;
    if (!this.unlocked) return;
    this.ambience?.fade(this.ambience.volume(), u ? 0.5 : 0.12, 600);
    this.breath?.fade(this.breath.volume(), u ? 0.25 : 0, 600);
  }

  play(name: 'bubble' | 'kick' | 'splash' | 'tick' | 'chime', vol = 1) {
    if (!this.unlocked) return;
    const key = name === 'bubble' ? `bubble${1 + Math.floor(Math.random() * 4)}` : name;
    const h = this.fx[key];
    if (!h) return;
    const base = { bubble: 0.35, kick: 0.4, splash: 0.7, tick: 0.12, chime: 0.3 }[name];
    const id = h.play();
    h.volume(base * vol, id);
    if (name === 'bubble') h.rate(0.9 + Math.random() * 0.25, id);
  }

  /** water rush volume follows swim speed: 0 at rest, 0.3 at max speed */
  update(speedRatio: number) {
    if (!this.rush) return;
    const target = this.underwater ? Math.min(1, speedRatio) * 0.3 : 0;
    this.rushVol += (target - this.rushVol) * 0.08;
    this.rush.volume(this.rushVol);
  }
}
