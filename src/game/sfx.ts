// Zero-asset, more "physical" SFX using Web Audio synthesis.
//
// Design notes:
//   • Card sounds are short filtered-noise bursts (paper friction + snap), not synth blips.
//   • Bid placement is a wood/chip knock (filtered low-frequency thump).
//   • Reveal & round-made are layered tonal swells with detune for body.
//   • All sounds are < 350ms unless explicitly fanfares.

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

function ensureCtx(): { ctx: AudioContext; master: GainNode } | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.85;
      masterGain.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  return { ctx: ctx!, master: masterGain! };
}

function getNoiseBuf(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  // 1 second of pink-ish noise (white noise softened in the highs).
  const len = c.sampleRate;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  // simple Voss-McCartney-ish pink noise
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  noiseBuf = buf;
  return buf;
}

function noiseBurst(c: AudioContext, master: GainNode, opts: {
  duration: number;
  filterType?: BiquadFilterType;
  freq: number;
  q?: number;
  gain?: number;
  attack?: number;
  delay?: number;
  pan?: number;
  sweepTo?: number;
}) {
  const t = c.currentTime + (opts.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = getNoiseBuf(c);
  src.playbackRate.value = 1;
  const filter = c.createBiquadFilter();
  filter.type = opts.filterType ?? "bandpass";
  filter.frequency.setValueAtTime(opts.freq, t);
  if (opts.sweepTo !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(50, opts.sweepTo), t + opts.duration);
  }
  filter.Q.value = opts.q ?? 1;
  const g = c.createGain();
  const attack = opts.attack ?? 0.002;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(opts.gain ?? 0.18, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + opts.duration + 0.05);
}

function tone(c: AudioContext, master: GainNode, opts: {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  detune?: number;
  delay?: number;
  sweepTo?: number;
}) {
  const t = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t);
  if (opts.detune !== undefined) osc.detune.value = opts.detune;
  if (opts.sweepTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.sweepTo), t + opts.duration);
  }
  const g = c.createGain();
  const attack = opts.attack ?? 0.008;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(opts.gain ?? 0.12, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + opts.duration + 0.05);
}

/** Two short detuned sines + a tiny noise tap = soft chime, not a synth blip. */
function chime(c: AudioContext, master: GainNode, freq: number, dur = 0.32, delay = 0, gain = 0.09) {
  tone(c, master, { freq,           duration: dur, type: "sine",     gain,         delay, attack: 0.005 });
  tone(c, master, { freq: freq * 2, duration: dur * 0.7, type: "sine", gain: gain * 0.35, delay, attack: 0.005 });
  // Brief noise pluck at start for "stick" attack
  noiseBurst(c, master, {
    duration: 0.04, filterType: "bandpass", freq: freq * 2, q: 12, gain: 0.06, delay,
  });
}

export function setMuted(v: boolean) {
  muted = v;
  if (v && ctx) {
    try { ctx.close(); } catch { /* ignore */ }
    ctx = null; masterGain = null; noiseBuf = null;
  }
}
export function isMuted() { return muted; }

