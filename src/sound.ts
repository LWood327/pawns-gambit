// Piece sounds synthesized with Web Audio, so no audio files are needed.
// Each board theme has its own voice: wood, lava, ice, space, water, neon, forest.

let ctx: AudioContext | null = null;
let muted = false;
let themeId = 'walnut';
let echoBus: GainNode | null = null;

export function setMuted(m: boolean) {
  muted = m;
}

export function setSoundTheme(id: string) {
  themeId = id;
}

function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** A shared feedback delay, used for the spacey echo. */
function echo() {
  const a = audio();
  if (echoBus) return echoBus;
  const input = a.createGain();
  const delay = a.createDelay(1);
  delay.delayTime.value = 0.16;
  const feedback = a.createGain();
  feedback.gain.value = 0.38;
  const tone = a.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2400;
  input.connect(delay).connect(tone).connect(feedback).connect(delay);
  tone.connect(a.destination);
  echoBus = input;
  return input;
}

interface ToneOpts {
  type?: OscillatorType;
  from: number;
  to?: number;
  dur: number;
  gain?: number;
  at?: number;
  attack?: number;
  out?: AudioNode;
}

function tone({ type = 'sine', from, to = from, dur, gain = 0.4, at = 0, attack = 0.004, out }: ToneOpts) {
  const a = audio();
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out ?? a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

interface NoiseOpts {
  dur: number;
  filter?: BiquadFilterType;
  freq: number;
  q?: number;
  gain?: number;
  at?: number;
  /** How fast it fades: higher is a sharper click. */
  curve?: number;
}

function noise({ dur, filter = 'bandpass', freq, q = 1, gain = 0.4, at = 0, curve = 3 }: NoiseOpts) {
  const a = audio();
  const t = a.currentTime + at;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, curve);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

/** Wooden knock: a short click plus a low body. */
function knock(at = 0, pitch = 1, gain = 0.5) {
  noise({ dur: 0.06, freq: 1400 * pitch, q: 1.2, gain, at });
  tone({ from: 210 * pitch, to: 120 * pitch, dur: 0.12, gain: gain * 0.7, at });
}

export type SoundKind = 'move' | 'capture' | 'check' | 'end' | 'low-time';

type Voice = Record<SoundKind, () => void>;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

const VOICES: Record<string, Voice> = {
  walnut: {
    move: () => knock(),
    capture: () => {
      knock(0, 1.25, 0.6);
      knock(0.045, 0.9, 0.35);
    },
    check: () => {
      knock(0, 1.1);
      knock(0.09, 1.5, 0.3);
    },
    end: () => {
      knock(0, 0.8, 0.5);
      knock(0.16, 0.7, 0.45);
      knock(0.32, 0.6, 0.5);
    },
    'low-time': () => knock(0, 2, 0.25),
  },

  // Heavy stone thud; captures sizzle like water on hot rock.
  lava: {
    move: () => {
      tone({ from: 95, to: 48, dur: 0.22, gain: 0.55 });
      noise({ dur: 0.08, filter: 'lowpass', freq: 600, gain: 0.35 });
    },
    capture: () => {
      tone({ from: 80, to: 40, dur: 0.3, gain: 0.55 });
      noise({ dur: 0.55, filter: 'highpass', freq: 3500, gain: 0.18, curve: 1.5, at: 0.03 });
      noise({ dur: 0.3, filter: 'bandpass', freq: 900, q: 0.6, gain: 0.2, at: 0.02 });
    },
    check: () => {
      tone({ from: 70, to: 45, dur: 0.45, gain: 0.5 });
      tone({ type: 'triangle', from: 220, to: 180, dur: 0.3, gain: 0.15, at: 0.05 });
    },
    end: () => {
      tone({ from: 60, to: 30, dur: 1.2, gain: 0.6 });
      noise({ dur: 1, filter: 'lowpass', freq: 300, gain: 0.3, curve: 1.2 });
    },
    'low-time': () => tone({ from: 140, to: 120, dur: 0.12, gain: 0.3 }),
  },

  // Glassy clinks; captures shatter into scattered shards.
  ice: {
    move: () => {
      const f = rnd(1900, 2300);
      tone({ from: f, dur: 0.35, gain: 0.18 });
      tone({ from: f * 2.76, dur: 0.18, gain: 0.07 });
      noise({ dur: 0.02, filter: 'highpass', freq: 5000, gain: 0.15 });
    },
    capture: () => {
      noise({ dur: 0.25, filter: 'highpass', freq: 4000, gain: 0.3, curve: 2 });
      for (let i = 0; i < 6; i++) tone({ from: rnd(2200, 5200), dur: rnd(0.08, 0.22), gain: 0.07, at: rnd(0, 0.18) });
    },
    check: () => {
      tone({ from: 2600, dur: 0.5, gain: 0.14 });
      tone({ from: 3100, dur: 0.5, gain: 0.1, at: 0.1 });
    },
    end: () => {
      [1760, 2217, 2637, 3520].forEach((f, i) => tone({ from: f, dur: 0.9, gain: 0.1, at: i * 0.12 }));
    },
    'low-time': () => tone({ from: 3400, dur: 0.1, gain: 0.1 }),
  },

  // Soft synth blips with an echo.
  space: {
    move: () => tone({ type: 'sine', from: rnd(620, 700), to: 330, dur: 0.22, gain: 0.25, out: echo() }),
    capture: () => {
      tone({ type: 'sawtooth', from: 900, to: 60, dur: 0.4, gain: 0.08, out: echo() });
      tone({ from: 1400, to: 2400, dur: 0.25, gain: 0.12, at: 0.08, out: echo() });
    },
    check: () => {
      tone({ type: 'triangle', from: 880, dur: 0.18, gain: 0.18, out: echo() });
      tone({ type: 'triangle', from: 1320, dur: 0.25, gain: 0.15, at: 0.12, out: echo() });
    },
    end: () => {
      [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.6, gain: 0.12, at: i * 0.14, out: echo() }));
    },
    'low-time': () => tone({ from: 1200, dur: 0.06, gain: 0.12, out: echo() }),
  },

  // Bubbles: quick rising sine sweeps.
  reef: {
    move: () => tone({ from: rnd(260, 320), to: rnd(800, 1000), dur: 0.09, gain: 0.3, attack: 0.002 }),
    capture: () => {
      for (let i = 0; i < 5; i++) tone({ from: rnd(220, 420), to: rnd(700, 1400), dur: rnd(0.05, 0.1), gain: 0.2, at: i * rnd(0.03, 0.07) });
    },
    check: () => {
      tone({ from: 200, to: 600, dur: 0.18, gain: 0.3 });
      tone({ from: 300, to: 900, dur: 0.12, gain: 0.2, at: 0.14 });
    },
    end: () => {
      for (let i = 0; i < 12; i++) tone({ from: rnd(200, 500), to: rnd(600, 1600), dur: 0.08, gain: 0.15, at: i * 0.06 });
    },
    'low-time': () => tone({ from: 500, to: 1200, dur: 0.05, gain: 0.15 }),
  },

  // 8-bit beeps.
  neon: {
    move: () => tone({ type: 'square', from: 660, dur: 0.06, gain: 0.08, attack: 0.001 }),
    capture: () => {
      [880, 660, 440, 330].forEach((f, i) => tone({ type: 'square', from: f, dur: 0.05, gain: 0.08, at: i * 0.04, attack: 0.001 }));
      noise({ dur: 0.12, filter: 'highpass', freq: 2000, gain: 0.1, at: 0.05 });
    },
    check: () => {
      tone({ type: 'square', from: 990, dur: 0.07, gain: 0.09, attack: 0.001 });
      tone({ type: 'square', from: 990, dur: 0.07, gain: 0.09, at: 0.11, attack: 0.001 });
    },
    end: () => {
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ type: 'square', from: f, dur: 0.09, gain: 0.08, at: i * 0.09, attack: 0.001 }));
    },
    'low-time': () => tone({ type: 'square', from: 1320, dur: 0.04, gain: 0.07, attack: 0.001 }),
  },

  // Soft wood tap with a leafy rustle; captures snap like a twig.
  forest: {
    move: () => {
      knock(0, 0.8, 0.35);
      noise({ dur: 0.18, filter: 'bandpass', freq: 3000, q: 0.5, gain: 0.08, curve: 1.5 });
    },
    capture: () => {
      noise({ dur: 0.03, filter: 'highpass', freq: 2500, gain: 0.5, curve: 4 });
      noise({ dur: 0.02, filter: 'highpass', freq: 3500, gain: 0.35, curve: 4, at: 0.035 });
      knock(0.02, 0.7, 0.3);
    },
    check: () => {
      tone({ type: 'triangle', from: 1568, dur: 0.15, gain: 0.12 });
      tone({ type: 'triangle', from: 2093, dur: 0.2, gain: 0.1, at: 0.08 });
    },
    end: () => {
      [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.4, gain: 0.1, at: i * 0.11 }));
    },
    'low-time': () => tone({ type: 'triangle', from: 2093, dur: 0.06, gain: 0.08 }),
  },
};

export function play(kind: SoundKind) {
  if (muted) return;
  try {
    (VOICES[themeId] ?? VOICES.walnut)[kind]();
  } catch {
    /* audio not available */
  }
}

/** A short sample of a theme's sounds, for the theme gallery. */
export function preview(id: string) {
  if (muted) return;
  const prev = themeId;
  themeId = id;
  play('move');
  setTimeout(() => {
    themeId = id;
    play('capture');
    themeId = prev;
  }, 380);
  themeId = prev;
}
