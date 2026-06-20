'use strict';
/* dummy — the tutorial effigy. Extends boss; never dies (refills), feeds the
   tutorial objective tracker via tutorial(). When the tutorial arms the dodge
   rite it sets `aggressive = true`, and the effigy runs a single, slow,
   heavily-telegraphed radial pulse: idle -> windup (growing floor ring) ->
   active (one damage tick in radius) -> recovery. The player must Shift through
   the active tick; surviving it via i-frames completes the dodge rite. Player
   death is floored in player.takeDamage while in tutorial mode, so a missed
   dodge only chips and lets them try again. */
RB.define('dummy', function (require) {
  const Boss = require('boss');
  const CONFIG = require('config');
  const { rand, angTo } = require('helpers');
  const world = () => require('world');
  const player = () => require('player');
  const game = () => require('game');
  const audio = () => require('audio');
  const tutorial = () => require('tutorial');

  const PULSE = { idle: 1.3, windup: 1.0, active: 0.16, recovery: 1.1, radius: 10, damage: 10 };

  class Dummy extends Boss {
    constructor() {
      super({ name: 'RIFT EFFIGY', hp: CONFIG.tutorial.dummyHp, phase2At: -1, moveSpeed: [0, 0],
        contactPush: 0, radius: 0.7, height: 2.0, stagger: { window: 3, threshold: 9999, duration: 0.6 },
        idle: [9, 9], transitionTime: 0, attacks: {} }, 0, -4);
      this.kind = 'dummy';
      this.aggressive = false;            // woken by the tutorial's dodge rite
      this.atkState = 'idle'; this.atkT = 0; this._hitDone = false;
      this.tele = -1; this.teleR = PULSE.radius;   // tele 0..1 during windup (read by render), -1 otherwise
    }
    takeDamage(amount, source) {
      this.flash = 0.15; player().combatTimer = 0;
      world().dmgNum(this.x, this.z, this.height * 0.7 + rand(-.2, .2), amount, source === 'riftstrike' ? 'rift' : 'dmg');
      this.hp -= amount; if (this.hp <= 0) this.hp = this.maxHp;
      if (game().mode === 'tutorial') {
        if (source === 'melee') tutorial().onMeleeHit();
        if (source === 'throw') tutorial().complete('throw');
      }
    }
    stagger() { this.flash = 0.3; }
    update(dt) {
      if (this.baseUpdate(dt)) { this.tele = -1; return; }
      this.facing = angTo(this.x, this.z, player().x, player().z);
      if (!this.aggressive) { this.tele = -1; this.atkState = 'idle'; this.atkT = 0; return; }
      this.atkT += dt;
      if (this.atkState === 'idle') {
        this.tele = -1;
        if (this.atkT >= PULSE.idle) { this.atkState = 'windup'; this.atkT = 0; audio().sfx('swing'); }
      } else if (this.atkState === 'windup') {
        this.teleR = PULSE.radius; this.tele = Math.min(1, this.atkT / PULSE.windup);
        if (this.atkT >= PULSE.windup) { this.atkState = 'active'; this.atkT = 0; this._hitDone = false; }
      } else if (this.atkState === 'active') {
        this.tele = 1;
        if (!this._hitDone) {
          this._hitDone = true;
          world().addShake(0.4); world().spark(this.x, this.z, 1.3, '#ff7a2f', 18, 7); audio().sfx('heavyhit');
          if (this.distP() < PULSE.radius) {
            const landed = player().takeDamage(PULSE.damage, 'effigy');   // false if the player had i-frames
            if (!landed && player().iFrames > 0 && game().mode === 'tutorial') tutorial().complete('dodge');
          }
        }
        if (this.atkT >= PULSE.active) { this.atkState = 'recovery'; this.atkT = 0; this.tele = -1; }
      } else {
        this.tele = -1;
        if (this.atkT >= PULSE.recovery) { this.atkState = 'idle'; this.atkT = 0; }
      }
    }
  }
  return Dummy;
});
