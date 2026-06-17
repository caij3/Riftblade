'use strict';
/* dummy — the tutorial effigy. Extends boss; never dies (refills), feeds the
   tutorial objective tracker via tutorial(). */
RB.define('dummy', function (require) {
  const Boss = require('boss');
  const CONFIG = require('config');
  const { rand, angTo } = require('helpers');
  const world = () => require('world');
  const player = () => require('player');
  const game = () => require('game');
  const tutorial = () => require('tutorial');

  class Dummy extends Boss {
    constructor() {
      super({ name: 'RIFT EFFIGY', hp: CONFIG.tutorial.dummyHp, phase2At: -1, moveSpeed: [0, 0],
        contactPush: 0, radius: 0.7, height: 2.0, stagger: { window: 3, threshold: 9999, duration: 0.6 },
        idle: [9, 9], transitionTime: 0, attacks: {} }, 0, -4);
      this.kind = 'dummy';
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
    update(dt) { this.baseUpdate(dt); this.facing = angTo(this.x, this.z, player().x, player().z); }
  }
  return Dummy;
});
