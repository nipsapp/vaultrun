/**
 * Vault Run — canvas renderer using Antique Casino Greek sprites
 */
window.VR = window.VR || {};

VR.Render = (function () {
  let canvas, ctx, dpr;
  let cellW = 0, cellH = 0, pad = 6;
  let flashCells = new Set();
  let goldCells = new Set();
  let animCells = new Map(); // "c,r" -> { id, start }
  let boardRows = 3;
  let animTick = 0;
  let winGroups = [];
  let revealStart = 0;
  const emit = (name, detail = {}) => window.dispatchEvent(new CustomEvent('vr:animation', {
    detail: { name, timestamp: performance.now(), ...detail }
  }));

  function init(el) {
    canvas = el;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    resize();
    window.addEventListener("resize", () => {
      resize();
      if (lastGrid) drawFrame(lastGrid, null);
    });
  }

  function setRows(rows) {
    const next = rows || VR.CONFIG.rowsBase;
    if (next === boardRows && cellW > 0) return; // no-op — avoid wiping canvas
    boardRows = next;
    resize();
  }

  function resize() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const nextW = Math.floor(w * dpr);
    const nextH = Math.floor(h * dpr);
    const sizeChanged = canvas.width !== nextW || canvas.height !== nextH;
    if (sizeChanged) {
      canvas.width = nextW;
      canvas.height = nextH;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    } else if (!ctx) {
      ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }
    const cols = VR.CONFIG.reels;
    const rows = boardRows;
    pad = Math.max(3, Math.floor(w * 0.006));
    cellW = (w - pad * (cols + 1)) / cols;
    cellH = (h - pad * (rows + 1)) / rows;
  }

  let lastGrid = null;

  function cellRect(c, r) {
    return {
      x: pad + c * (cellW + pad),
      y: pad + r * (cellH + pad),
      w: cellW,
      h: cellH
    };
  }

  function roundRect(x, y, w, h, rad) {
    const rr = Math.min(rad, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawImageCover(img, x, y, w, h) {
    if (!img) return false;
    const ir = img.width / img.height;
    const tr = w / h;
    let dw = w, dh = h, dx = x, dy = y;
    if (ir > tr) {
      dw = h * ir;
      dx = x + (w - dw) / 2;
    } else {
      dh = w / ir;
      dy = y + (h - dh) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
    return true;
  }

  function drawImageContain(img, x, y, w, h, padRatio) {
    if (!img) return false;
    const p = (padRatio == null ? 0.08 : padRatio) * Math.min(w, h);
    const aw = w - p * 2;
    const ah = h - p * 2;
    const crop = VR.Assets.getSymbolBounds?.(img) || [0, 0, img.width, img.height];
    const ir = crop[2] / crop[3];
    const tr = aw / ah;
    let dw, dh;
    if (ir > tr) {
      dw = aw;
      dh = aw / ir;
    } else {
      dh = ah;
      dw = ah * ir;
    }
    ctx.drawImage(img, ...crop, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return true;
  }

  function drawSymbol(id, x, y, w, h, extra) {
    const s = Math.min(w, h);

    if (id === "BLOCK") {
      roundRect(x, y, w, h, s * 0.1);
      ctx.fillStyle = "rgba(30,41,59,0.92)";
      ctx.fill();
      ctx.strokeStyle = "#b45309";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fbbf24";
      ctx.font = `800 ${Math.floor(s * 0.32)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((extra && extra.arrow) === "V" ? "↕" : "↔", x + w / 2, y + h / 2);
      return;
    }

    // plate behind symbol
    roundRect(x, y, w, h, s * 0.1);
    ctx.fillStyle = "rgba(15,23,42,0.35)";
    ctx.fill();

    const gold = extra && extra.gold;
    const locked = extra && extra.locked;
    const key = extra && extra._key;
    const animating = key && animCells.has(key);
    let frameIndex = 0;
    if (animating) {
      const fc = Math.max(1, VR.Assets.frameCount(id));
      frameIndex = Math.min(fc - 1, Math.floor((performance.now() - animCells.get(key).start) / 65));
    }

    const img = VR.Assets.getSymbolFrame(id, frameIndex, animating);
    const drawn = drawImageContain(img, x, y, w, h, 0.025);

    if (!drawn) {
      // fallback procedural
      const meta = VR.CONFIG.symbols[id] || { color: "#fff", name: id };
      ctx.fillStyle = meta.color;
      ctx.font = `800 ${Math.floor(s * 0.28)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(meta.name.slice(0, 6), x + w / 2, y + h / 2);
    }

    if (gold || locked) {
      ctx.strokeStyle = gold ? "#fbbf24" : "rgba(56,189,248,0.85)";
      ctx.lineWidth = gold ? 3 : 2;
      roundRect(x + 1, y + 1, w - 2, h - 2, s * 0.1);
      ctx.stroke();
    }

    if (id === "CHIP" && extra && extra.chip != null) {
      const label = String(extra.chip) + "\u00d7";
      ctx.save();
      ctx.font = `900 ${Math.max(10, Math.floor(s * (label.length > 3 ? 0.235 : 0.27)))}px "Trebuchet MS", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, s * 0.022);
      ctx.strokeStyle = "#321842";
      ctx.fillStyle = "#fff1bc";
      ctx.shadowColor = "rgba(96, 219, 237, 0.55)";
      ctx.shadowBlur = Math.max(3, s * 0.055);
      const cx = x + w / 2, cy = y + h / 2;
      const maxWidth = Math.min(w, h) * 0.58;
      ctx.strokeText(label, cx, cy, maxWidth);
      ctx.fillText(label, cx, cy, maxWidth);
      ctx.restore();
    } else if (id === "WILD" && extra && extra.mult) {
      ctx.font = `900 ${Math.floor(s * 0.22)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#000";
      ctx.fillStyle = "#fde68a";
      const t = extra.mult + "\u00d7";
      ctx.strokeText(t, x + w / 2, y + h * 0.78);
      ctx.fillText(t, x + w / 2, y + h * 0.78);
    }
  }

  function setFlash(positions) {
    flashCells = new Set((positions || []).map((p) => p.c + "," + p.r));
  }

  function setGold(positions) {
    goldCells = new Set((positions || []).map((p) => p.c + "," + p.r));
  }

  function clearFlash() {
    flashCells = new Set();
    winGroups = [];
  }

  function animateCells(positions, idHint) {
    const now = performance.now();
    (positions || []).forEach((p) => {
      animCells.set(p.c + "," + p.r, { id: idHint || null, start: now });
    });
  }

  function clearAnim() {
    animCells.clear();
  }

  function drawFrame(grid, spinOffset) {
    if (!ctx || !canvas) return;
    if (grid) {
      lastGrid = grid;
      const rows = VR.Engine.rowsOf(grid);
      if (rows !== boardRows) setRows(rows);
    }
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    animTick++;

    // Leave the cabinet lighting visible beneath the symbols. Clear first so
    // translucent fills never accumulate across animation frames.
    ctx.clearRect(0, 0, w, h);
    // background art
    const bg = VR.Assets.getUi("bg");
    if (bg) {
      drawImageCover(bg, 0, 0, w, h);
      ctx.fillStyle = "rgba(2,6,23,0.35)";
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = "rgba(8, 13, 29, 0.32)";
      ctx.fillRect(0, 0, w, h);
    }

    // ornate frame
    ctx.strokeStyle = "rgba(212,175,55,0.55)";
    ctx.lineWidth = 3;
    roundRect(3, 3, w - 6, h - 6, 12);
    ctx.stroke();

    if (!grid) return;
    const cols = VR.CONFIG.reels;
    const rows = VR.Engine.rowsOf(grid);

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const cell = grid[c][r];
        if (!cell) continue;
        const rect = cellRect(c, r);
        let yOff = 0;
        if (spinOffset && spinOffset[c] != null) yOff = spinOffset[c];
        const key = c + "," + r;
        if (flashCells.has(key) || goldCells.has(key)) {
          roundRect(rect.x - 1, rect.y - 1 + yOff, rect.w + 2, rect.h + 2, 8);
          ctx.fillStyle = goldCells.has(key) ? "rgba(251,191,36,0.28)" : "rgba(56,189,248,0.2)";
          ctx.fill();
        }
        const extra = Object.assign({}, cell, { _key: key });
        ctx.save();
        if (flashCells.size && !flashCells.has(key)) ctx.globalAlpha = 0.32;
        if (animCells.has(key)) {
          const pulse = 1 + 0.045 * Math.sin(Math.min(1, (performance.now() - revealStart) / 900) * Math.PI);
          ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
          ctx.scale(pulse, pulse);
          ctx.translate(-rect.x - rect.w / 2, -rect.y - rect.h / 2);
        }
        drawSymbol(cell.id, rect.x, rect.y + yOff, rect.w, rect.h, extra);
        ctx.restore();
      }
    }
  }

  // The strip is presentation only. No RNG calls or result mutation occur here.
  // Time-based displacement keeps the same travel at 60, 90 and 120 Hz.
  async function animateSpin(fromGrid, suppliedGrid, duration = 2100, opts = {}) {
    clearFlash();
    clearAnim();
    const cols = fromGrid.length;
    const rows = VR.Engine.rowsOf(fromGrid);
    setRows(rows);
    const started = performance.now();
    const ids = Object.keys(VR.CONFIG.baseWeights).map(id => ({ id }));
    const speed = 0.018;
    const accel = 130, settle = 150;
    const stagger = Math.min(150, duration * 0.075);
    const brake = Math.min(430, duration * 0.3);
    let target = null, failure = null, arrived = 0;
    Promise.resolve(suppliedGrid).then(grid => {
      if (!Array.isArray(grid) || grid.length !== cols || grid.some(col =>
        !Array.isArray(col) || col.length !== rows || col.some(cell => !cell || !cell.id))) {
        throw new Error('Invalid reel result');
      }
      target = grid;
      arrived = performance.now() - started;
    }).catch(err => { failure = err; });
    const reels = Array.from({ length: cols }, (_, c) => ({
      delay: c * 38, brakeAt: null, end: 0, distance: 0, full: false, stopped: false, begun: false, braking: false
    }));
    const travel = t => t <= 0 ? 0 : t < accel
      ? speed * accel * Math.pow(t / accel, 3) / 3 - 0.075 * Math.sin(Math.PI * t / accel)
      : speed * (t - accel + accel / 3);
    emit('SpinStarted');
    return new Promise((resolve, reject) => {
      function frame(now) {
        if (failure) { drawFrame(fromGrid); reject(failure); return; }
        const elapsed = now - started;
        drawFrame(null);
        let done = true;
        reels.forEach((reel, c) => {
          const local = elapsed - reel.delay;
          if (local >= 0 && !reel.begun) { reel.begun = true; emit('ReelStarted', { reel: c }); }
          if (local >= accel && !reel.full) { reel.full = true; emit('ReelFullSpeed', { reel: c }); }
          if (target && reel.brakeAt === null) {
            reel.brakeAt = Math.max(duration - settle - brake - (cols - 1 - c) * stagger,
              arrived + 30 + c * stagger, reel.delay + accel);
            reel.distance = travel(reel.brakeAt - reel.delay);
            reel.end = Math.ceil(reel.distance + speed * brake / 3);
          }
          let position = travel(local), velocity = local < accel ? speed * Math.pow(Math.max(0, local) / accel, 2) : speed;
          let impact = 0;
          if (reel.brakeAt !== null && elapsed >= reel.brakeAt) {
            if (!reel.braking) { reel.braking = true; emit('ReelDecelerationStarted', { reel: c }); }
            const u = Math.min(1, (elapsed - reel.brakeAt) / brake);
            // Cubic Hermite: continuous velocity at entry, zero velocity at target.
            const delta = reel.end - reel.distance;
            position = reel.distance + delta * (3*u*u - 2*u*u*u) + speed * brake * (u*u*u - 2*u*u + u);
            velocity = (delta * (6*u - 6*u*u) + speed * brake * (3*u*u - 4*u + 1)) / brake;
            if (u === 1) {
              const v = Math.min(1, (elapsed - reel.brakeAt - brake) / settle);
              impact = Math.sin(v * Math.PI * 2) * Math.exp(-v * 4);
              position = reel.end + 0.055 * impact;
              if (v === 1 && !reel.stopped) {
                reel.stopped = true;
                emit('ReelStopped', { reel: c });
                if (opts.onReelStopped) opts.onReelStopped(c);
              }
            }
          }
          if (!reel.stopped) done = false;
          const floor = Math.floor(position);
          ctx.save();
          const rect = cellRect(c, 0);
          ctx.beginPath();
          ctx.rect(rect.x, pad, cellW, rows * (cellH + pad) - pad);
          ctx.clip();
          for (let row = -1; row <= rows; row++) {
            const index = row - floor;
            let cell;
            if (target && index >= -reel.end && index < -reel.end + rows) cell = target[c][index + reel.end];
            else if (index >= 0 && index < rows) cell = fromGrid[c][index];
            else cell = ids[((index * 7 + c * 3) % ids.length + ids.length) % ids.length];
            if (!cell) continue;
            const y = pad + (row + position - floor) * (cellH + pad);
            // Directional trails use the same sprite: no costly per-frame blur filters.
            const blur = Math.min(1, Math.max(0, velocity / speed));
            if (blur > 0.15) {
              ctx.globalAlpha = 0.065 * blur;
              drawSymbol(cell.id, rect.x, y - blur * cellH * 0.16, cellW, cellH, cell);
              drawSymbol(cell.id, rect.x, y + blur * cellH * 0.16, cellW, cellH, cell);
            }
            ctx.globalAlpha = 1 - 0.15 * blur;
            drawSymbol(cell.id, rect.x, y, cellW, cellH * (1 - 0.025 * impact), cell);
          }
          ctx.restore();
        });
        if (!done) requestAnimationFrame(frame);
        else { drawFrame(target); emit('AllReelsStopped'); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }

  // Server tumble grids contain holes. Survivors retain their exact order and
  // fall to the bottom; new supplied symbols enter above the clipped viewport.
  async function animateTumble(fromGrid, toGrid, duration = 570) {
    clearFlash();
    const rows = VR.Engine.rowsOf(toGrid);
    const starts = fromGrid.map(col => {
      const survivors = col.map((cell, r) => cell ? r : -1).filter(r => r >= 0);
      const missing = rows - survivors.length;
      return Array.from({ length: rows }, (_, r) => r < missing ? r - missing : survivors[r - missing]);
    });
    const start = performance.now();
    return new Promise(resolve => {
      function frame(now) {
        drawFrame(null);
        toGrid.forEach((col, c) => {
          ctx.save();
          const rect = cellRect(c, 0);
          ctx.beginPath(); ctx.rect(rect.x, pad, cellW, rows * (cellH + pad) - pad); ctx.clip();
          col.forEach((cell, r) => {
            const t = Math.max(0, Math.min(1, (now - start - c * 22) / (duration - 100)));
            // Accelerate under gravity, then absorb the landing over the final 20%.
            const u = Math.min(1, t / 0.8);
            const fall = u * u * (3 - 2 * u);
            const settle = t > 0.8 ? Math.sin((t - 0.8) / 0.2 * Math.PI) * 0.035 : 0;
            const y = pad + (starts[c][r] + (r - starts[c][r]) * fall + (starts[c][r] !== r ? settle : 0)) * (cellH + pad);
            if (cell) drawSymbol(cell.id, rect.x, y, cellW, cellH, cell);
          });
          ctx.restore();
        });
        if (now - start < duration) requestAnimationFrame(frame);
        else { drawFrame(toGrid); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }

  function drawWinConnections(now) {
    const colors = ['#ffe49a', '#6ee7ff', '#e6acff'];
    // Ways have multiple hits on a reel, not fixed paylines. Connect every
    // participating cell only between adjacent reels of the same supplied win.
    winGroups.forEach((win, wi) => {
      const color = colors[wi % colors.length];
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.globalAlpha = 0.6 + 0.3 * Math.sin((now - revealStart) / 180);
      const positions = win.positions || [];
      for (const a of positions) for (const b of positions) {
        if (b.c !== a.c + 1) continue;
        const ra = cellRect(a.c, a.r), rb = cellRect(b.c, b.r);
        ctx.beginPath(); ctx.moveTo(ra.x + ra.w / 2, ra.y + ra.h / 2);
        ctx.lineTo(rb.x + rb.w / 2, rb.y + rb.h / 2); ctx.stroke();
      }
      ctx.restore();
    });
    for (const key of flashCells) {
      const [c, r] = key.split(',').map(Number), rect = cellRect(c, r);
      ctx.save();
      ctx.strokeStyle = '#ffdf89'; ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ffbf47'; ctx.shadowBlur = 16;
      roundRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4, 10); ctx.stroke();
      ctx.restore();
    }
  }

  async function animateRemove(grid, positions, duration = 220) {
    const keys = new Set(positions.map(p => p.c + ',' + p.r));
    const start = performance.now();
    return new Promise(resolve => {
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        drawFrame(null);
        grid.forEach((col, c) => col.forEach((cell, r) => {
          if (!cell) return;
          const rect = cellRect(c, r), removed = keys.has(c + ',' + r);
          ctx.save();
          if (removed) {
            ctx.globalAlpha = 1 - t;
            ctx.translate(rect.x + cellW / 2, rect.y + cellH / 2);
            ctx.scale(1 + t * 0.18, 1 + t * 0.18);
            ctx.translate(-rect.x - cellW / 2, -rect.y - cellH / 2);
          }
          drawSymbol(cell.id, rect.x, rect.y, cellW, cellH, cell);
          ctx.restore();
          if (removed) {
            ctx.save(); ctx.fillStyle = '#ffe6a0'; ctx.globalAlpha = 1 - t;
            for (let i = 0; i < 8; i++) {
              const a = i * Math.PI / 4;
              const d = t * Math.min(cellW, cellH) * 0.65;
              ctx.fillRect(rect.x + cellW / 2 + Math.cos(a) * d, rect.y + cellH / 2 + Math.sin(a) * d, 3, 3);
            }
            ctx.restore();
          }
        }));
        if (t < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  /** Symbol win / lock frame animation — slower, readable */
  async function playWinAnim(grid, positions, duration, wins = []) {
    winGroups = wins;
    revealStart = performance.now();
    emit('WinRevealStarted');
    animateCells(positions);
    const start = performance.now();
    const longest = Math.max(1, ...positions.map(p => VR.Assets.frameCount(grid[p.c]?.[p.r]?.id)));
    const ms = Math.max(duration || 900, longest * 65 + 160);
    return new Promise((resolve) => {
      function frame(now) {
        drawFrame(grid);
        drawWinConnections(now);
        if (now - start < ms) requestAnimationFrame(frame);
        else {
          clearAnim();
          drawFrame(grid);
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  return {
    init,
    resize,
    setRows,
    drawFrame,
    animateSpin,
    animateTumble,
    animateRemove,
    playWinAnim,
    setFlash,
    setGold,
    clearFlash,
    animateCells,
    clearAnim
  };
})();
