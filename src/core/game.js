'use strict';
/* game — top-level state machine + fixed-timestep (60 Hz) loop. Owns mode,
   settings, run stats, the active boss list, and the sim clock. Everything it
   drives (player/weapon/bosses/projectiles/render/input) is reached through
   require() — no globals.

   Encounters are DATA-DRIVEN: the run sequence and every boss's arena theme,
   music, spawn, intro/victory text and results label live in
   CONFIG.encounters. Adding a boss = write one enemies/<id>.js module + add a
   CONFIG.encounters.list[<id>] entry (+ put <id> in CONFIG.encounters.campaign).
   The convention is: an encounter id equals its boss module name AND its boss
   CONFIG key, so the arena is CONFIG[id].arena and the class is require(id). */
RB.define('game', function (require) {
  const CONFIG = require('config');
  const { fmtTime } = require('helpers');
  const Save = require('save');
  const world = () => require('world');
  const player = () => require('player');
  const weapon = () => require('weapon');
  const audio = () => require('audio');
  const ui = () => require('ui');
  const render = () => require('render');
  const input = () => require('input');
  const tutorial = () => require('tutorial');
  const proj = () => require('projectiles');

  const encOf = id => CONFIG.encounters.list[id];

  const Game = {
    mode: 'menu', bosses: [], paused: false, isRush: false,
    settings: { shake: true, cbSafe: true, camSmooth: 55 },
    simTime: 0, fightTime: 0, arenaTheme: 'forge',
    sequence: [], encounterIndex: 0, currentEncounter: null,
    runStats: { deaths: 0, hitsTaken: 0, clearTimes: {} },
    pendingVictory: null,
    inFight() { return this.mode === 'fight'; },
    shardSpeedMult() {
      const c = this.bosses.find(b => b.kind === 'choir');
      return (c && c.fightT > CONFIG.choir.enrageTime) ? CONFIG.choir.enrageShardMult : 1;
    },
    startCampaign() { this.isRush = false; this.resetRun(); this.startRun(CONFIG.encounters.campaign); },
    startBossRush() {
      this.isRush = true; this.resetRun(); this.startRun(CONFIG.encounters.campaign);
      ui().toast('BOSS RUSH — one tally of deaths, no respite', 3.5);
    },
    resetRun() { this.runStats = { deaths: 0, hitsTaken: 0, clearTimes: {} }; },
    startRun(sequence) {
      this.sequence = sequence.slice();
      this.encounterIndex = 0;
      this.startEncounter(this.sequence[0]);
    },
    startTutorial() {
      this.mode = 'tutorial'; this.arenaTheme = 'rift';
      world().reset(CONFIG.tutorial.arena);
      this.bosses = [new (require('dummy'))()];
      player().reset(0, 5);
      tutorial().reset();
      ui().hideAll(); ui().el('objectives').classList.add('show');
      this.paused = false; this.fightTime = 0;
      audio().music('tutorial');
      ui().toast('THE RIFT EFFIGY AWAITS', 2.5);
    },
    startEncounter(id) {
      const enc = encOf(id);
      this.currentEncounter = id;
      this.mode = 'fight'; this.fightTime = 0;
      this.arenaTheme = enc.theme;
      ui().hideAll(); ui().el('objectives').classList.remove('show');
      world().reset(CONFIG[id].arena);
      this.bosses = [new (require(id))()];
      player().reset(enc.spawn[0], enc.spawn[1]);
      audio().music(enc.music);
      ui().toast(enc.intro, 3);
      this.paused = false;
    },
    retry() {
      ui().hideAll();
      if (!this.currentEncounter) { this.startCampaign(); return; } // e.g. restart from the tutorial
      if (this.isRush) { this.encounterIndex = 0; this.startEncounter(this.sequence[0]); }
      else this.startEncounter(this.currentEncounter);
    },
    onPlayerDeath() {
      this.runStats.deaths++;
      audio().sfx('death'); audio().stopMusic();
      setTimeout(() => {
        ui().el('deathSub').textContent = `deaths this run: ${this.runStats.deaths}`;
        ui().show('deathOverlay');
      }, 900);
    },
    onBossDefeated(b) {
      if (b.kind === 'dummy' || b.kind === 'echo') return;
      for (const e of this.bosses) if (e.kind === 'echo' && !e.dead) e.die();
      this.runStats.clearTimes[this.currentEncounter] = this.fightTime;
      audio().stopMusic();
      this.pendingVictory = this.currentEncounter;
      const enc = encOf(this.currentEncounter);
      setTimeout(() => {
        ui().el('victoryText').textContent = enc.victory;
        ui().el('victorySub').textContent = `cleared in ${fmtTime(this.fightTime)} — ${this.runStats.hitsTaken} hits taken this run`;
        ui().show('victoryOverlay');
      }, 1400);
    },
    continueAfterVictory() {
      ui().hideAll();
      const next = this.encounterIndex + 1;
      if (next < this.sequence.length) {
        const carryHp = player().hp;                 // rush: no respite
        this.encounterIndex = next;
        this.startEncounter(this.sequence[next]);
        if (this.isRush) { player().hp = carryHp; }
      } else {
        this.showResults();
      }
      this.pendingVictory = null;
    },
    showResults() {
      Save.bossRushUnlocked = true; ui().updateBossRushBtn();
      const times = this.runStats.clearTimes;
      const total = this.sequence.reduce((s, id) => s + (times[id] || 0), 0);
      if (Save.bestTime === null || total < Save.bestTime) Save.bestTime = total;
      const g = ui().el('resGrid');
      g.innerHTML = '';
      const row = (k, v) => { const a = document.createElement('div'); a.className = 'k'; a.textContent = k;
        const b = document.createElement('div'); b.className = 'v'; b.textContent = v; g.appendChild(a); g.appendChild(b); };
      for (const id of this.sequence) row(`${encOf(id).label || id} clear`, fmtTime(times[id] || 0));
      row('Total clear time', fmtTime(total));
      row('Deaths', this.runStats.deaths);
      row('Hits taken', this.runStats.hitsTaken);
      row('Best total', fmtTime(Save.bestTime));
      if (this.isRush) row('Mode', 'Boss Rush');
      this.mode = 'menu';
      ui().hideAll(); ui().show('resultsOverlay');
    },
    togglePause(force) {
      if (!this.inFight() && this.mode !== 'tutorial') return;
      this.paused = force !== undefined ? force : !this.paused;
      if (this.paused) ui().show('pauseMenu'); else { ui().hide('pauseMenu'); ui().hide('settingsMenu'); }
    },
    toMenu() {
      this.mode = 'menu'; this.paused = false; this.bosses = [];
      audio().stopMusic(); audio().music('menu');
      ui().hideAll(); ui().el('objectives').classList.remove('show'); ui().show('mainMenu');
      ui().updateBossRushBtn();
    },
    acc: 0, last: 0,
    tick(dt) {
      const Input = input();
      this.simTime += dt;
      if (this.paused) return;
      if (this.mode === 'menu') return;
      if (this.inFight() && !player().dead && !this.pendingVictory) this.fightTime += dt;
      if (Input.actionPressed('pause')) { this.togglePause(); Input.clearFrame(); return; }
      player().update(dt, this.bosses);
      weapon().update(dt, player(), this.bosses);
      for (const b of this.bosses) if (!b.dead || b.kind !== 'echo') b.update(dt);
      proj().updateProjectiles(dt);
      proj().updateHazards(dt);
      if (this.mode === 'tutorial') tutorial().update();
      Input.clearFrame();
    },
    loop(t) {
      requestAnimationFrame(tt => this.loop(tt));
      const dtFrame = Math.min(0.25, (t - this.last) / 1000 || 0);
      this.last = t;
      input().pollGamepad();
      const step = 1 / CONFIG.sim.hz;
      this.acc += dtFrame;
      while (this.acc >= step) { this.tick(step); this.acc -= step; }
      render().updateCamera(dtFrame);
      render().frame(dtFrame);
    }
  };
  return Game;
});
