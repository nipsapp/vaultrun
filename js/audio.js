/**
 * Vault Run — casino pack SFX + BGM (assets/audio)
 * Falls back to light synth tones if a file fails to load.
 */
window.VR = window.VR || {};

VR.Audio = (function () {
  const BASE = "assets/audio/";
  const FILES = {
    bgm: "bgm.mp3",
    click: "click.mp3",
    spin: "spin.mp3",
    spinBtn: "spin_btn.mp3",
    stop: "stop.wav",
    stopColumn: "stop_column.mp3",
    win: "win.mp3",
    bigWin: "bigwin.mp3",
    bonus: "bonus.mp3",
    bonusPopup: "bonus_popup.mp3",
    cascade: "cascade.mp3",
    collect: "collect.mp3",
    mult: "mult.mp3",
    levelup: "levelup.mp3",
    jackpot: "jackpot.mp3",
    scatter: "scatter.wav",
    reward: "reward.mp3"
  };

  let muted = false;
  let unlocked = false;
  let buffers = {};
  let bgmEl = null;
  let spinLoop = null;
  let ctx = null;
  let master = null;

  function ensureSynth() {
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
    const ac = ensureSynth();
    const t0 = when || ac.currentTime;
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

  function loadOne(key, file) {
    return new Promise((resolve) => {
      const a = new Audio();
      a.preload = "auto";
      a.src = BASE + file;
      const done = () => {
        buffers[key] = a;
        resolve(true);
      };
      a.addEventListener("canplaythrough", done, { once: true });
      a.addEventListener("error", () => {
        console.warn("[audio] missing", file);
        resolve(false);
      });
      a.load();
    });
  }

  async function preload() {
    await Promise.all(Object.keys(FILES).map((k) => loadOne(k, FILES[k])));
    if (buffers.bgm) {
      bgmEl = buffers.bgm;
      bgmEl.loop = true;
      bgmEl.volume = 0.28;
    }
  }

  // kick off load early
  const ready = preload();

  function play(key, opts) {
    opts = opts || {};
    if (muted) return null;
    const src = buffers[key];
    if (!src) return null;
    try {
      const a = src.cloneNode();
      a.volume = opts.volume != null ? opts.volume : 0.7;
      if (opts.loop) a.loop = true;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
      return a;
    } catch (e) {
      return null;
    }
  }

  function stopEl(el) {
    if (!el) return;
    try {
      el.pause();
      el.currentTime = 0;
    } catch (e) {}
  }

  function startBgm() {
    if (muted || !bgmEl) return;
    try {
      bgmEl.volume = 0.28;
      const p = bgmEl.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }

  function stopBgm() {
    stopEl(bgmEl);
  }

  return {
    ready,
    unlock() {
      if (unlocked) return;
      unlocked = true;
      ensureSynth();
      ready.then(() => startBgm());
    },
    setMuted(m) {
      muted = !!m;
      if (muted) {
        stopBgm();
        stopEl(spinLoop);
        spinLoop = null;
        if (master) master.gain.value = 0;
      } else {
        if (master) master.gain.value = 0.35;
        if (unlocked) startBgm();
      }
    },
    isMuted() {
      return muted;
    },
    spin() {
      stopEl(spinLoop);
      spinLoop = play("spin", { volume: 0.45, loop: true });
      if (!spinLoop) {
        play("spinBtn", { volume: 0.6 });
        tone(180, 0.08, "square", 0.08);
      }
    },
    cancelSpin() {
      stopEl(spinLoop);
      spinLoop = null;
    },
    reelStop() {
      if (!play("stopColumn", { volume: 0.4 })) tone(240, 0.045, "triangle", 0.08);
    },
    stop() {
      stopEl(spinLoop);
      spinLoop = null;
      if (!play("stop", { volume: 0.65 })) {
        if (!play("stopColumn", { volume: 0.55 })) {
          tone(220, 0.05, "triangle", 0.1);
          tone(330, 0.08, "sine", 0.08);
        }
      }
    },
    win() {
      if (!play("win", { volume: 0.75 })) {
        tone(440, 0.1, "sine", 0.15);
        tone(554, 0.12, "sine", 0.12, ensureSynth().currentTime + 0.08);
      }
    },
    cascade() {
      if (!play("cascade", { volume: 0.55 })) {
        tone(520 + Math.random() * 80, 0.07, "triangle", 0.1);
      }
    },
    collect() {
      if (!play("collect", { volume: 0.7 })) {
        if (!play("reward", { volume: 0.65 })) {
          tone(880, 0.08, "sine", 0.12);
        }
      }
    },
    bonus() {
      play("bonusPopup", { volume: 0.7 });
      if (!play("bonus", { volume: 0.75 })) {
        play("scatter", { volume: 0.7 });
      }
    },
    bigWin() {
      if (!play("bigWin", { volume: 0.85 })) {
        if (!play("jackpot", { volume: 0.8 })) {
          for (let i = 0; i < 6; i++) {
            tone(300 + i * 80, 0.15, "sawtooth", 0.08, ensureSynth().currentTime + i * 0.07);
          }
        }
      }
    },
    click() {
      if (!play("click", { volume: 0.5 })) tone(600, 0.03, "square", 0.06);
    },
    heat() {
      if (!play("mult", { volume: 0.65 })) {
        if (!play("levelup", { volume: 0.6 })) {
          tone(140, 0.2, "sawtooth", 0.1);
        }
      }
    }
  };
})();
