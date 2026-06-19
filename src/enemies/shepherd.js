'use strict';
/* shepherd — Boss 3 (Ossaren, the Grave-Shepherd) plus its Risen adds (both
   extend boss). The Shepherd rots the ground, raises the dead, and Grave-Steps
   between platforms; the Risen are the player's stamina source (kill = +stamina,
   the deliberate §3.5 carve-out via cfg.killStamina). No fall death — rot is the
   pressure. Riftstrike does not stagger him (gated in Boss.stagger by
   cfg.riftstrikeNoStagger); the N7 channel sets coreExposed, which grants the 2x
   riftstrike bonus (cfg.coreRiftstrikeMult) but no longer interrupts the channel. */
RB.define('shepherd', function (require) {
  const Boss = require('boss');
  const CONFIG = require('config');
  const { TAU, dist, rand, angTo, pick, clamp } = require('helpers');
  const world = () => require('world');
  const audio = () => require('audio');
  const game = () => require('game');
  const proj = () => require('projectiles');
  const weapon = () => require('weapon');

  // --- The Risen: a slow add with the Echo's stepping melee (single hit). ---
  class Risen extends Boss {
    constructor(x, z, parent, bloated) {
      const R = CONFIG.shepherd.risen;
      super({ hp: bloated ? R.hpBloated : R.hp, radius: 0.55, height: 1.9,
              idle: [0.4, 0.8], phase2At: -1,
              stagger: { window: 1, threshold: 99999, duration: 0.3, immunity: 8 },
              contactPush: 4 }, x, z);
      this.kind = 'risen'; this.parent = parent; this.bloated = !!bloated;
      this.maxHp = this.cfg.hp; this.hp = this.maxHp; this.hitIdx = 0;
    }
    startPhase2() {}
    onPhase2() {}
    die() {
      const Player = require('player'), Weapon = require('weapon'), R = CONFIG.shepherd.risen;
      this.dead = true; this.untargetable = true;
      if (R.killStamina > 0) { Player.gainStamina(R.killStamina); world().dmgNum(this.x, this.z, 1.5, R.killStamina, 'stam'); }
      world().spark(this.x, this.z, 1.2, '#8fd9a0', 14, 6);
      audio().sfx('risendie');
      if (this.bloated)
        world().hazards.push({ type: 'bloom', x: this.x, z: this.z, t: 0, telegraph: R.burstTelegraph, r: R.burstRadius, dmg: R.burstDamage, done: false });
      if (Weapon.lodgedIn === this) { Weapon.state = 'stuck'; Weapon.lodgedIn = null; Weapon.h = 0.3; }
    }
    update(dt) {
      if (this.baseUpdate(dt)) { this.contactPush(dt); return; }
      const R = CONFIG.shepherd.risen, M = R.melee, P = require('player');
      this.stateT += dt;
      switch (this.state) {
        case 'idle': {
          this.faceP(4, dt);
          const d = this.distP();
          if (d > M.range - 0.3) this.moveToward(P.x, P.z, R.speed, dt);
          if (this.stateT >= this.idleFor) {
            if (d < M.range + 1.0) this.beginAttack('melee');
            else { this.stateT = 0; this.idleFor = rand(0.3, 0.6); }
          }
          break;
        }
        case 'windup':
          this.faceP(3, dt);
          if (this.stateT >= M.windup) { this.state = 'strike'; this.stateT = 0; this.hitIdx = 0; }
          break;
        case 'strike':                                   // echo-style stepping melee, but a single hit
          if (this.hitIdx < M.hits) {
            this.faceP(4, dt); this.moveToward(P.x, P.z, M.step / M.gap * 0.8, dt);
            if (this.stateT >= M.gap * this.hitIdx) { this.meleeArcHit(M.range, M.arc, M.damage); audio().sfx('swing'); this.hitIdx++; }
          }
          if (this.hitIdx >= M.hits) { this.state = 'recover'; this.stateT = 0; }
          break;
        case 'recover': if (this.stateT >= 0.7) { this.state = 'idle'; this.stateT = 0; this.idleFor = rand(0.4, 0.8); this.attack = null; } break;
      }
      this.contactPush(dt);
    }
  }

  class Shepherd extends Boss {
    constructor() {
      super(CONFIG.shepherd, 2, 0);
      this.kind = 'shepherd';
      this.fightT = 0; this.campT = 0; this.sinceN7 = 12;
      this._lastAnchor = null; this.sanctified = null;
    }
    onPhase2() {}

    die() {
      // capstone: when the Shepherd falls, the dead he raised collapse to dust at once
      for (const b of game().bosses) if (b.kind === 'risen' && !b.dead) { b.dead = true; b.untargetable = true; }
      super.die();
    }

    // --- anchor helpers (invisible points the Shepherd Grave-Steps between / seeds Risen on) ---
    anchorAt(x, z) {
      const A = this.cfg.arena.anchors; let best = A[0], bd = 1e9;
      for (const a of A) { const d = dist(x, z, a.x, a.z); if (d < bd) { bd = d; best = a; } }
      return best;
    }
    risenCountNear(x, z, r = 3.5) {
      return game().bosses.filter(b => b.kind === 'risen' && !b.dead && dist(b.x, b.z, x, z) < r).length;
    }
    spawnRisenAt(x, z, bloated) {
      const max = this.cfg.risen.maxAlive;
      if (max != null && game().bosses.filter(b => b.kind === 'risen' && !b.dead).length >= max) return false;
      if (this.risenCountNear(x, z, 1.6) >= 1) return false;
      const p = { x: x + rand(-1, 1), z: z + rand(-1, 1) }; world().clampPoint(p, 0.6);
      game().bosses.push(new Risen(p.x, p.z, this, bloated));
      return true;
    }
    rotZone(x, z, r, dps, life, delay) {                 // a free-form rot patch anywhere on the floor
      const N4 = this.cfg.attacks.N4;
      const p = { x, z }; world().clampPoint(p, 0);
      world().hazards.push({ type: 'rot', x: p.x, z: p.z, r, rim: 0, t: 0, expandTime: N4.expandTime, life, delay: delay || 0, dps });
    }
    graveStepTarget() {
      const A = this.cfg.arena.anchors;
      const pa = this.anchorAt(require('player').x, require('player').z), cur = this.anchorAt(this.x, this.z);
      const opts = A.filter(a => a !== pa && a !== cur);
      return opts.length ? pick(opts) : (pick(A.filter(a => a !== cur)) || A[0]);
    }

    choose() {
      const B = this.cfg.behavior, A = this.cfg.attacks, d = this.distP();
      const P = require('player');
      const last = this.lastAttacks[this.lastAttacks.length - 1];
      const lastWasStep = (last === 'N3' || last === 'N5');
      const opts = [];
      if (this.phase === 1) {
        if (d < B.graveStepRange && !lastWasStep) opts.push({ id: 'N3', ok: true });
        if (this.risenCountNear(P.x, P.z) === 0) opts.push({ id: 'N2', ok: true }, { id: 'N2', ok: true });
        if (this.campT > A.N4.campTime) opts.push({ id: 'N4', ok: true });
        if (d > 3) opts.push({ id: 'N8', ok: true });
        opts.push({ id: 'N1', ok: true });
        if (d > 3) opts.push({ id: 'N1', ok: true });
      } else {
        if (this.sinceN7 > B.n7Interval) opts.push({ id: 'N7', ok: true });
        if (d < B.graveStepRange && !lastWasStep) opts.push({ id: 'N3', ok: true });
        if (d > B.n5Range && !lastWasStep) opts.push({ id: 'N5', ok: true });
        if (this.risenCountNear(P.x, P.z) === 0) opts.push({ id: 'N6', ok: true });
        if (this.campT > A.N4.campTime) opts.push({ id: 'N4', ok: true });
        if (d > 3) opts.push({ id: 'N8', ok: true }, { id: 'N8', ok: true });
        opts.push({ id: 'N1', ok: true });
        if (d > 3) opts.push({ id: 'N1', ok: true });
      }
      return this.pickWeighted(opts);
    }

    update(dt) {
      if (this.baseUpdate(dt)) { this.contactPush(dt); return; }
      const A = this.cfg.attacks, B = this.cfg.behavior, spd = this.cfg.moveSpeed[this.phase - 1];
      const P = require('player');
      this.fightT += dt; this.sinceN7 += dt;
      // anti-camp timer: how long the player has lingered near one anchor
      const cur = this.anchorAt(P.x, P.z);
      if (cur === this._lastAnchor) this.campT += dt; else { this.campT = 0; this._lastAnchor = cur; }
      // prune dead Risen (safe: reassigns the array; the live update loop keeps its old iterable)
      const BS = game().bosses;
      if (BS.some(b => b.kind === 'risen' && b.dead)) game().bosses = BS.filter(b => !(b.kind === 'risen' && b.dead));
      this.stateT += dt;
      switch (this.state) {
        case 'transition':
          if (this.stateT >= this.cfg.transitionTime) { this.state = 'idle'; this.stateT = 0; this.idleFor = 0.8; }
          break;
        case 'idle': {
          this.faceP(2.5, dt);
          const d = this.distP();
          if (d > B.approachDist) this.moveToward(P.x, P.z, spd, dt);
          if (this.stateT >= this.idleFor) {
            const id = this.choose();
            if (!id) { this.idleFor = this.stateT + 0.3; break; }
            if (id === 'N7') {
              this.coreExposed = true;
              const aR = this.cfg.arena.radius, ang0 = rand(0, TAU);
              // sanctified safe spot: a free point away from the player
              this.sanctified = { x: Math.cos(ang0) * aR * 0.5, z: Math.sin(ang0) * aR * 0.5, r: A.N7.safeRadius };
              this.x = 0; this.z = 0; world().spark(this.x, this.z, 1.4, '#8fd9a0', 14, 6);
            }
            if (id === 'N5') {                       // grave-step next to the player, then telegraph the sweep (W2-style)
              const ang = angTo(P.x, P.z, this.x, this.z);
              this.x = P.x + Math.cos(ang) * 2.2; this.z = P.z + Math.sin(ang) * 2.2; world().clampPoint(this, this.radius);
              this.facing = angTo(this.x, this.z, P.x, P.z);
              world().spark(this.x, this.z, 1.4, '#8fd9a0', 14, 6); audio().sfx('gravestep');
            }
            this.beginAttack(id);
          }
          break;
        }
        case 'windup': {
          const w = A[this.attack].windup;
          if (this.attack === 'N1' || this.attack === 'N5') this.faceP(2.0, dt);
          if (this.stateT >= w) { this.state = 'strike'; this.stateT = 0; this.execute(); }
          break;
        }
        case 'strike':
          if (this.stateT >= 0.2) { this.state = 'recover'; this.stateT = 0; }
          break;
        case 'recover': {
          const rec = (A[this.attack] && A[this.attack].recovery) || 0.8;
          if (this.stateT >= rec) { this.state = 'idle'; this.stateT = 0; this.idleFor = rand(this.cfg.idle[0], this.cfg.idle[1]); this.attack = null; }
          break;
        }
      }
      this.contactPush(dt);
    }

    execute() {
      const A = this.cfg.attacks, P = require('player');
      switch (this.attack) {
        case 'N1': {
          const c = A.N1, base = angTo(this.x, this.z, P.x, P.z);
          const n = this.phase === 1 ? c.countP1 : c.countP2;
          const spd = c.speed * (this.fightT > this.cfg.enrageTime ? this.cfg.enrageLanceMult : 1);
          for (let i = 0; i < n; i++) { const off = (i - (n - 1) / 2) * c.spread; proj().spawnLance(this.x, this.z, base + off, spd, c.radius, c.damage); }
          break;
        }
        case 'N2': case 'N6': {
          const R = this.cfg.risen, bloated = this.attack === 'N6';
          const atk = A[this.attack];
          const spawnDelay = (atk && atk.spawnDelay != null) ? atk.spawnDelay : R.spawnDelay;
          // grave-light pools where the player was, holds briefly, then bursts (damage) and raises
          world().hazards.push({ type: 'raise', x: P.x, z: P.z, r: R.spawnRadius, t: 0,
            telegraph: spawnDelay, dmg: R.spawnDamage, bloated, owner: this, done: false });
          audio().sfx('raise');
          break;
        }
        case 'N3': {
          const t = this.graveStepTarget();
          this.x = t.x; this.z = t.z; world().clampPoint(this, this.radius);
          world().spark(this.x, this.z, 1.4, '#8fd9a0', 16, 7); audio().sfx('gravestep');
          break;
        }
        case 'N4': {
          this.rotZone(P.x, P.z, A.N4.radius, this.phase === 1 ? A.N4.dps : A.N4.dpsP2, A.N4.life, A.N4.delay);
          audio().sfx('rot');
          break;
        }
        case 'N5': {                                     // W2-style 180° sweep (teleport already happened at attack start)
          const c = A.N5;
          audio().sfx('censer'); world().addShake(0.35);
          this.meleeArcHit(c.range, c.arc, c.damage);
          break;
        }
        case 'N7': {
          const dps = A.N4.dpsP2, aR = this.cfg.arena.radius, S = this.sanctified;
          const clear = p => !S || dist(p.x, p.z, S.x, S.z) > S.r;
          // scatter rot across the arena in an even, spread-out pattern, keeping the sanctified spot clean
          const centers = [{ x: 0, z: 0 }];
          for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; centers.push({ x: Math.cos(a) * aR * 0.62, z: Math.sin(a) * aR * 0.62 }); }
          for (const c of centers) if (clear(c)) this.rotZone(c.x, c.z, A.N7.radius, dps, A.N7.life, 0);
          // raise the dead across the floor (not in the safe zone)
          for (let i = 0; i < 4; i++) { const a = rand(0, TAU), rr = rand(aR * 0.3, aR * 0.85);
            const x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (clear({ x, z })) this.spawnRisenAt(x, z, false); }
          this.coreExposed = false; this.sinceN7 = 0;
          audio().sfx('lastrite'); world().addShake(0.7);
          break;
        }
        case 'N8': {                                     // necrotic line: originates at the boss, aims where it locked, arms after a beat
          const c = A.N8, ang = angTo(this.x, this.z, P.x, P.z);
          world().hazards.push({ type: 'rotline', x: this.x, z: this.z, ang, length: c.length, band: c.band,
            t: 0, arm: c.arm, life: c.life, dps: c.dps, dmg: c.damage, hit: false });
          audio().sfx('rot'); world().addShake(0.3);
          break;
        }
      }
    }
  }
  return Shepherd;
});
