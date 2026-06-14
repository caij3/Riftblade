'use strict';
/* weapon — the throwable blade state machine (hand/flying/stuck/lodged/returning).
   Reaches world() for collisions/bounds and audio() for cues; reads CONFIG. */
RB.define('weapon', function (require) {
  const CONFIG = require('config');
  const { dist, lerp, angTo } = require('helpers');
  const world = () => require('world');
  const audio = () => require('audio');

  const Weapon = {
    state: 'hand', x: 0, z: 0, h: 1, vx: 0, vz: 0,
    travelled: 0, lodgedIn: null, lodgeT: 0, angle: 0, spin: 0,
    reset() { this.state = 'hand'; this.lodgedIn = null; },
    throwFrom(px, pz, dirAng, target) {
        const c = CONFIG.player.riftthrow;
        this.state = 'flying'; this.x = px; this.z = pz; this.h = 1.1;
        this.vx = Math.cos(dirAng) * c.speed; this.vz = Math.sin(dirAng) * c.speed;
        this.travelled = 0; this.angle = dirAng; this.spin = 22; this.lodgedIn = null;
        this.targetDist = target ? Math.min(c.maxRange, dist(px, pz, target.x, target.z)) : c.maxRange;
        audio().sfx('throw');
    },
    startRecall() { if (this.state === 'stuck' || this.state === 'lodged') { this.state = 'returning'; this.lodgedIn = null; audio().sfx('recall'); } },
    update(dt, player, bosses) {
      const c = CONFIG.player.riftthrow;
      if (this.state === 'flying') {
        const step = Math.hypot(this.vx, this.vz) * dt;
        this.x += this.vx * dt; this.z += this.vz * dt; this.travelled += step; this.spin = 22;
        for (const b of bosses) {
          if (b.dead || b.untargetable) continue;
          if (dist(this.x, this.z, b.x, b.z) < b.radius + 0.3) {
            b.takeDamage(c.damage, 'throw');
            this.state = 'lodged'; this.lodgedIn = b; this.lodgeT = 0; audio().sfx('lodge');
            world().spark(this.x, this.z, 1.2, '#46e0c8', 10, 6);
            return;
          }
        }
        const blk = world().blockedByPillar(this.x, this.z, 0.15);
        if (blk) { this.state = 'stuck'; this.h = 1.2; audio().sfx('stick'); return; }
        const p = { x: this.x, z: this.z };
        if (world().clampPoint(p, 0.4) || this.travelled >= (this.targetDist || c.maxRange)) {
          this.x = p.x; this.z = p.z; this.state = 'stuck'; this.h = 1.0; audio().sfx('stick');
        }
      } else if (this.state === 'lodged') {
        const b = this.lodgedIn;
        if (!b || b.dead) { if (b) { this.x = b.x; this.z = b.z; } this.state = 'stuck'; this.h = 0.3; this.lodgedIn = null; return; }
        this.x = b.x + Math.cos(b.facing + 2.2) * b.radius * 0.7;
        this.z = b.z + Math.sin(b.facing + 2.2) * b.radius * 0.7;
        this.h = b.height * 0.55;
        this.lodgeT += dt;
        if (this.lodgeT >= c.lodgeTime) {
          this.state = 'stuck'; this.h = 0.25; this.lodgedIn = null;
          this.x = b.x + Math.cos(b.facing + 2.2) * (b.radius + 0.5);
          this.z = b.z + Math.sin(b.facing + 2.2) * (b.radius + 0.5);
          const p = { x: this.x, z: this.z }; world().clampPoint(p, 0.4); this.x = p.x; this.z = p.z;
        }
      } else if (this.state === 'returning') {
        const a = angTo(this.x, this.z, player.x, player.z);
        this.x += Math.cos(a) * c.recallSpeed * dt; this.z += Math.sin(a) * c.recallSpeed * dt;
        this.spin = 30; this.h = lerp(this.h, 1.1, 8 * dt);
        if (dist(this.x, this.z, player.x, player.z) < 0.7) { this.state = 'hand'; audio().sfx('stick'); }
      }
      if (this.state !== 'hand') this.angle += this.spin * dt;
    },
    out() { return this.state !== 'hand'; }
  };
  return Weapon;
});
