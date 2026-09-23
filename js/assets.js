/** Compact, web-ready symbol frames. Original art remains in assets/antique. */
window.VR = window.VR || {};

VR.Assets = (function () {
  const BASE = "assets/casino/";
  const symbolFrames = {};
  let ready = false;
  const bounds = new WeakMap();

  function loadImage(path) {
    return new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => resolve(null), 12000);
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.src = BASE + path;
    });
  }

  async function init(onProgress = () => {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response;
    try { response = await fetch(BASE + "manifest-hq.json", { signal: controller.signal }); }
    finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error("Symbol manifest unavailable");
    const manifest = await response.json();
    const total = Object.values(manifest.symbols).reduce((n, paths) => n + paths.length, 0);
    let loaded = 0;
    onProgress(0);
    await Promise.all(Object.entries(manifest.symbols).map(async ([id, paths]) => {
      symbolFrames[id] = await Promise.all(paths.map(async path => { const image = await loadImage(path); onProgress(++loaded / Math.max(1, total)); return image; }));
      for (const image of symbolFrames[id]) {
        if (image && manifest.bounds?.[id]) bounds.set(image, manifest.bounds[id]);
      }
    }));
    ready = true;
  }

  function getSymbolFrame(id, frameIndex, animating) {
    const alias = (VR.CONFIG && VR.CONFIG.artAlias && VR.CONFIG.artAlias[id]) || id;
    const frames = symbolFrames[alias] || symbolFrames[id];
    if (!frames || !frames.length) return null;
    const idle = alias === "COIN" ? 3 : 0;
    const index = animating ? (idle + Math.abs(frameIndex | 0)) % frames.length : idle;
    return frames[index] || frames[0] || null;
  }

  return {
    init,
    getSymbolFrame,
    getSymbolBounds: image => bounds.get(image),
    getUi: () => null,
    isReady: () => ready,
    frameCount: (id) => (symbolFrames[(VR.CONFIG.artAlias || {})[id] || id] || []).length,
    BASE
  };
})();
