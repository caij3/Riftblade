'use strict';
/* tutorial — the training-rites GAUNTLET. A hard-gated, ordered state machine:
   only the current rite is "armed", and the run advances one rite at a time.
   Continuous rites (footwork, lock-on, stamina) are checked each frame in
   update(); event rites (combo/throw/teleport/recall/riftstrike/dodge) advance
   through complete(), which IGNORES any event that isn't the active rite — so a
   stray riftstrike during the teleport rite (or any out-of-order input) can never
   skip a step. Reaches player()/weapon()/input()/game()/ui()/audio(); CONFIG and
   helpers are required up front (acyclic). A Skip button (wired in ui.js) and
   Enter-on-completion both jump to the campaign. */
RB.define('tutorial', function (require) {
  const CONFIG = require('config');
  const { dist } = require('helpers');
  const player = () => require('player');
  const weapon = () => require('weapon');
  const input = () => require('input');
  const game = () => require('game');
  const ui = () => require('ui');
  const audio = () => require('audio');

  // Two floor gates the player walks into for the movement / lock-on rites.
  const GATE_A = { x: 7, z: 4, r: 1.7 };
  const GATE_B = { x: -7, z: 1, r: 1.7 };
  // Drained-to value at the start of the stamina rite so the refill is visible.
  const STAMINA_DRAIN_TO = 60;

  // Ordered rites. id is matched by complete(); label shows in the panel; how is
  // the one-line control hint under the list.
  const RITES = [
    { id: 'move',       hud: 'hp',      label: 'Footwork — step into the rift gate',         how: 'WASD / left-stick to move' },
    { id: 'lockon',                     label: 'Lock on, then reach the far gate',           how: 'Tab toggles lock-on — it holds your facing on the effigy' },
    { id: 'combo',      hud: 'enemyhp', label: 'Land the full 3-hit combo',                  how: 'LMB / J — the third swing is a heavy finisher' },
    { id: 'throw',      hud: 'blade',   label: 'Riftthrow — sink the blade into the effigy', how: 'RMB / K to throw — it costs 30 stamina' },
    { id: 'stamina',    hud: 'stamina', label: 'Recover stamina — attack to refill it',      how: 'that throw spent stamina; attacks refill it (even bare-handed)' },
    { id: 'teleport',                   label: 'Teleport to your blade',                     how: 'with the blade out, tap RMB to blink to it' },
    { id: 'recall',                     label: 'Recall the blade to your hand',             how: 'throw, then HOLD RMB ~0.6s to call it back' },
    { id: 'riftstrike',                 label: 'Riftstrike — teleport into a lodged blade', how: 'sink it into the effigy, then tap RMB to strike through' },
    { id: 'dodge',      hud: 'dodge',   label: 'Dodge through the effigy\u2019s pulse',     how: 'Shift — i-frames carry you through the blast' }
  ];

  const Tutorial = {
    rites: RITES,
    stage: 0, comboCount: 0, allDone: false, gateMarker: null,

    effigy() { return game().bosses[0] || null; },
    cur() { return this.rites[this.stage] || null; },

    reset() {
      this.stage = 0; this.comboCount = 0; this.allDone = false; this.gateMarker = null;
      player().lockOn = false;                         // force them to press Tab themselves
      const e = this.effigy(); if (e) e.aggressive = false;
      this.arm();
      this.renderList();
    },

    // Set up whatever the current rite needs (a gate to reach, a stamina drain,
    // the effigy waking up) and announce it.
    arm() {
      const r = this.cur(); if (!r) return;
      this.comboCount = 0;
      this.gateMarker = null;
      const e = this.effigy(); if (e) e.aggressive = (r.id === 'dodge');
      if (r.id === 'move') this.gateMarker = GATE_A;
      else if (r.id === 'lockon') this.gateMarker = GATE_B;
      else if (r.id === 'stamina') player().stamina = Math.min(player().stamina, STAMINA_DRAIN_TO);
      ui().toast(r.label, 3);
    },

    // Event-driven advance. Hard gate: only advances when id is the active rite.
    complete(id) {
      if (this.allDone) return;
      const r = this.cur(); if (!r || r.id !== id) return;
      audio().sfx('ui');
      this.stage++;
      if (this.stage >= this.rites.length) this.finish();
      else this.arm();
      this.renderList();
    },

    finish() {
      this.allDone = true; this.gateMarker = null;
      const e = this.effigy(); if (e) e.aggressive = false;
      ui().toast('RITES COMPLETE \u2014 press Enter to face the Warden', 6);
    },

    // Melee hits only count toward the combo rite.
    onMeleeHit() {
      if (this.allDone) return;
      const r = this.cur();
      if (r && r.id === 'combo') { this.comboCount++; if (this.comboCount >= 3) this.complete('combo'); }
    },

    renderList() {
      const ul = document.getElementById('objList');
      if (ul) {
        ul.innerHTML = '';
        const upto = this.allDone ? this.rites.length - 1 : this.stage;   // progressive reveal
        for (let i = 0; i <= upto && i < this.rites.length; i++) {
          const o = this.rites[i];
          const li = document.createElement('li'); li.textContent = o.label;
          if (this.allDone || i < this.stage) li.classList.add('done');
          else if (i === this.stage) li.classList.add('active');
          ul.appendChild(li);
        }
      }
      const how = document.getElementById('objHow');
      if (how) how.textContent = this.allDone ? 'Press Enter to begin the campaign.' : (this.cur() ? this.cur().how : '');
    },

    update() {
      const P = player(), Input = input();
      if (this.allDone) { if (Input.justPressed('Enter')) game().startCampaign(); return; }
      const r = this.cur(); if (!r) return;
      if (this.gateMarker && dist(P.x, P.z, this.gateMarker.x, this.gateMarker.z) < this.gateMarker.r) {
        if (r.id === 'move') this.complete('move');
        else if (r.id === 'lockon' && P.lockOn) this.complete('lockon');
      }
      if (r.id === 'stamina' && P.stamina >= CONFIG.player.maxStamina) this.complete('stamina');
      if (r.id === 'recall' && weapon().state === 'returning') this.complete('recall');
    }
  };
  return Tutorial;
});
