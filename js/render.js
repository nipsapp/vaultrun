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
    } else if (!ctx) {
      ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    const ir = img.width / img.height;
    const tr = aw / ah;
    let dw, dh;
    if (ir > tr) {
      dw = aw;
      dh = aw / ir;
    } else {
      dh = ah;
      dw = ah * ir;
    }
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
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
      frameIndex = Math.floor(((performance.now() - animCells.get(key).start) / 95) % fc);
    }

    const img = VR.Assets.getSymbolFrame(id, frameIndex, animating);
    const drawn = drawImageContain(img, x, y, w, h, 0.06);

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

    if (id === "WILD" && extra && extra.mult) {
      ctx.font = `900 ${Math.floor(s * 0.22)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#000";
      ctx.fillStyle = "#fde68a";
      const t = extra.mult + "×";
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

    // background art
    const bg = VR.Assets.getUi("bg");
    if (bg) {
      drawImageCover(bg, 0, 0, w, h);
      ctx.fillStyle = "rgba(2,6,23,0.35)";
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = "#0b1224";
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
        drawSymbol(cell.id, rect.x, rect.y + yOff, rect.w, rect.h, extra);
      }
    }
  }

  /**
   * Professional reel spin: staggered L→R stops, ease-out settle, soft bounce.
   * @param {object} fromGrid
   * @param {object} toGrid
   * @param {number} duration total ms until last reel settles (default ~2000)
   * @param {{ respin?: boolean }} opts
   */
  async function animateSpin(fromGrid, toGrid, duration, opts) {
    opts = opts || {};
    const cols = VR.CONFIG.reels;
    const isRespin = !!opts.respin;
    const total = duration || (isRespin ? 1100 : 2000);
    const stagger = isRespin ? 0.07 : 0.11; // portion of timeline between reel starts
    const spinPortion = isRespin ? 0.55 : 0.62; // how long each reel stays blurred
    const start = performance.now();
    const offsets = new Array(cols).fill(0);
    const blurGrid = fromGrid || toGrid;

    return new Promise((resolve) => {
      function frame(now) {
        const t = Math.min(1, (now - start) / total);
        const show = VR.Engine.cloneGrid(toGrid);
        const ids = Object.keys(VR.CONFIG.baseWeights);

        for (let c = 0; c < cols; c++) {
          const reelStart = c * stagger * 0.85;
          const spinLen = 0.58 + c * 0.04;
          const reelEnd = Math.min(0.98, reelStart + spinLen);
          const localSpan = Math.max(0.001, reelEnd - reelStart);
          let localT = (t - reelStart) / localSpan;
          localT = Math.min(1, Math.max(0, localT));

          // Not started yet — hold previous symbols
          if (t < reelStart) {
            offsets[c] = 0;
            for (let r = 0; r < VR.Engine.rowsOf(show); r++) {
              const prev = blurGrid[c] && blurGrid[c][r];
              show[c][r] = prev ? Object.assign({}, prev) : show[c][r];
            }
            continue;
          }

          const land = 1 - Math.pow(1 - localT, 3);

          if (localT < 0.82) {
            const speed = isRespin ? 12 : 20;
            offsets[c] = (1 - land) * speed * Math.sin(now / 24 + c * 1.7);
            for (let r = 0; r < VR.Engine.rowsOf(show); r++) {
              if (toGrid[c][r] && toGrid[c][r].id === "BLOCK") {
                show[c][r] = Object.assign({}, toGrid[c][r]);
                continue;
              }
              if (isRespin && blurGrid[c] && blurGrid[c][r] && blurGrid[c][r].locked) {
                show[c][r] = Object.assign({}, blurGrid[c][r]);
                continue;
              }
              if (toGrid[c][r] && toGrid[c][r].locked && localT > 0.45) {
                show[c][r] = Object.assign({}, toGrid[c][r]);
                continue;
              }
              show[c][r] = { id: ids[(Math.random() * ids.length) | 0] };
            }
          } else {
            const bounceT = (localT - 0.82) / 0.18;
            const bounce = Math.sin(bounceT * Math.PI) * (isRespin ? 3.5 : 6.5) * (1 - bounceT);
            offsets[c] = bounce;
            for (let r = 0; r < VR.Engine.rowsOf(show); r++) {
              show[c][r] = toGrid[c][r] ? Object.assign({}, toGrid[c][r]) : null;
            }
          }
        }

        drawFrame(show, offsets);
        if (t < 1) requestAnimationFrame(frame);
        else {
          drawFrame(toGrid, null);
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  function scramble() {
    /* legacy unused — spin handles scramble inline */
  }

  /** Symbol win / lock frame animation — slower, readable */
  async function playWinAnim(grid, positions, duration) {
    animateCells(positions);
    const start = performance.now();
    const ms = duration || 900;
    return new Promise((resolve) => {
      function frame(now) {
        drawFrame(grid);
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
    playWinAnim,
    setFlash,
    setGold,
    clearFlash,
    animateCells,
    clearAnim
  };
})();
