/** Compact, web-ready symbol frames. Original art remains in assets/antique. */
window.VR = window.VR || {};

VR.Assets = (function () {
  const BASE = "assets/casino/";
  const symbolFrames = {};
  let ready = false;

  function loadImage(path) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = BASE + path;
    });
  }

  async function init() {
    const response = await fetch(BASE + "manifest.json");
    if (!response.ok) throw new Error("Symbol manifest unavailable");
    const manifest = await response.json();
    await Promise.all(Object.entries(manifest.symbols).map(async ([id, paths]) => {
      symbolFrames[id] = await Promise.all(paths.map(loadImage));
    }));
    ready = true;
  }

  function getSymbolFrame(id, frameIndex, animating) {
    const frames = symbolFrames[id];
    if (!frames || !frames.length) return null;
    const index = animating ? Math.abs(frameIndex | 0) % frames.length : 0;
    return frames[index] || frames[0] || null;
  }

  return {
    init,
    getSymbolFrame,
    getUi: () => null,
    isReady: () => ready,
    frameCount: (id) => (symbolFrames[id] || []).length,
    BASE
  };
})();
