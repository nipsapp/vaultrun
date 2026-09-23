/* Vault Run service worker — offline shell for PWA / store WebView */
const CACHE = "vaultrun-v1.9-celebration";
const ASSETS = [
  "./",
  "./index.html",
  "./css/main.css",
  "./css/casino.css",
  "./css/vault-art.css",
  "./css/polish.css",
  "./assets/casino/manifest-hq.json",
  "./js/loading.js",
  "./assets/casino/vault-title-v2.webp",
  "./assets/casino/vault-frame-v2.webp",
  "./assets/casino/vault-cash-chip-v2.webp",
  "./js/config.js",
  "./js/engine.js",
  "./js/assets.js",
  "./js/render.js",
  "./js/audio.js",
  "./js/ui.js",
  "./js/api.js",
  "./js/app.js",
  "./assets/casino/manifest.json",
  "./assets/casino/casino-bg.webp",
  "./assets/casino/vault-emblem.webp",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("vaultrun-") && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(event.request, copy));
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
