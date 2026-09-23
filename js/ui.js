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

    document.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        handlers.spin();
      }
    });
  }

  function openPanel(id) {
    closePanels();
    const el = $("#panel-" + id);
    if (el) {
      el.classList.add("open");
      $("#overlay").classList.add("open");
    }
  }

  function closePanels() {
    $$(".panel").forEach((p) => p.classList.remove("open"));
    $("#overlay").classList.remove("open");
    $("#win-banner").classList.remove("show");
  }

  function refresh(state) {
    $("#bal-val").textContent = money(state.balance);
    $("#bet-val").textContent = money(state.bet);
    $("#win-val").textContent = money(state.lastWin);

    const spinBtn = $("#btn-spin");
    spinBtn.classList.toggle("busy", state.busy);
    spinBtn.disabled = state.busy;
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

  function showWinBanner(amount, bet, kind) {
    const el = $("#win-banner");
    const mult = amount / Math.max(bet, 0.0001);
    let title = "WIN";
    if (kind === "bonus") title = "BONUS PAYOUT";
    else if (mult >= 50) title = "EPIC WIN";
    else if (mult >= 20) title = "MEGA WIN";
    else if (mult >= 8) title = "BIG WIN";
    $("#win-banner-title").textContent = title;
    $("#win-banner-amount").textContent = money(amount);
    el.classList.add("show");
    return new Promise((res) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.classList.remove("show");
        el.removeEventListener("click", finish);
        res();
      };
      el.addEventListener("click", finish);
      setTimeout(finish, mult >= 8 ? 2200 : 1200);
    });
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
    return new Promise((res) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.classList.remove("show");
        el.removeEventListener("click", finish);
        res();
      };
      el.addEventListener("click", finish);
      setTimeout(finish, 2200);
    });
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
