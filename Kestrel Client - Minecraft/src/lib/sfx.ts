// Kestrel's own interface sounds, synthesized (no audio files). Used only for
// Launch, a finished download and errors — never for clicks or hovers.
let ctx: AudioContext | null = null;

function tone(freqs: number[], dur: number, volume: number, type: OscillatorType = "sine", gap = 0.07) {
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain();
      o.type = type; o.frequency.value = f;
      const start = t0 + i * gap;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(volume, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g).connect(ctx!.destination);
      o.start(start); o.stop(start + dur + 0.02);
    });
  } catch { /* audio unavailable */ }
}

export const sfx = {
  launch: (v: number) => tone([392, 587.33, 783.99], 0.22, 0.09 * v, "triangle", 0.06),
  done: (v: number) => tone([659.25, 987.77], 0.18, 0.07 * v, "sine", 0.08),
  error: (v: number) => tone([220, 174.61], 0.22, 0.08 * v, "square", 0.1),
};
