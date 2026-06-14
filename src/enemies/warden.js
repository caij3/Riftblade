'use strict';
/* warden — Boss 1. Extends boss (required at top for `extends`); spawns coal
   volleys via projectiles(), shakes/sounds via world()/audio(). */
RB.define('warden', function (require) {
  const Boss = require('boss');
  const CONFIG = require('config');
  const { TAU, dist, rand, angTo } = require('helpers');
  const world = () => require('world');
  const audio = () => require('audio');
  const proj = () => require('projectiles');

  class Warden extends Boss {
    constructor() { super(CONFIG.warden, 2, -6); this.kind = 'warden'; this.coreT = 0; this.slamCount = 0; this.atkCount = 0; this.eruptSafe = null; this.coalAlt = false; }
    onPhase2() { this.coreExposed = true; this.coreT = this.cfg.transitionTime; }
    update(dt) {
      if (this.baseUpdate(dt)) { this.contactPush(dt); return; }
      const A = this.cfg.attacks, B = this.cfg.behavior, spd = this.cfg.moveSpeed[this.phase - 1];
      const Player = require('player');
      this.coreT = Math.max(0, this.coreT - dt);
      if (this.coreExposed && this.coreT <= 0 && this.state !== 'transition') this.coreExposed = false;
      this.stateT += dt;
      switch (this.state) {
        case 'transition':
          this.coreExposed = true; this.coreT = Math.max(this.coreT, 0.1);
          if (this.stateT >= this.cfg.transitionTime) { this.state = 'idle'; this.stateT = 0; this.idleFor = 1.0; this.coreT = 0.5; }
          break;
        case 'idle': {
          this.faceP(2.5, dt);
          const d = this.distP();
          if (d > B.approachDist) this.moveToward(Player.x, Player.z, spd, dt);
          this.glue = (this.glue || 0) + (d < B.glueBuildRange ? dt : -dt * B.glueDecayMult); this.glue = Math.max(0, this.glue);
          if (this.stateT >= this.idleFor) {
            let id = null;
            const forceW7 = (this.phase === 2 && this.atkCount % 5 === 4);
            if (forceW7) {
              id = 'W7';
            } else {
              const opts = [];
              if (this.phase === 1) {
                if (this.glue > B.w3GlueThreshold) opts.push({ id: 'W3', ok: true });
                if (d < 4.5) opts.push({ id: 'W1', ok: true }, { id: 'W1', ok: true }, { id: 'W2', ok: true });
                else if (d < 5.5) opts.push({ id: 'W2', ok: true });
                if (d >= 5.5 && d < 14 && Math.random() < 0.55) opts.push({ id: 'W4', ok: true });
              } else {
                if (this.glue > B.w7GlueThreshold || Math.random() < B.w7Chance) opts.push({ id: 'W7', ok: true });
                if (d < 4.5) opts.push({ id: 'W6', ok: true }, { id: 'W6', ok: true }, { id: 'W5', ok: true });
                else if (d < 5.5) opts.push({ id: 'W5', ok: true });
                if (d >= 5.5 && d < 16 && Math.random() < 0.5) opts.push({ id: 'W4', ok: true });
              }
              id = this.pickWeighted(opts);
              if (!id) { this.idleFor = this.stateT + 0.35; break; }
            }
            this.atkCount++;

            if (id === 'W3' || id === 'W7') this.glue = 0;
            this.beginAttack(id);
            if (id === 'W6') this.slamCount = 0;
            if (id === 'W7') {
              const R = this.cfg.arena.radius - 3; this.eruptSafe = [];
              for (let i = 0; i < A.W7.safeCircles; i++) { const a = rand(0, TAU), r = rand(2, R);
                this.eruptSafe.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: A.W7.safeRadius }); }
            }
          }
          break;
        }
        case 'windup': {
          const w = A[this.attack].windup;
          if (this.attack === 'W1' || this.attack === 'W6') this.faceP(1.6, dt);
          if (this.attack === 'W2' || this.attack === 'W5') this.faceP(2.0, dt);
          if (this.attack === 'W4' && this.stateT < 0.3) {
            const a = angTo(Player.x, Player.z, this.x, this.z);
            this.x += Math.cos(a) * (A.W4.hop / 0.3) * dt; this.z += Math.sin(a) * (A.W4.hop / 0.3) * dt;
            world().clampPoint(this, this.radius);
          }
          if (this.stateT >= w) { this.state = 'strike'; this.stateT = 0; this.execute(); }
          break;
        }
        case 'strike': {
          if (this.attack === 'W6') {
            const c = A.W6;
            if (this.stateT >= c.gap && this.slamCount < c.slams) {
              this.stateT = 0; this.faceP(3.0, dt); this.moveToward(Player.x, Player.z, c.trackSpeed, 0.12);
              this.doSlam(c); }
            if (this.slamCount >= c.slams && this.stateT >= 0.3) { this.state = 'recover'; this.stateT = 0; }
          } else if (this.stateT >= 0.25) { this.state = 'recover'; this.stateT = 0; }
          break;
        }
        case 'recover': {
          const rec = (A[this.attack] && A[this.attack].recovery) || 0.8;
          if (this.attack === 'W7') { this.coreExposed = true; this.coreT = Math.max(this.coreT, rec + 0.8); }
          if (this.stateT >= rec) { this.state = 'idle'; this.stateT = 0; this.idleFor = rand(this.cfg.idle[0], this.cfg.idle[1]); this.attack = null; }
          break;
        }
      }
      this.contactPush(dt);
      if (this.state === 'strike' && ['W1', 'W2', 'W5', 'W6'].includes(this.attack)) {
        for (const b of world().braziers) if (b.alive && dist(this.x, this.z, b.x, b.z) < 5.2) { b.alive = false; world().spark(b.x, b.z, 1.5, '#ff7a2f', 14, 6); audio().sfx('slam'); }
      }
    }
    doSlam(c) {
      const Player = require('player');
      this.slamCount++;
      audio().sfx('slam'); world().addShake(0.5);
      world().hazards.push({ type: 'shockring', x: this.x + Math.cos(this.facing) * 2, z: this.z + Math.sin(this.facing) * 2, r: c.shock, t: 0, life: 0.35, color: '#ff7a2f' });
      this.meleeArcHit(c.range + 1.2, c.arc, c.damage);
      const sx = this.x + Math.cos(this.facing) * 2, sz = this.z + Math.sin(this.facing) * 2;
      if (dist(sx, sz, Player.x, Player.z) < c.shock + Player.radius) Player.takeDamage(c.damage, 'shock');
    }
    execute() {
      const A = this.cfg.attacks;
      const Player = require('player');
      switch (this.attack) {
        case 'W1': this.doSlam(A.W1); this.slamCount = 99; break;
        case 'W2': case 'W5': {
          const c = A[this.attack];
          audio().sfx('sweep'); world().addShake(0.35);
          this.meleeArcHit(c.range, c.arc, c.damage);
          if (this.attack === 'W5') {
            for (let i = 0; i < 7; i++) { const a = this.facing - c.arc / 2 + c.arc * (i / 6);
              world().hazards.push({ type: 'trail', x: this.x + Math.cos(a) * 3.2, z: this.z + Math.sin(a) * 3.2, r: 1.1, t: 0, life: c.trailLife, dps: c.trailDps }); }
            audio().sfx('fire');
          }
          break;
        }
        case 'W3':
          audio().sfx('fire');
          world().hazards.push({ type: 'ring', x: this.x, z: this.z, r: A.W3.rMin, t: 0, hit: false });
          break;
        case 'W4': {
          const c = A.W4;
          const base = angTo(this.x, this.z, Player.x, Player.z);
          const n = this.phase === 1 ? c.countP1 : c.countP2;
          this.coalAlt = !this.coalAlt;
          for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * c.spread;
            if (this.coalAlt) proj().spawnCoal(this.x, this.z, base + off, c, 0);
            else proj().spawnCoal(this.x, this.z, base + off * 2.2, c, -off * c.curveRate * 2);
          }
          break;
        }
        case 'W6': this.slamCount = 0; this.stateT = A.W6.gap; break;
        case 'W7': {
          world().hazards.push({ type: 'eruption', t: 0, dmg: A.W7.damage, safe: this.eruptSafe, done: false });
          break;
        }
      }
    }
  }
  return Warden;
});
