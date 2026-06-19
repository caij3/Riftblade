'use strict';
/* choir — Boss 2 plus its EchoVessel adds (both extend boss). Choir.onPhase2
   constructs echoes and hands them to game() to add to the boss list. */
RB.define('choir', function (require) {
  const Boss = require('boss');
  const CONFIG = require('config');
  const { clamp, lerp, dist, angTo, rand } = require('helpers');
  const world = () => require('world');
  const audio = () => require('audio');
  const game = () => require('game');
  const proj = () => require('projectiles');

  class EchoVessel extends Boss {
    constructor(x, z, parent) {
      super({ ...CONFIG.choir, hp: CONFIG.choir.echo.hp, idle: [1.2, 2.0], stagger: { window: 1, threshold: 9999, duration: 0.8 },
              contactPush: CONFIG.choir.contactPush * CONFIG.choir.echo.damageMult }, x, z);
      this.kind = 'echo'; this.parent = parent; this.radius = 0.7; this.height = 2.3;
      this.hitIdx = 0; this.maxHp = CONFIG.choir.echo.hp; this.hp = this.maxHp;
    }
    takeDamage(amount, source) {
      super.takeDamage(amount, source);
    }
    startPhase2() {}
    die() {
      const Player = require('player'), Weapon = require('weapon');
      this.dead = true; this.untargetable = true;
      if (CONFIG.choir.echo.killStamina > 0) {
        Player.gainStamina(CONFIG.choir.echo.killStamina);
        world().dmgNum(this.x, this.z, 1.8, CONFIG.choir.echo.killStamina, 'stam');
      }
      world().spark(this.x, this.z, 1.5, '#cfd5ef', 18, 7);
      audio().sfx('echodie');
      if (Weapon.lodgedIn === this) { Weapon.state = 'stuck'; Weapon.lodgedIn = null; Weapon.h = 0.3; }
    }
    update(dt) {
      if (this.baseUpdate(dt)) { this.contactPush(dt); return; }
      const A = CONFIG.choir.attacks, mult = CONFIG.choir.echo.damageMult;
      const Player = require('player');
      this.stateT += dt;
      switch (this.state) {
        case 'idle': {
          this.faceP(3, dt);
          const d = this.distP();
          if (d > 2.2) this.moveToward(Player.x, Player.z, CONFIG.choir.echo.speed, dt);
          if (this.stateT >= this.idleFor) this.beginAttack(d < 3.2 ? 'C1' : 'C2');
          break;
        }
        case 'windup':
          this.faceP(2.5, dt);
          if (this.stateT >= A[this.attack].windup) { this.state = 'strike'; this.stateT = 0; this.hitIdx = 0;
            if (this.attack === 'C2') { const c = A.C2;
              for (let i = 0; i < c.shards; i++) proj().spawnShard(this.x, this.z, angTo(this.x, this.z, Player.x, Player.z) + (i - 1) * 0.3, c.damage * mult, c.speed * game().shardSpeedMult(), c.turnRate, c.life);
              this.state = 'recover'; this.stateT = 0; } }
          break;
        case 'strike': {
          const c = A.C1;
          if (this.hitIdx < c.hits) {
            this.faceP(4, dt); this.moveToward(Player.x, Player.z, c.step / c.gap * 0.8, dt);
            if (this.stateT >= c.gap * this.hitIdx) { this.meleeArcHit(c.range, c.arc, c.damage * mult); audio().sfx('swing'); this.hitIdx++; }
          }
          if (this.hitIdx >= c.hits) { this.state = 'recover'; this.stateT = 0; }
          break;
        }
        case 'recover':
          if (this.stateT >= 1.0) { this.state = 'idle'; this.stateT = 0; this.idleFor = rand(1.2, 2.0); this.attack = null; }
          break;
      }
      this.contactPush(dt);
    }
  }

  class Choir extends Boss {
    constructor() { super(CONFIG.choir, 2, -5); this.kind = 'choir'; this.hitIdx = 0;
      this.sinceC3 = 0; this.glue = 0; this.dmgWindow = []; this.vortexActive = false;
      this.echoes = []; this.fightT = 0; }
    shardCount() { return this.phase === 1 ? this.cfg.attacks.C2.shards : this.cfg.attacks.C2.shardsP2; }
    onPhase2() {
      const a = this.cfg.arena;
      const v1 = new EchoVessel(-a.w / 2 + 4, 0, this), v2 = new EchoVessel(a.w / 2 - 4, 0, this);
      this.echoes = [v1, v2]; game().bosses.push(v1, v2);
    }
    takeDamage(amount, source) {
      this.dmgWindow.push({ t: game().simTime, amt: amount });
      super.takeDamage(amount, source);
    }
    update(dt) {
      this.fightT += dt; this.sinceC3 += dt;
      if (this.baseUpdate(dt)) { this.contactPush(dt); return; }
      const A = this.cfg.attacks, B = this.cfg.behavior, spd = this.cfg.moveSpeed[this.phase - 1];
      const Player = require('player');
      this.stateT += dt;
      const d = this.distP();
      switch (this.state) {
        case 'transition':
          if (this.stateT >= this.cfg.transitionTime) { this.state = 'idle'; this.stateT = 0; this.idleFor = 0.8; }
          break;
        case 'idle': {
          this.faceP(4, dt);
          if (d > 2.4) this.moveToward(Player.x, Player.z, spd, dt);
          this.glue = Math.max(0, this.glue + (d < B.glueBuildRange ? dt : -dt * B.glueDecayMult));
          const cut = game().simTime - B.c3DamageWindow;
          this.dmgWindow = this.dmgWindow.filter(r => r.t >= cut);
          const burst = this.dmgWindow.reduce((s, r) => s + r.amt, 0);
          const lastWasC3 = this.lastAttacks[this.lastAttacks.length - 1] === 'C3';
          if (!lastWasC3 && (this.sinceC3 >= B.c3Interval || burst >= B.c3DamageTrigger)) {
            this.beginAttack('C3'); this.sinceC3 = 0; this.dmgWindow = []; break;
          }
          if (this.stateT >= this.idleFor) {
            let id;
            if (this.phase === 1) {
              id = this.pickWeighted([
                { id: 'C4', ok: this.glue > B.c4GlueTime },
                { id: 'C1', ok: d < 3.5 }, { id: 'C1', ok: d < 3.5 },
                { id: 'C2', ok: d >= 3.5 }
              ]) || (d < 3.5 ? 'C1' : 'C2');
              if (id === 'C4') this.glue = 0;
            } else {
              id = this.pickWeighted([
                { id: 'C6', ok: this.glue > B.c4GlueTime || Math.random() < 0.22 },
                { id: 'C5', ok: d < 3.8 }, { id: 'C5', ok: d < 3.8 },
                { id: 'C2', ok: d >= 3.8 }
              ]) || (d < 3.8 ? 'C5' : 'C2');
              if (id === 'C6') this.glue = 0;
            }
            this.beginAttack(id);
          }
          break;
        }
        case 'windup': {
          const w = A[this.attack].windup;
          if (this.attack !== 'C3') this.faceP(3, dt);
          if (this.stateT >= w) { this.state = 'strike'; this.stateT = 0; this.hitIdx = 0; this.execute(); }
          break;
        }
        case 'strike': this.strikeUpdate(dt, A); break;
        case 'leap': {
          const c = A.C5; const t = clamp(this.stateT / 0.45, 0, 1);
          this.x = lerp(this.leapFrom.x, this.leapTo.x, t); this.z = lerp(this.leapFrom.z, this.leapTo.z, t);
          this.leapH = Math.sin(t * Math.PI) * 2.2;
          if (t >= 1) { this.leapH = 0;
            audio().sfx('slam'); world().addShake(0.45);
            world().hazards.push({ type: 'shockring', x: this.x, z: this.z, r: c.finisherRadius, t: 0, life: 0.3, color: '#cfd5ef' });
            if (this.distP() < c.finisherRadius + Player.radius) Player.takeDamage(c.finisher, 'finisher');
            this.state = 'recover'; this.stateT = 0; }
          break;
        }
        case 'recover': {
          const rec = (A[this.attack] && A[this.attack].recovery) || 1.0;
          if (this.stateT >= rec) { this.state = 'idle'; this.stateT = 0; this.idleFor = rand(this.cfg.idle[0], this.cfg.idle[1]); this.attack = null; }
          break;
        }
      }
      if (this.state !== 'leap') this.contactPush(dt);   // no collision during the finisher tele
    }
    strikeUpdate(dt, A) {
      const Player = require('player');
      switch (this.attack) {
        case 'C1': case 'C5': {
          const c = A[this.attack];
          if (this.hitIdx < c.hits) {
            this.faceP(5, dt);
            this.moveToward(Player.x, Player.z, c.step / c.gap * 0.8, dt);
            if (this.stateT >= c.gap * this.hitIdx) {
              this.meleeArcHit(c.range, c.arc, c.damage); audio().sfx(this.hitIdx % 2 ? 'swing2' : 'swing');
              this.hitIdx++;
            }
          }
          if (this.hitIdx >= c.hits) {
            if (this.attack === 'C5') {
              if (this.stateT >= c.gap * c.hits + c.finisherTele) {
                this.leapFrom = { x: this.x, z: this.z };
                const a = angTo(this.x, this.z, Player.x, Player.z);
                this.leapTo = { x: Player.x + Math.cos(a), z: Player.z + Math.sin(a) };
                world().clampPoint(this.leapTo, this.radius);
                this.state = 'leap'; this.stateT = 0;
              }
            } else { this.state = 'recover'; this.stateT = 0; }
          }
          break;
        }
        case 'C2': {
          if (this.stateT >= 0.25) { this.state = 'recover'; this.stateT = 0; }
          break;
        }
        case 'C3': {
          const c = A.C3, t = clamp(this.stateT / c.dashTime, 0, 1);
          this.x = lerp(this.dashFrom.x, this.dashTo.x, t); this.z = lerp(this.dashFrom.z, this.dashTo.z, t);
          if (t >= 1) { this.state = 'recover'; this.stateT = 0.6; }
          break;
        }
        case 'C4': {
          const c = A.C4;
          if (this.hitIdx < c.hits && this.stateT >= c.gap * this.hitIdx) {
            if (this.distP() < c.radius + Player.radius) Player.takeDamage(c.damage, 'spin');
            audio().sfx('sweep'); world().addShake(0.25);
            world().hazards.push({ type: 'shockring', x: this.x, z: this.z, r: c.radius, t: 0, life: 0.25, color: '#cfd5ef' });
            this.hitIdx++;
          }
          if (this.hitIdx >= c.hits && this.stateT >= c.gap * c.hits) { this.state = 'recover'; this.stateT = 0; }
          break;
        }
        case 'C6': {
          if (!this.vortexActive) { this.state = 'recover'; this.stateT = 0; }
          break;
        }
      }
    }
    execute() {
      const A = this.cfg.attacks;
      const Player = require('player');
      switch (this.attack) {
        case 'C2': {
          const c = A.C2, n = this.shardCount();
          for (let i = 0; i < n; i++)
            proj().spawnShard(this.x, this.z, angTo(this.x, this.z, Player.x, Player.z) + (i - (n - 1) / 2) * 0.28,
                       c.damage, c.speed * game().shardSpeedMult(), c.turnRate, c.life);
          break;
        }
        case 'C3': {
          const c = A.C3;
          this.dashFrom = { x: this.x, z: this.z };
          const away = angTo(Player.x, Player.z, this.x, this.z) + rand(-0.7, 0.7);
          const target = { x: this.x + Math.cos(away) * rand(c.distMin, c.distMax), z: this.z + Math.sin(away) * rand(c.distMin, c.distMax) };
          let best = target, bd = 1e9;
          for (const p of world().pillars) { const dd = dist(target.x, target.z, p.x, p.z);
            if (dd < bd && dist(p.x, p.z, Player.x, Player.z) > 8) { bd = dd; best = { x: p.x + rand(-1.5, 1.5), z: p.z + rand(-1.5, 1.5) }; } }
          if (Math.random() < 0.6) target.x = best.x, target.z = best.z;
          world().clampPoint(target, this.radius);
          this.dashTo = target; audio().sfx('dodge');
          break;
        }
        case 'C6': {
          this.vortexActive = true;
          world().hazards.push({ type: 'vortex', owner: this, x: this.x, z: this.z, r: A.C6.rMin, t: 0 });
          audio().sfx('sweep');
          break;
        }
      }
    }
  }
  return Choir;
});
