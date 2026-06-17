'use strict';
/* ui — DOM overlays, toasts, settings wiring, key-rebind rows. Private: the
   toast timer + which overlay opened settings/credits. Reaches game()/audio()/
   render()/input() and the save() store through function calls. */
RB.define('ui', function (require) {
  const Save = require('save');
  const game = () => require('game');
  const audio = () => require('audio');
  const render = () => require('render');
  const input = () => require('input');

  const UI = {
    el(id) { return document.getElementById(id); },
    show(id) { this.el(id).classList.add('show'); },
    hide(id) { this.el(id).classList.remove('show'); },
    hideAll() { document.querySelectorAll('.overlay').forEach(o => o.classList.remove('show')); },
    toastT: null, settingsFrom: 'mainMenu', creditsFrom: 'mainMenu',
    toast(msg, secs = 2.5) {
      const t = this.el('toast'); t.textContent = msg; t.style.opacity = 1;
      clearTimeout(this.toastT); this.toastT = setTimeout(() => t.style.opacity = 0, secs * 1000);
    },
    flashTp() { render().tpFlash = 0.3; },
    refreshBinds() {
      const Input = input();
      const rows = this.el('bindRows'); rows.innerHTML = '';
      for (const k of Object.keys(Input.BIND_LABELS)) {
        const div = document.createElement('div'); div.className = 'srow';
        const lab = document.createElement('label'); lab.textContent = Input.BIND_LABELS[k];
        const btn = document.createElement('button'); btn.className = 'bindbtn';
        btn.textContent = Input.listenTarget === k ? 'press a key…' :
          Input.binds[k].replace('Key', '').replace('Left', ' L').replace('Right', ' R');
        if (Input.listenTarget === k) btn.classList.add('listening');
        btn.onclick = () => { Input.listenTarget = k; this.refreshBinds(); };
        div.appendChild(lab); div.appendChild(btn); rows.appendChild(div);
      }
    },
    updateBossRushBtn() {
      const b = this.el('btnBossRush');
      b.disabled = !Save.bossRushUnlocked;
      b.textContent = Save.bossRushUnlocked ? 'Boss Rush' : 'Boss Rush — locked';
    },
    init() {
      const $ = id => this.el(id);
      const Audio2 = audio(), Game = game(), Input = input();
      $('btnStart').onclick = () => { Audio2.resume(); Game.startCampaign(); };
      $('btnTutorial').onclick = () => { Audio2.resume(); Game.startTutorial(); };
      $('btnBossRush').onclick = () => { Audio2.resume(); if (Save.bossRushUnlocked) Game.startBossRush(); };
      $('btnSettings').onclick = () => { this.hide('mainMenu'); this.show('settingsMenu'); this.settingsFrom = 'mainMenu'; };
      $('btnCreditsMenu').onclick = () => { this.hide('mainMenu'); this.show('creditsOverlay'); this.creditsFrom = 'mainMenu'; };
      $('btnCreditsBack').onclick = () => { this.hide('creditsOverlay'); this.show(this.creditsFrom || 'mainMenu'); };
      $('btnResume').onclick = () => Game.togglePause(false);
      $('btnRestart').onclick = () => Game.retry();
      $('btnPauseSettings').onclick = () => { this.hide('pauseMenu'); this.show('settingsMenu'); this.settingsFrom = 'pauseMenu'; };
      $('btnQuit').onclick = () => Game.toMenu();
      $('btnCloseSettings').onclick = () => { this.hide('settingsMenu'); this.show(this.settingsFrom || 'mainMenu'); };
      $('btnResetBinds').onclick = () => { Input.binds = { ...Input.DEFAULT_BINDS }; this.refreshBinds(); };
      $('btnFullscreen').onclick = () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.getElementById('wrap').requestFullscreen().catch(() => {});
      };
      $('btnRetry').onclick = () => Game.retry();
      $('btnDeathQuit').onclick = () => Game.toMenu();
      $('btnContinue').onclick = () => Game.continueAfterVictory();
      $('btnResultsMenu').onclick = () => Game.toMenu();
      $('btnResultsCredits').onclick = () => { this.hide('resultsOverlay'); this.show('creditsOverlay'); this.creditsFrom = 'resultsOverlay'; };
      const bindSlider = (id, cb) => { const s = $(id), v = $(id + 'V');
        s.oninput = () => { v.textContent = s.value; cb(+s.value); }; };
      bindSlider('volMaster', v => { Audio2.vols.master = v / 100; Audio2.applyVols(); });
      bindSlider('volMusic', v => { Audio2.vols.music = v / 100; Audio2.applyVols(); });
      bindSlider('volSfx', v => { Audio2.vols.sfx = v / 100; Audio2.applyVols(); });
      bindSlider('camSens', v => Game.settings.camSmooth = v);
      const bindToggle = (id, key) => { const t = $(id);
        t.onclick = () => { Game.settings[key] = !Game.settings[key]; t.classList.toggle('on', Game.settings[key]); }; };
      bindToggle('tglShake', 'shake'); bindToggle('tglCB', 'cbSafe');
      const btnMenu = $('btnMenu');
      if (btnMenu) btnMenu.onclick = () => { Audio2.resume(); Game.togglePause(true); };
      const tglM = $('tglMobile');
      if (tglM) {
        tglM.classList.toggle('on', !!Game.settings.mobile);
        tglM.onclick = () => { Game.settings.mobile = !Game.settings.mobile; tglM.classList.toggle('on', Game.settings.mobile); };
      }
      this.refreshBinds();
    }
  };
  return UI;
});