export const sfx = {
  /** Card hitting the felt: short paper "swish" + tiny tap. */
  cardPlay: () => {
    const e = ensureCtx(); if (!e) return;
    // Friction swish
    noiseBurst(e.ctx, e.master, {
      duration: 0.085, filterType: "bandpass", freq: 2400, q: 1.3, gain: 0.16, sweepTo: 1100,
    });
    // Soft tap when it lands
    noiseBurst(e.ctx, e.master, {
      duration: 0.045, filterType: "lowpass", freq: 700, gain: 0.10, delay: 0.06,
    });
  },
  /** Dealing a card off the deck — softer than play. */
  cardDeal: () => {
    const e = ensureCtx(); if (!e) return;
    noiseBurst(e.ctx, e.master, {
      duration: 0.07, filterType: "highpass", freq: 1800, q: 0.8, gain: 0.09, sweepTo: 800,
    });
  },
  /** Wood-knock for committing a bid. */
  bidPlace: () => {
    const e = ensureCtx(); if (!e) return;
    // Low-frequency thump
    tone(e.ctx, e.master, {
      freq: 180, duration: 0.09, type: "triangle", gain: 0.18, attack: 0.002, sweepTo: 90,
    });
    // High click on top
    noiseBurst(e.ctx, e.master, {
      duration: 0.03, filterType: "bandpass", freq: 4500, q: 8, gain: 0.07,
    });
  },
  /** Air-out sigh on pass. */
  bidPass: () => {
    const e = ensureCtx(); if (!e) return;
    noiseBurst(e.ctx, e.master, {
      duration: 0.22, filterType: "lowpass", freq: 900, q: 0.5, gain: 0.07, sweepTo: 280,
    });
  },
  /** Ascending chime arpeggio for winning a round. */
  trickWin: () => {
    const e = ensureCtx(); if (!e) return;
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    notes.forEach((f, i) => chime(e.ctx, e.master, f, 0.32, i * 0.07, 0.08));
  },
  /** Partner reveal — swelling chord with bright tail. */
  partnerReveal: () => {
    const e = ensureCtx(); if (!e) return;
    // Pad (slow attack triad)
    const root = 440; // A4
    [root, root * 1.25, root * 1.5].forEach((f, i) => {
      tone(e.ctx, e.master, {
        freq: f, duration: 1.1, type: "sine", gain: 0.06, attack: 0.18, detune: i * 4,
      });
    });
    // Bright tail
    setTimeout(() => {
      const e2 = ensureCtx(); if (!e2) return;
      chime(e2.ctx, e2.master, 880, 0.45, 0, 0.08);
      chime(e2.ctx, e2.master, 1318.5, 0.4, 0.08, 0.06);
    }, 320);
  },
  /** Brass-tinted fanfare when the bid is made. */
  roundMade: () => {
    const e = ensureCtx(); if (!e) return;
    const seq = [392, 523.25, 659.25, 783.99]; // G4 C5 E5 G5
    seq.forEach((f, i) => {
      tone(e.ctx, e.master, {
        freq: f, duration: 0.28, type: "triangle", gain: 0.10, attack: 0.015, delay: i * 0.11,
      });
      tone(e.ctx, e.master, {
        freq: f * 2, duration: 0.22, type: "sine", gain: 0.05, attack: 0.015, delay: i * 0.11,
      });
    });
    // Final bell tap
    setTimeout(() => {
      const e2 = ensureCtx(); if (!e2) return;
      chime(e2.ctx, e2.master, 1046.5, 0.5, 0, 0.10);
    }, 520);
  },
  /** Descending noise + low sine for a failed bid. */
  roundFail: () => {
    const e = ensureCtx(); if (!e) return;
    noiseBurst(e.ctx, e.master, {
      duration: 0.5, filterType: "lowpass", freq: 700, q: 0.4, gain: 0.10, sweepTo: 200,
    });
    tone(e.ctx, e.master, {
      freq: 220, duration: 0.55, type: "sawtooth", gain: 0.06, sweepTo: 110, attack: 0.05,
    });
  },
  /** Full fanfare for game end. */
  gameWin: () => {
    const e = ensureCtx(); if (!e) return;
    const seq = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5 E5 G5 C6 E6
    seq.forEach((f, i) => {
      tone(e.ctx, e.master, {
        freq: f, duration: 0.32, type: "triangle", gain: 0.12, attack: 0.01, delay: i * 0.1,
      });
      tone(e.ctx, e.master, {
        freq: f * 1.5, duration: 0.28, type: "sine", gain: 0.06, attack: 0.01, delay: i * 0.1, detune: 4,
      });
    });
    // Sustained pad underneath
    [261.6, 329.6, 392].forEach((f, i) => {
      tone(e.ctx, e.master, {
        freq: f, duration: 1.6, type: "sine", gain: 0.045, attack: 0.2, delay: 0.2 + i * 0.02,
      });
    });
  },
};
