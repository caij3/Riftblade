'use strict';
/* boss — base class shared by warden/choir/echo/dummy. Subclasses require this
   module at their factory top (needed for `extends` at definition time). */
RB.define('boss', function (require) {
  const { clamp, dist, angTo, angDiff, rand, pick } = require('helpers');
  const world = () => require('world');
  const audio = () => require('audio');
  const player = () => require('player');
  const game = () => require('game');
  const tutorial = () => require('tutorial');

  class Boss {
    constructor(cfg, x, z) {
      this.cfg = cfg; this.x = x; this.z = z; this.facing = Math.PI / 2;
      this.hp = cfg.hp; this.maxHp = cfg.hp;
      this.radius = cfg.radius; this.height = cfg.height;
      this.phase = 1; this.dead = false; this.untargetable = false;
      this.state = 'idle'; this.stateT = 0; this.idleFor = rand(cfg.idle[0], cfg.idle[1]);
      this.attack = null; this.lastAttacks = [];
      this.staggered = false; this.staggerT = 0; this.staggerCd = 0;
      this.recentDmg = [];
      this.flash = 0; this.coreExposed = false; this.animT = 0;
    }
    takeDamage(amount, source) {
      if (this.dead || this.untargetable) return;
      this.hp -= amount; this.flash = 0.15;
      player().combatTimer = 0;
      this.recentDmg.push({ t: game().simTime, amt: amount });
      if (source !== 'riftstrike') world().dmgNum(this.x, this.z, this.height * 0.65 + rand(-.3, .3), amount, source === 'throw' ? 'throwdmg' : 'dmg');
      if (game().mode === 'tutorial') {
        if (source === 'melee') tutorial().onMeleeHit();
        if (source === 'throw') tutorial().complete('throw');
      }
      const st = this.cfg.stagger;
      if (this.phase === 1 && !this.staggered && this.staggerCd <= 0 && source !== 'riftstrike') {
        const cut = game().simTime - st.window;
        this.recentDmg = this.recentDmg.filter(r => r.t >= cut);
        const sum = this.recentDmg.reduce((s, r) => s + r.amt, 0);
        if (sum >= st.threshold) this.stagger();
      }
      if (this.hp <= 0) { this.hp = 0; this.die(); return; }
      if (this.phase === 1 && this.hp / this.maxHp <= this.cfg.phase2At) this.startPhase2();
    }
    stagger() {
      if (this.dead) return;
      // immune if the whole boss is unstaggerable, or the current attack forbids being staggered out of
      const atk = this.cfg.attacks && this.cfg.attacks[this.attack];
      if (this.cfg.riftstrikeNoStagger || (atk && atk.stagger === false)) return;
      this.staggerCd = this.cfg.stagger.immunity || 8;
      this.staggered = true; this.staggerT = this.cfg.stagger.duration;
      this.state = 'stagger'; this.attack = null; this.recentDmg = [];
      audio().sfx('stagger'); world().addShake(0.35);
    }
    startPhase2() {
      this.phase = 2; this.state = 'transition'; this.stateT = 0; this.attack = null;
      this.staggered = false; audio().sfx('phase'); world().addShake(0.6);
      this.onPhase2();
    }
    onPhase2() {}
    die() {
      this.dead = true; this.state = 'dead'; this.stateT = 0;
      world().hazards = world().hazards.filter(h => h.type !== 'vortex');
      audio().sfx('victory'); world().addShake(0.6);
      game().onBossDefeated(this);
    }
    faceP(rate, dt) {
      const want = angTo(this.x, this.z, player().x, player().z);
      this.facing += clamp(angDiff(this.facing, want), -rate * dt, rate * dt);
    }
    moveToward(tx, tz, speed, dt) {
      const a = angTo(this.x, this.z, tx, tz);
      this.x += Math.cos(a) * speed * dt; this.z += Math.sin(a) * speed * dt;
      world().clampPoint(this, this.radius);
    }
    distP() { const P = player(); return dist(this.x, this.z, P.x, P.z); }
    meleeArcHit(range, arc, dmg) {
      const P = player();
      const d = this.distP();
      if (d < range + P.radius && Math.abs(angDiff(this.facing, angTo(this.x, this.z, P.x, P.z))) < arc / 2)
        P.takeDamage(dmg, 'boss-melee');
    }
    contactPush(dt) {
      if (this.dead || this.untargetable) return;
      const P = player();
      const min = this.radius + P.radius;
      const d = this.distP();
      if (d < min) {
        let a = (d > 0.001) ? angTo(this.x, this.z, P.x, P.z) : this.facing + Math.PI;
        P.x = this.x + Math.cos(a) * min;
        P.z = this.z + Math.sin(a) * min;
        P.x += Math.cos(a) * this.cfg.contactPush * dt;
        P.z += Math.sin(a) * this.cfg.contactPush * dt;
        world().clampPoint(P, P.radius);
      }
    }
    pickWeighted(options) {
      const last2 = this.lastAttacks.slice(-2);
      const pool = options.filter(o => o.ok && !(last2.length === 2 && last2[0] === o.id && last2[1] === o.id));
      if (!pool.length) return null;
      return pick(pool).id;
    }
    beginAttack(id) { this.attack = id; this.state = 'windup'; this.stateT = 0; this.lastAttacks.push(id); if (this.lastAttacks.length > 6) this.lastAttacks.shift(); }
    baseUpdate(dt) {
      this.animT += dt; this.flash = Math.max(0, this.flash - dt);
      this.staggerCd = Math.max(0, this.staggerCd - dt);
      if (this.staggered) {
        this.staggerT -= dt;
        if (this.staggerT <= 0) { this.staggered = false; this.state = 'idle'; this.stateT = 0; this.idleFor = 0.4; }
        return true;
      }
      if (this.dead) { this.stateT += dt; return true; }
      return false;
    }
  }
  return Boss;
});
