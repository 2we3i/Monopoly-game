// sounds.js
// Cosmetic sounds, synthesised with the Web Audio API: no audio files to
// download, a few oscillators and envelopes each. Nothing plays unless
// the player owns and equipped the sound AND has cosmetic sounds on.

let ctx = null;

function audio() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(ac, {
  freq, start = 0, duration = 0.2, type = 'sine', gain = 0.2, attack = 0.01, slideTo = null,
}) {
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function noise(ac, { start = 0, duration = 0.08, gain = 0.15 }) {
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * duration), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  const g = ac.createGain();
  src.buffer = buffer;
  g.gain.value = gain;
  src.connect(g).connect(ac.destination);
  src.start(ac.currentTime + start);
}

const PRESETS = {
  drum: (ac) => {
    for (let i = 0; i < 8; i += 1) noise(ac, { start: i * 0.05, duration: 0.05, gain: 0.08 + i * 0.012 });
    tone(ac, { freq: 90, start: 0.42, duration: 0.35, type: 'sine', gain: 0.35, slideTo: 45 });
  },
  horn: (ac) => {
    tone(ac, { freq: 220, duration: 0.25, type: 'sawtooth', gain: 0.08 });
    tone(ac, { freq: 330, start: 0.22, duration: 0.5, type: 'sawtooth', gain: 0.08 });
    tone(ac, { freq: 440, start: 0.22, duration: 0.5, type: 'triangle', gain: 0.1 });
  },
  fanfare: (ac) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(ac, { freq: f, start: i * 0.12, duration: i === 3 ? 0.6 : 0.16, type: 'square', gain: 0.07 }));
  },
  choir: (ac) => {
    [261.6, 329.6, 392, 523.3].forEach((f) => tone(ac, { freq: f, duration: 1.4, type: 'sine', gain: 0.07, attack: 0.25 }));
    tone(ac, { freq: 659.3, start: 0.4, duration: 1.1, type: 'triangle', gain: 0.05, attack: 0.2 });
  },
  coin: (ac) => {
    tone(ac, { freq: 988, duration: 0.08, type: 'square', gain: 0.08 });
    tone(ac, { freq: 1319, start: 0.07, duration: 0.3, type: 'square', gain: 0.07 });
  },
  harp: (ac) => {
    [392, 494, 587, 740, 880, 1175].forEach((f, i) => tone(ac, { freq: f, start: i * 0.05, duration: 0.5, type: 'triangle', gain: 0.07 }));
  },
  bell: (ac) => {
    tone(ac, { freq: 660, duration: 1.2, type: 'sine', gain: 0.18 });
    tone(ac, { freq: 1320, duration: 0.8, type: 'sine', gain: 0.06 });
  },
  arcade: (ac) => {
    tone(ac, {
      freq: 440, duration: 0.18, type: 'square', gain: 0.06, slideTo: 880,
    });
    tone(ac, { freq: 880, start: 0.16, duration: 0.14, type: 'square', gain: 0.06 });
  },
};

export function playSoundPreset(preset) {
  const ac = audio();
  const play = PRESETS[preset];
  if (!ac || !play) return;
  try {
    play(ac);
  } catch {
    /* audio can fail on locked-down browsers - sounds are decoration only */
  }
}

export function playItemSound(item, enabled = true) {
  if (!enabled || !item?.visual?.preset) return;
  playSoundPreset(item.visual.preset);
}
