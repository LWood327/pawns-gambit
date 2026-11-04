// Wooden piece sounds synthesized with Web Audio, so no audio files are needed.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}

function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** A short knock: filtered noise for the click plus a low sine for the body. */
function knock(when: number, { pitch = 1, gain = 0.5 } = {}) {
  const a = audio();
  const t = a.currentTime + when;

  const len = Math.floor(a.sampleRate * 0.06);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const noise = a.createBufferSource();
  noise.buffer = buf;
  const band = a.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1400 * pitch;
  band.Q.value = 1.2;
  const ng = a.createGain();
  ng.gain.value = gain;
  noise.connect(band).connect(ng).connect(a.destination);
  noise.start(t);

  const osc = a.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(210 * pitch, t);
  osc.frequency.exponentialRampToValueAtTime(120 * pitch, t + 0.09);
  const og = a.createGain();
  og.gain.setValueAtTime(gain * 0.7, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(og).connect(a.destination);
  osc.start(t);
  osc.stop(t + 0.13);
}

export type SoundKind = 'move' | 'capture' | 'check' | 'end' | 'low-time';

export function play(kind: SoundKind) {
  if (muted) return;
  try {
    switch (kind) {
      case 'move':
        knock(0);
        break;
      case 'capture':
        knock(0, { pitch: 1.25, gain: 0.6 });
        knock(0.045, { pitch: 0.9, gain: 0.35 });
        break;
      case 'check':
        knock(0, { pitch: 1.1 });
        knock(0.09, { pitch: 1.5, gain: 0.3 });
        break;
      case 'end':
        knock(0, { pitch: 0.8, gain: 0.5 });
        knock(0.16, { pitch: 0.7, gain: 0.45 });
        knock(0.32, { pitch: 0.6, gain: 0.5 });
        break;
      case 'low-time':
        knock(0, { pitch: 2, gain: 0.25 });
        break;
    }
  } catch {
    /* audio not available */
  }
}
