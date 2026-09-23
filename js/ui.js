/**
 * Vault Run — HUD / panels
 */
window.VR = window.VR || {};

VR.UI = (function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  function money(n) {
    return (Math.round(n * 100) / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function artPath(id) {
    const alias = (VR.CONFIG.artAlias && VR.CONFIG.artAlias[id]) || id;
    return "assets/casino/symbols-hq/" + alias + "/00.webp";
  }

  function fillPayTable() {
    const tbody = $("#rules-pay-table tbody");
    if (!tbody || tbody.dataset.ready === "1") return;
    const order = ["H1", "H2", "H3", "H4", "H5", "L1", "L2", "L3", "L4"];
    const pays = VR.CONFIG.pays || {};
    const symbols = VR.CONFIG.symbols || {};
    tbody.innerHTML = order
      .filter((id) => pays[id])
      .map((id) => {
        const name = (symbols[id] && symbols[id].name) || id;
        const row = pays[id];
        const fmt = (n) => (Number(n) % 1 === 0 ? n + "×" : n + "×");
        return (
          "<tr>" +
          '<td><span class="sym-cell"><img src="' +
          artPath(id) +
          '" alt="" width="40" height="40" loading="lazy" /><span>' +
          name +
          "</span></span></td>" +
          '<td class="pay-val">' +
          fmt(row[2]) +
          "</td>" +
          '<td class="pay-val">' +
          fmt(row[3]) +
          "</td>" +
          '<td class="pay-val">' +
          fmt(row[4]) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    tbody.dataset.ready = "1";
  }

  function setRulesTab(tabId) {
    const id = tabId || "play";
    $$(".rules-tab").forEach((btn) => {
      const on = btn.getAttribute("data-rules-tab") === id;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", String(on));
    });
    $$(".rules-pane").forEach((pane) => {
      const on = pane.getAttribute("data-rules-pane") === id;
      pane.classList.toggle("active", on);
      pane.hidden = !on;
    });
    if (id === "pays") fillPayTable();
    const body = $("#panel-info .rules-body");
    if (body) body.scrollTop = 0;
  }

  function bindRulesTabs() {
    $$("[data-rules-tab]").forEach((btn) => {
      btn.addEventListener("click", () => setRulesTab(btn.getAttribute("data-rules-tab")));
    });
  }

  function bind(state, handlers) {
    $("#btn-spin").addEventListener("click", () => handlers.spin());
    $("#btn-bet-minus").addEventListener("click", () => handlers.bet(-1));
    $("#btn-bet-plus").addEventListener("click", () => handlers.bet(1));
    $("#btn-auto").addEventListener("click", () => handlers.toggleAuto());
    $("#btn-buy").addEventListener("click", () => openPanel("buy"));
    $("#btn-info").addEventListener("click", () => openPanel("info"));
    $("#btn-mute").addEventListener("click", () => handlers.mute());
    $("#btn-menu").addEventListener("click", () => openPanel("menu"));

    $$("[data-close]").forEach((el) => el.addEventListener("click", () => closePanels()));

    $$("[data-buy]").forEach((el) => {
      el.addEventListener("click", () => {
        handlers.buy(el.getAttribute("data-buy"));
        closePanels();
      });
    });

    $$("[data-auto]").forEach((el) => {
      el.addEventListener("click", () => {
        handlers.setAuto(+el.getAttribute("data-auto"));
        closePanels();
      });
    });

    $$("[data-enhanced]").forEach((el) => {
      el.addEventListener("click", () => {
        handlers.enhanced(el.getAttribute("data-enhanced"));
        closePanels();
      });
    });

    bindRulesTabs();

    document.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !e.repeat && state.ready && !state.busy &&
          !document.querySelector('.panel.open, .win-banner.show, .bonus-intro.show') &&
          !e.target.closest('button, input, select, textarea, [contenteditable]')) {
        e.preventDefault();
        handlers.spin();
      }
      if (e.code === "Escape") closePanels();
    });
  }

  function openPanel(id) {
    closePanels();
    const el = $("#panel-" + id);
    if (el) {
      openPanel.trigger = document.activeElement;
      el.classList.add("open");
      $("#overlay").classList.add("open");
      if (id === "info") setRulesTab("play");
      const closeButton = el.querySelector("[data-close]");
      if (closeButton) requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
    }
  }

  function closePanels() {
    const wasOpen = !!document.querySelector(".panel.open");
    $$(".panel").forEach((p) => p.classList.remove("open"));
    $("#overlay").classList.remove("open");
    if (wasOpen && openPanel.trigger?.isConnected) openPanel.trigger.focus({ preventScroll: true });

  }

  function refresh(state) {
    $("#bal-val").textContent = money(state.balance);
    $("#bet-val").textContent = money(state.bet);
    $("#win-val").textContent = money(state.lastWin);

    const spinBtn = $("#btn-spin");
    spinBtn.classList.toggle("busy", state.busy);
    spinBtn.disabled = state.busy;
    $("#btn-bet-minus").disabled = state.busy || state.betIndex <= 0;
    $("#btn-bet-plus").disabled = state.busy || state.betIndex >= VR.CONFIG.betSteps.length - 1;
    $("#btn-buy").disabled = state.busy;
    $("#btn-auto").disabled = state.busy && !state.autoLeft;
    $("#btn-auto").setAttribute('aria-label', state.autoLeft > 0 ? 'Stop autoplay' : 'Autoplay');
    const autoLabel = $("#auto-label");
    if (autoLabel) autoLabel.textContent = state.autoLeft > 0 ? 'STOP' : 'AUTO';
    spinBtn.setAttribute("aria-busy", String(state.busy));
    spinBtn.classList.toggle("bonus", state.inBonus);
    $("#btn-auto").classList.toggle("active", state.autoLeft > 0);
    $("#auto-left").textContent = state.autoLeft > 0 ? state.autoLeft : "";
    $("#btn-mute").textContent = state.muted ? "🔇" : "🔊";

    if (state.inBonus) {
      $("#bonus-bar").classList.add("show");
      $("#bonus-name").textContent = state.bonusName;
      $("#bonus-spins").textContent = state.bonusSpinsLeft + " SPINS";
    } else {
      $("#bonus-bar").classList.remove("show");
    }

    const b = state.bet;
    const setCost = (sel, mult) => {
      const el = $(sel);
      if (el) el.textContent = money(b * mult);
    };
    const modes = VR.CONFIG.modes || {};
    if (modes.bonus) setCost("#cost-bonus", modes.bonus.cost);
    if (modes.bonus_max) setCost("#cost-bonus-max", modes.bonus_max.cost);
    if (modes.super) setCost("#cost-super", modes.super.cost);
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2000);
  }

  async function finishEffects(el) {
    // Flush the class change, then await finite Web Animations / CSS transitions.
    void el.offsetWidth;
    const effects = el.getAnimations ? el.getAnimations({ subtree: true }) : [];
    await Promise.all(effects.filter(a => a.effect?.getTiming().iterations !== Infinity)
      .map(a => a.finished.catch(() => {})));
  }

  function hold(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function countAmount(el, amount) {
    if (typeof requestAnimationFrame !== 'function' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = money(amount);
      return Promise.resolve();
    }
    return new Promise(resolve => {
      let start;
      function frame(now) {
        if (start === undefined) start = now;
        const t = Math.min(1, (now - start) / 1000);
        el.textContent = money(amount * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(frame);
        else { el.textContent = money(amount); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }

  function showWinBanner(amount, bet, kind) {
    const el = $("#win-banner");
    const mult = amount / Math.max(bet, 0.0001);
    let title = "WIN";
    if (kind === "bonus") title = "BONUS PAYOUT";
    else if (mult >= 50) title = "EPIC WIN";
    else if (mult >= 20) title = "MEGA WIN";
    else if (mult >= 8) title = "BIG WIN";
    $("#win-banner-title").textContent = title;
    const counting = countAmount($("#win-banner-amount"), amount);
    el.classList.add("show");
    return (async () => {
      await Promise.all([counting, finishEffects(el), hold(mult >= 8 ? 2600 : 1600)]);
      el.classList.remove("show");
      await finishEffects(el);
    })();
  }

  function showBonusIntro(bonus) {
    const el = $("#bonus-intro");
    const name = (bonus && bonus.name) || "Vault Breach";
    const spins = (bonus && bonus.spins) || 8;
    const gauge = (bonus && bonus.gauge) || 1;
    $("#bonus-intro-title").textContent = name.toUpperCase();
    $("#bonus-intro-sub").textContent =
      spins + " Free Spins  ·  Vault Gauge " + gauge;
    el.classList.add("show");
    return (async () => {
      await Promise.all([finishEffects(el), hold(2400)]);
      el.classList.remove("show");
      await finishEffects(el);
    })();
  }

  function setStatus(text) {
    $("#status-line").textContent = text || "";
  }

  return {
    bind,
    refresh,
    toast,
    showWinBanner,
    showBonusIntro,
    setStatus,
    openPanel,
    closePanels,
    money
  };
})();
