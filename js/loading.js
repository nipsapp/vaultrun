window.VR = window.VR || {};
VR.Loading = (() => {
  const screen = document.getElementById('loading-screen');
  const button = document.getElementById('enter-vault');
  let current = 0;
  function progress(value, label) {
    current = Math.max(current, Math.min(100, Math.round(value)));
    document.getElementById('load-fill').style.transform = `scaleX(${current / 100})`;
    document.getElementById('load-progress').setAttribute('aria-valuenow', String(current));
    document.getElementById('load-percent').textContent = current + '%';
    document.getElementById('load-label').textContent = label;
  }
  // Decode the two shared artwork files before revealing the game. Failure is
  // non-blocking; the CSS cabinet and accessible title remain available.
  const artReady = Promise.all(['vault-title-v2.webp', 'vault-frame-v2.webp'].map(file => new Promise(resolve => {
    const img = new Image();
    const timer = setTimeout(resolve, 10000);
    img.onload = img.onerror = () => { clearTimeout(timer); resolve(); };
    img.src = 'assets/casino/' + file;
  })));
  async function finish() {
    await artReady;
    progress(100, 'Your vault is ready');
    button.disabled = false;
    button.textContent = 'ENTER THE VAULT';
    screen.classList.add('is-ready');
    return new Promise(resolve => button.addEventListener('click', () => {
      VR.Audio.unlock();
      document.getElementById('app').inert = false;
      document.body.classList.remove('is-loading');
      screen.classList.add('is-leaving');
      screen.inert = true;
      document.getElementById('btn-spin').focus({ preventScroll: true });
      setTimeout(() => { screen.hidden = true; }, 650);
      resolve();
    }, { once: true }));
  }
  return { progress, finish };
})();
