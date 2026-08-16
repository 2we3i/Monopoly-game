// sounds.js
// Lightweight sound effects synthesized with the Web Audio API rather than
// shipped as binary files. This avoids any audio-licensing questions
// entirely, keeps the bundle tiny, and means there's nothing to 404 if a
// file fails to load. Each function builds a short envelope of oscillators.

let ctx = null;
function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  // Browsers suspend AudioContext until a user gesture; resume defensively.
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq, duration, type = 'sine', gain = 0.15, delay = 0, freqEnd = null }) {
  const audioCtx = getCtx();
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = type;
  const startTime = audioCtx.currentTime + delay;
  osc.frequency.setValueAtTime(freq, startTime);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);
  gainNode.gain.setValueAtTime(gain, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

function noiseBurst({ duration, gain = 0.1, delay = 0 }) {
  const audioCtx = getCtx();
  const bufferSize = Math.floor(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(gain, audioCtx.currentTime + delay);
  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start(audioCtx.currentTime + delay);
}

export const sounds = {
  // Two quick clattering noise bursts - dice hitting a table
  diceRoll() {
    try {
      noiseBurst({ duration: 0.12, gain: 0.12, delay: 0 });
      noiseBurst({ duration: 0.1, gain: 0.09, delay: 0.1 });
      noiseBurst({ duration: 0.08, gain: 0.06, delay: 0.19 });
    } catch { /* audio not available, fail silently */ }
  },
  // Bright ascending chime - a purchase confirmation
  purchase() {
    try {
      tone({ freq: 440, duration: 0.12, type: 'triangle', gain: 0.14 });
      tone({ freq: 660, duration: 0.18, type: 'triangle', gain: 0.14, delay: 0.09 });
    } catch { /* noop */ }
  },
  // Cheerful two-note coin sound - collecting money
  collectMoney() {
    try {
      tone({ freq: 880, duration: 0.09, type: 'sine', gain: 0.13 });
      tone({ freq: 1180, duration: 0.14, type: 'sine', gain: 0.11, delay: 0.06 });
    } catch { /* noop */ }
  },
  // Low descending tone - paying money out
  payMoney() {
    try {
      tone({ freq: 420, duration: 0.16, type: 'sine', gain: 0.12, freqEnd: 260 });
    } catch { /* noop */ }
  },
  // Low somber descending tone with a slight rasp - bankruptcy
  bankruptcy() {
    try {
      tone({ freq: 300, duration: 0.5, type: 'sawtooth', gain: 0.09, freqEnd: 80 });
    } catch { /* noop */ }
  },
  // Short upward blip - your turn / notification
  yourTurn() {
    try {
      tone({ freq: 520, duration: 0.1, type: 'sine', gain: 0.1 });
      tone({ freq: 780, duration: 0.14, type: 'sine', gain: 0.1, delay: 0.08 });
    } catch { /* noop */ }
  },
  // Soft, quick double-pluck - a new chat message. Deliberately gentler and
  // higher-pitched than yourTurn() so the two are easy to tell apart by ear.
  chatMessage() {
    try {
      tone({ freq: 900, duration: 0.06, type: 'sine', gain: 0.08 });
      tone({ freq: 1300, duration: 0.08, type: 'sine', gain: 0.07, delay: 0.045 });
    } catch { /* noop */ }
  },
  // Soft click - generic UI action
  click() {
    try {
      tone({ freq: 300, duration: 0.05, type: 'square', gain: 0.05 });
    } catch { /* noop */ }
  },
};
