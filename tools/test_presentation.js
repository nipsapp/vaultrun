const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');
function engine() {
  const VR = {};
  const scope = { VR, window: { VR }, console };
  vm.createContext(scope);
  for (const f of ['config', 'engine']) vm.runInContext(source('js/' + f + '.js'), scope);
  return { VR, scope };
}
async function rendererTest(hz, delayed = false) {
  const { VR, scope } = engine();
  let clock = 0, queued = [], events = [], drawn = [];
  const canvasContext = new Proxy({}, { get: (_, key) => (...args) => {
    if (key === 'fillRect' && args[0] === 0 && args[1] === 0) drawn = [];
  }, set: () => true });
  Object.assign(scope, {
    performance: { now: () => clock },
    requestAnimationFrame: cb => queued.push(cb),
    CustomEvent: class { constructor(type, init) { this.detail = init.detail; } }
  });
  Object.assign(scope.window, { devicePixelRatio: 1, addEventListener() {}, dispatchEvent: event => events.push(event.detail) });
  VR.Assets = { getUi: () => null, getSymbolFrame: id => { drawn.push(id); return { width: 64, height: 64 }; }, frameCount: () => 4 };
  vm.runInContext(source('js/render.js'), scope);
  VR.Render.init({ parentElement: { clientWidth: 600, clientHeight: 480 }, style: {}, getContext: () => canvasContext });
  VR.Engine.seed(123);
  const from = VR.Engine.playSpin({bet:1}).steps[0].grid;
  const to = VR.Engine.playSpin({bet:1}).steps[0].grid;
  const before = JSON.stringify({ from, to });
  let supply;
  const target = delayed ? new Promise(r => { supply = r; }) : to;
  const stops = [];
  let complete = false;
  const promise = VR.Render.animateSpin(from, target, 2100, { onReelStopped: c => stops.push(c) }).then(() => { complete = true; });
  while (!complete && clock < 7000) {
    clock += 1000 / hz;
    if (supply && clock >= 2500) { supply(to); supply = null; }
    await Promise.resolve(); await Promise.resolve();
    const batch = queued; queued = [];
    batch.forEach(cb => cb(clock));
  }
  await promise;
  assert.equal(JSON.stringify({ from, to }), before, 'renderer must not mutate supplied grids');
  assert.deepEqual(stops, [0, 1, 2, 3, 4], 'each reel stops once, left to right');
  assert.deepEqual(drawn, Array.from(to.flat(), cell => cell.id), 'final drawn symbols equal supplied result');
  assert.equal(events.filter(e => e.name === 'AllReelsStopped').length, 1);
  assert.ok(clock < (delayed ? 4000 : 2200));
  let rejected = false;
  const failure = VR.Render.animateSpin(from, Promise.reject(new Error('network failed'))).catch(() => { rejected = true; });
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    const batch = queued; queued = []; batch.forEach(cb => cb(clock += 17));
  }
  await failure;
  assert.ok(rejected, 'network error rejects animation');
  assert.deepEqual(drawn, Array.from(from.flat(), cell => cell.id), 'failure restores previous board');
  console.log(`OK renderer ${hz} Hz${delayed ? ' / delayed response' : ''}`);
}
async function timelineTest(mode, auto = 0, stopInGap = false) {
  const { VR, scope } = engine();
  let handlers, lastDisplayed, lastResolved, reveals = 0, tumbles = 0, paid = 0;
  VR.Engine.seed(7);
  const resolve = VR.Engine.playSpin;
  VR.Engine.playSpin = opts => { const result = resolve(opts); if (handlers) { paid++; lastResolved = result; } return result; };
  VR.Assets = { init: async () => {} };
  VR.API = { probe: async () => false };
  VR.Audio = new Proxy({}, { get: () => () => {} });
  VR.Render = {
    init() {}, setRows() {}, clearFlash() {}, clearAnim() {}, setFlash() {},
    drawFrame(grid) { if (grid) lastDisplayed = grid; },
    async animateSpin(from, pending) {
      assert.equal(JSON.stringify(from), JSON.stringify(lastDisplayed), 'spin begins from previous displayed board');
      lastDisplayed = await pending;
    },
    async playWinAnim(grid, positions, duration, wins) {
      if (wins) {
        reveals++;
        for (const p of positions) assert.ok(grid[p.c][p.r], 'winning symbols remain visible during reveal');
      }
    },
    async animateRemove() {},
    async animateTumble(from, to) {
      tumbles++;
      assert.ok(from.flat().some(cell => cell === null), 'cascade starts from exploded grid');
      assert.notEqual(from, to, 'cascade must not overwrite source before animation');
      lastDisplayed = to;
    }
  };
  VR.UI = new Proxy({
    bind(state, bound) { handlers = bound; }, money: n => String(n)
  }, { get: (obj, key) => obj[key] || (async () => {}) });
  Object.assign(scope, {
    document: { body: { classList: { add() {} }, addEventListener() {} }, getElementById() {}, addEventListener() {} },
    navigator: {}, setInterval() {}, setTimeout(cb, ms) {
      if (ms === 650) {
        assert.equal(VR.App.state.busy, true, 'autoplay gap retains input lock');
        const before = paid;
        handlers.spin();
        assert.equal(paid, before, 'manual input cannot race an autoplay gap');
        if (stopInGap) handlers.toggleAuto();
      }
      if (ms < 1000) queueMicrotask(cb);
    }
  });
  vm.runInContext(source('js/app.js'), scope);
  await VR.App.init();
  if (auto) handlers.setAuto(auto);
  else if (mode === 'base') await handlers.spin();
  else handlers.buy(mode);
  for (let i = 0; i < 10000 && (VR.App.state.busy || VR.App.state.autoLeft); i++) await Promise.resolve();
  assert.equal(VR.App.state.busy, false, 'timeline completes');
  assert.equal(paid, stopInGap ? 1 : auto || 1, 'autoplay runs exactly requested number');
  assert.equal(VR.App.state.lastWin, lastResolved.totalWin);
  assert.equal(JSON.stringify(VR.App.state.grid), JSON.stringify(lastResolved.grid));
  if (!stopInGap && (mode !== 'base' || auto)) { assert.ok(reveals > 0); assert.ok(tumbles > 0); }
  console.log(`OK timeline ${mode}, ${paid} spin(s), ${reveals} win reveals / ${tumbles} tumbles`);
}
(async () => {
  for (const hz of [60, 90, 120]) await rendererTest(hz);
  await rendererTest(60, true);
  await timelineTest('base', 10);
  await timelineTest('base', 10, true);
  await overlayTest();
  await autoplayCelebrationTest();
  for (const mode of ['bonus', 'bonus_max', 'super']) await timelineTest(mode);
  const { playSpinWithRng } = require('../server/src/game/engineBridge');
  let calls = 0;
  const rng = () => { let n = 123; return { nextFloatSync() { calls++; n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; } }; };
  const nativeRandom = Math.random;
  const a = playSpinWithRng({ bet: 1 }, rng());
  const b = playSpinWithRng({ bet: 1 }, rng());
  assert.ok(calls > 0, 'server consumes supplied RNG');
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'same external RNG stream gives same result');
  assert.equal(Math.random, nativeRandom, 'server restores native RNG');
  assert.throws(() => playSpinWithRng({bet: 1}, {}), /RNG stream/);
  assert.equal(Math.random, nativeRandom, 'server restores RNG after failure');
  console.log('OK authoritative RNG stream and error cleanup');
})().catch(err => { console.error(err); process.exitCode = 1; });



