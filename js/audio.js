/**
 * Vault Run — Web Audio SFX (no external assets)
 */
window.VR = window.VR || {};

VR.Audio = (function () {
  let ctx = null;
  let muted = false;
  let master = null;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gain, when) {
    if (muted) return;
    const ac = ensure();
    const t0 = (when || ac.currentTime);
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain) {
    if (muted) return;
    const ac = ensure();
    const n = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ac.createBufferSource();
    src.buffer = n;
    const g = ac.createGain();
    g.gain.value = gain || 0.12;
    src.connect(g);
    g.connect(master);
    src.start();
  }

  return {
    unlock() {
      ensure();
    },
    setMuted(m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : 0.35;
    },
    isMuted() {
      return muted;
    },
    spin() {
      tone(180, 0.08, "square", 0.08);
      tone(90, 0.15, "sawtooth", 0.05);
    },
    stop() {
      tone(220, 0.05, "triangle", 0.1);
      tone(330, 0.08, "sine", 0.08);
    },
    win() {
      tone(440, 0.1, "sine", 0.15);
      tone(554, 0.12, "sine", 0.12, ensure().currentTime + 0.08);
      tone(659, 0.18, "sine", 0.1, ensure().currentTime + 0.16);
    },
    cascade() {
      tone(520 + Math.random() * 80, 0.07, "triangle", 0.1);
      noise(0.05, 0.06);
    },
    collect() {
      tone(880, 0.08, "sine", 0.12);
      tone(1174, 0.12, "sine", 0.1, ensure().currentTime + 0.06);
    },
    bonus() {
      [523, 659, 784, 1046].forEach((f, i) => {
        tone(f, 0.2, "sine", 0.14, ensure().currentTime + i * 0.1);
      });
    },
    bigWin() {
      for (let i = 0; i < 8; i++) {
        tone(300 + i * 80, 0.15, "sawtooth", 0.08, ensure().currentTime + i * 0.07);
      }
    },
    click() {
      tone(600, 0.03, "square", 0.06);
    },
    heat() {
      tone(140, 0.2, "sawtooth", 0.1);
      tone(280, 0.15, "square", 0.06, ensure().currentTime + 0.05);
    }
  };
})();
