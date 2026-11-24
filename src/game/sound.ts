class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playClick() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.045);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playSlash(heavy = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const duration = heavy ? 0.22 : 0.13;

    // Noise burst for air whoosh
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(heavy ? 520 : 1200, now);
    filter.frequency.exponentialRampToValueAtTime(heavy ? 180 : 420, now + duration);
    filter.Q.value = 1.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(heavy ? 0.16 : 0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now);
  }

  public playHit(heavy = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = heavy ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(heavy ? 210 : 320, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + (heavy ? 0.22 : 0.12));
    gain.gain.setValueAtTime(heavy ? 0.18 : 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.23 : 0.13));
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (heavy ? 0.24 : 0.14));
  }

  public playBlock(parry = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const freqs = parry ? [920, 1380, 1840] : [480, 720];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = parry ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.02);
      osc.frequency.exponentialRampToValueAtTime(
        f * (parry ? 1.15 : 0.85),
        now + 0.22,
      );
      gain.gain.setValueAtTime(parry ? 0.11 : 0.08, now + idx * 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.02);
      osc.stop(now + 0.26);
    });
  }

  public playLaser(heavy = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(heavy ? 1100 : 1450, now);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 140 : 240, now + 0.16);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, now);

    gain.gain.setValueAtTime(heavy ? 0.14 : 0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playDash() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const duration = 0.18;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(340, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now);
  }

  public playSpecial() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [220, 330, 440, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.04);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.9, now + 0.42);
      gain.gain.setValueAtTime(0.08, now + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.04);
      osc.stop(now + 0.46);
    });
  }

  public playThunderCharge() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Electric surge + high-voltage crackle
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.34);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.38);

    const dur = 0.24;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.09, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(hp).connect(nGain).connect(ctx.destination);
    noise.start(now);
  }

  public playThunderStrike() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Deep thunderclap sub-boom
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(160, now);
    sub.frequency.exponentialRampToValueAtTime(34, now + 0.48);
    subGain.gain.setValueAtTime(0.24, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
    sub.connect(subGain).connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.54);

    // Crackling lightning discharge tail
    const dur = 0.42;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.pow(1 - i / data.length, 1.3);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, now);
    bp.frequency.exponentialRampToValueAtTime(280, now + dur);
    bp.Q.value = 0.9;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.2, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(bp).connect(nGain).connect(ctx.destination);
    noise.start(now);
  }

  public playJump() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.14);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playLand() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.11);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playOutcome(win: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = win ? [440, 554.37, 659.25, 880] : [330, 293.66, 246.94, 196];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.11);
      gain.gain.setValueAtTime(0.11, now + i * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.11 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.11);
      osc.stop(now + i * 0.11 + 0.36);
    });
  }

  public playDodgeSlowMo() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Deep time-dilation sub drop
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(240, now);
    sub.frequency.exponentialRampToValueAtTime(44, now + 0.45);
    subGain.gain.setValueAtTime(0.22, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    sub.connect(subGain).connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.5);

    // Shimmering counterattack chime
    [660, 990, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.03);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.12, now + 0.34);
      gain.gain.setValueAtTime(0.075, now + i * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.03);
      osc.stop(now + 0.38);
    });
  }

  public playDodgeFail() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(88, now + 0.09);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playExplosion() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Deep sub-bass core detonation drop
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(125, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 0.85);
    subGain.gain.setValueAtTime(0.36, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    sub.connect(subGain).connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.92);

    // Roaring low-pass blast noise
    const bufSize = Math.floor(ctx.sampleRate * 0.95);
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const env = Math.pow(1 - i / bufSize, 1.35);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(130, now + 0.9);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.34, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    noise.connect(filter).connect(noiseGain).connect(ctx.destination);
    noise.start(now);

    // Sharp metallic hull rupture snap
    const crack = ctx.createOscillator();
    const crackGain = ctx.createGain();
    crack.type = 'sawtooth';
    crack.frequency.setValueAtTime(340, now);
    crack.frequency.exponentialRampToValueAtTime(52, now + 0.24);
    crackGain.gain.setValueAtTime(0.22, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    crack.connect(crackGain).connect(ctx.destination);
    crack.start(now);
    crack.stop(now + 0.28);
  }
}

export const soundEngine = new SoundEngine();