async function overlayTest() {
  let releaseEntrance, releaseExit, releaseHold, shown = false, complete = false;
  const entrance = new Promise(r => { releaseEntrance = r; });
  const exit = new Promise(r => { releaseExit = r; });
  const el = {
    classList: { add() { shown = true; }, remove() { shown = false; } },
    getAnimations() { return [{ effect: { getTiming: () => ({ iterations: 1 }) }, finished: shown ? entrance : exit }]; },
    offsetWidth: 200
  };
  const VR = {};
  const scope = { VR, window: { VR }, document: { querySelector: () => el }, setTimeout(cb) { releaseHold = cb; } };
  vm.createContext(scope);
  vm.runInContext(source('js/ui.js'), scope);
  const result = VR.UI.showWinBanner(20, 1, 'base').then(() => { complete = true; });
  releaseEntrance();
  await Promise.resolve();
  assert.equal(shown, true, 'celebration stays visible until its hold finishes');
  assert.equal(complete, false, 'entrance alone cannot settle the celebration');
  releaseHold();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(shown, false, 'overlay begins exiting');
  assert.equal(complete, false, 'playback waits for exit animation');
  releaseExit();
  await result;
  assert.equal(complete, true);
  console.log('OK overlay entrance and exit settlement');
}

async function autoplayCelebrationTest() {
  const { VR, scope } = engine();
  const grid = VR.Engine.createEmptyGrid();
  let handlers, spins = 0, banners = 0, releaseFirstBanner;
  VR.Engine.playSpin = () => {
    if (handlers) spins++;
    return { grid, steps: [{ type: 'spin', grid }, { type: 'pay' }], totalWin: 20 };
  };
  VR.Assets = { init: async () => {} };
  VR.API = { probe: async () => false };
  VR.Audio = new Proxy({}, { get: () => () => {} });
  VR.Render = new Proxy({}, { get: (_, key) => key === 'animateSpin' ? async () => {} : () => {} });
  VR.UI = new Proxy({
    bind(state, bound) { handlers = bound; },
    money: n => String(n),
    showWinBanner() {
      banners++;
      return banners === 1 ? new Promise(resolve => { releaseFirstBanner = resolve; }) : Promise.resolve();
    }
  }, { get: (obj, key) => obj[key] || (() => {}) });
  Object.assign(scope, {
    document: { body: { classList: { add() {} }, addEventListener() {} }, getElementById() {}, addEventListener() {} },
    navigator: {}, setInterval() {}, setTimeout(cb, ms) { if (ms < 1000) queueMicrotask(cb); }
  });
  vm.runInContext(source('js/app.js'), scope);
  await VR.App.init();
  handlers.setAuto(2);
  for (let i = 0; i < 100 && !releaseFirstBanner; i++) await Promise.resolve();
  assert.equal(spins, 1);
  assert.equal(VR.App.state.busy, true);
  for (let i = 0; i < 100; i++) await Promise.resolve();
  assert.equal(spins, 1, 'autoplay cannot spin while a win banner is still active');
  releaseFirstBanner();
  for (let i = 0; i < 300 && VR.App.state.busy; i++) await Promise.resolve();
  assert.equal(spins, 2, 'autoplay resumes after celebration settles');
  assert.equal(VR.App.state.busy, false);
  console.log('OK autoplay waits for win celebration');
}
