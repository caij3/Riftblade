'use strict';
/* sovereign — Boss 4 (The Iron Sovereign). A king who fights by COMMANDING phantom
   knights. The knights are NOT entities: every "knight" is a hazard on world().hazards
   (a telegraphed one-shot charge or slam that resolves and vanishes). Nothing he
   summons is pushed into game().bosses — no minion AI, HP, or pruning.

   Two-act fight:
     P1 — throne-bound turret. He holds the dais and projects force outward while you
          learn his commands. Riftstrike pins but never staggers him.
     P2 — "THE IRON SOVEREIGN DOES NOT RISE" is broken: he RISES off the throne and HUNTS
          you, his greatsword (K5) becomes a live threat, and he can issue TWO commands at
          once (any pair except K7, which is always solo). */
RB.define('sovereign', function (require) {
  const Boss = require('boss');
  const CONFIG = require('config');
  const { TAU, dist, rand, angTo, angDiff, clamp, lerp, pick } = require('helpers');
  const world = () => require('world');
  const audio = () => require('audio');
  const game = () => require('game');
  const proj = () => require('projectiles');

  class Sovereign extends Boss {
    constructor() {
      const cfg = CONFIG.sovereign;
      super(cfg, cfg.arena.throne.x, cfg.arena.throne.z);
      this.kind = 'sovereign';
      this.fightT = 0; this.sinceK7 = 8; this.campT = 0;
      this._lastCell = null;
      this.risen = false;               // P2: has the king left his throne?
      this.coronation = null;           // active K7 collapsing-ring march
      this.k4 = null;                   // active K4 sequence (Vanguard Press: lunges → jump-slam)
      this.k5 = null;                   // active K5 leap sequence (P2 only: sweep → C5-style leap)
      this.leaping = false; this.leapH = 0;   // airborne during the K5 leap (suppresses contact push; lifts the render)
      this.attack2 = null;              // P2 second simultaneous command
      this._pvx = 0; this._pvz = 0; this._pPrev = null;   // tracked player velocity (for leading)
    }
    onPhase2() {                        // the throne shatters — he stands and comes for you
      this.risen = true;
      audio().sfx('coronation'); world().addShake(0.8);
      world().spark(this.x, this.z, 2.0, '#c9a23b', 26, 9);
    }

    // where the player will be `lead` seconds from now (clamped), for aimed attacks
    predictPlayer(lead) {
      const P = require('player');
      const L = lead || 0;
      const p = { x: P.x + this._pvx * L, z: P.z + this._pvz * L };
      world().clampPoint(p, 0.5);
      return p;
    }

    // spawn one phantom-knight charge hazard down a lane. opts can override muster/laneLength/band/dmg.
    spawnCharge(x, z, ang, opts) {
      opts = opts || {};
      const K = this.cfg.knights;
      const spd = (opts.speed || K.chargeSpeed) * (this.fightT > this.cfg.enrageTime ? this.cfg.enrageKnightMult : 1);
      const laneLength = opts.laneLength || K.laneLength;
      world().hazards.push({ type: 'knight', mode: 'charge', x, z, ang, t: 0,
        muster: opts.muster != null ? opts.muster : K.muster,
        chargeTime: laneLength / spd, speed: spd,
        laneLength, laneBand: opts.laneBand || K.laneBand,
        dmg: opts.dmg != null ? opts.dmg : K.strikeDamage,
        linger: 0, lingerLife: 0,        // no burn/scorch DoT — a charge is a single clean hit
        struck: false, banner: K.banner });
    }
    // spawn one phantom-knight slam hazard (stationary disc) at a point
    spawnSlam(x, z, radius, dmg, muster) {
      const K = this.cfg.knights;
      const p = { x, z }; world().clampPoint(p, 0.4);
      world().hazards.push({ type: 'knight', mode: 'slam', x: p.x, z: p.z, t: 0,
        muster: muster != null ? muster : K.muster, radius, dmg, struck: false, banner: K.banner });
    }

    choose() {
      const B = this.cfg.behavior, A = this.cfg.attacks, d = this.distP();
      const opts = [];
      // the king personally cleaves when you're within reach (in P2 he closes that gap himself)
      if (d < A.K5.range) opts.push({ id: 'K5', ok: true }, { id: 'K5', ok: true });
      // loitering raises the odds of the lunge→jump press
      if (this.campT > A.K4.campTime) opts.push({ id: 'K4', ok: true });
      if (this.phase === 1) {
        if (d > 5) opts.push({ id: 'K6', ok: true });
        opts.push({ id: 'K2', ok: true });
        opts.push({ id: 'K3', ok: true });
        opts.push({ id: 'K4', ok: true });
      } else {
        if (this.sinceK7 > B.k7Interval) opts.push({ id: 'K7', ok: true });
        if (d > 5) opts.push({ id: 'K6', ok: true });
        opts.push({ id: 'K2', ok: true });
        opts.push({ id: 'K3', ok: true }, { id: 'K3', ok: true });
        opts.push({ id: 'K4', ok: true });
      }
      if (!opts.length) return 'K3';     // fallback: encirclement is always valid and never stalls
      return this.pickWeighted(opts);
    }
    // pick a distinct, non-K7 partner command to fire simultaneously in P2
    choosePartner(primary) {
      const A = this.cfg.attacks, d = this.distP();
      let c = ['K2', 'K3', 'K4'];
      if (d < A.K5.range) c.push('K5');
      if (d > 5) c.push('K6');
      c = c.filter(x => x !== primary);
      return c.length ? pick(c) : null;
    }

    update(dt) {
      if (this.baseUpdate(dt)) { this.contactPush(dt); return; }
      const A = this.cfg.attacks, B = this.cfg.behavior, P = require('player');
      this.fightT += dt; this.sinceK7 += dt;
      // anti-camp timer: how long the player lingers in one coarse arena cell
      const cell = (Math.round(P.x / 4) + ',' + Math.round(P.z / 4));
      if (cell === this._lastCell) this.campT += dt; else { this.campT = 0; this._lastCell = cell; }
      // smoothed player velocity so aimed attacks can lead a moving target
      if (this._pPrev && dt > 0) {
        const nvx = (P.x - this._pPrev.x) / dt, nvz = (P.z - this._pPrev.z) / dt;
        this._pvx = lerp(this._pvx, nvx, 0.35); this._pvz = lerp(this._pvz, nvz, 0.35);
      }
      this._pPrev = { x: P.x, z: P.z };
      // drive any active multi-beat sequences (independent of the main attack state, so they can overlap)
      if (this.coronation) this.tickCoronation(dt);
      if (this.k4) this.tickK4(dt);
      if (this.k5) this.tickK5(dt);
      this.stateT += dt;
      switch (this.state) {
        case 'transition':
          if (this.stateT >= this.cfg.transitionTime) { this.state = 'idle'; this.stateT = 0; this.idleFor = 0.8; }
          break;
        case 'idle': {
          this.faceP(2.5, dt);
          // P2: the risen king hunts — close on the player, stopping at hunt range so he still
          // issues ranged commands at mid-distance and brings his sword online when he reaches you.
          // (held still while a K5 leap is mid-flight so the hunt-move doesn't fight the leap lerp.)
          if (this.phase === 2 && this.risen && !this.k5) {
            const d = this.distP();
            if (d > B.huntRange) this.moveToward(P.x, P.z, this.cfg.moveSpeed[1], dt);
          }
          if (this.k5) { this.idleFor = this.stateT + 0.2; break; }   // don't issue a new command while leaping
          if (this.stateT >= this.idleFor) {
            const id = this.choose();
            if (!id) { this.idleFor = this.stateT + 0.3; break; }
            this.attack2 = null;
            if (id === 'K7') {
              this.setupCoronation(A.K7);
            } else if (this.phase === 2 && Math.random() < B.dualChance) {
              // dual command: fire a second, distinct, non-K7 attack alongside this one
              this.attack2 = this.choosePartner(id);
            }
            this.beginAttack(id);
          }
          break;
        }
        case 'windup': {
          const w = A[this.attack].windup;
          this.faceP(2.0, dt);   // track the player while telegraphing
          if (this.stateT >= w) { this.state = 'strike'; this.stateT = 0; this.execute(); }
          break;
        }
        case 'strike':
          if (this.stateT >= 0.2) { this.state = 'recover'; this.stateT = 0; }
          break;
        case 'recover': {
          const recA = (A[this.attack] && A[this.attack].recovery) || 0.8;
          const recB = (this.attack2 && A[this.attack2] && A[this.attack2].recovery) || 0;
          const rec = Math.max(recA, recB);
          if (this.stateT >= rec) {
            if (this.attack === 'K7') { this.coronation = null; this.sinceK7 = 0; }
            this.state = 'idle'; this.stateT = 0; this.idleFor = rand(this.cfg.idle[0], this.cfg.idle[1]);
            this.attack = null; this.attack2 = null;
          }
          break;
        }
      }
      if (!this.leaping) this.contactPush(dt);   // no collision shove while he's airborne (mirrors Choir C5)
    }

    setupCoronation(c) {
      // Coronation March: an arena-wide shockwave of slam-knights collapsing from the WALL inward.
      // FULL rings (no safe wedge) sweep wall→centre, so the whole floor is covered and you can't
      // dash/teleport "out" — you survive by dashing THROUGH the wave to get behind it.
      this.coronation = { cx: 0, cz: 0, pulses: c.pulses, ringCount: c.ringCount,
        startR: c.startR, endR: c.endR, slamRadius: c.slamRadius, slamDamage: c.slamDamage,
        pulseGap: c.pulseGap, t: 0, next: 0, idx: 0, started: false, curR: null };
    }
    // Coronation March: successive FULL rings detonate from the wall inward, covering the arena.
    tickCoronation(dt) {
      const C = this.coronation;
      if (!C.started) return;
      C.t += dt;
      while (C.idx < C.pulses && C.t >= C.next) {
        this.spawnCoronationRing(C, C.idx);
        C.idx++; C.next += C.pulseGap;
      }
    }
    spawnCoronationRing(C, p) {
      const frac = C.pulses > 1 ? p / (C.pulses - 1) : 0;
      const R = C.endR - (C.endR - C.startR) * frac;   // first pulse rings the wall, each one collapses inward
      const slot = TAU / C.ringCount;
      for (let i = 0; i < C.ringCount; i++) {
        const a = i * slot;                               // FULL ring — no gap, no safe spot
        this.spawnSlam(C.cx + Math.cos(a) * R, C.cz + Math.sin(a) * R, C.slamRadius, C.slamDamage);
      }
      C.curR = R;
      audio().sfx('muster'); world().addShake(0.3);
    }

    // K4 Vanguard Press (both phases, runs via this.k4 so it can overlap a dual-cast):
    //   phantom knights LUNGE at you in succession, then one JUMPS and crashes down.
    tickK4(dt) {
      const K = this.k4; if (!K.started) return;
      const P = require('player');
      K.t += dt;
      while (K.idx < K.lunges && K.t >= K.idx * K.gap) {
        const ang = rand(0, TAU);
        const o = { x: P.x + Math.cos(ang) * K.dist, z: P.z + Math.sin(ang) * K.dist };
        world().clampPoint(o, 0.5);
        this.spawnCharge(o.x, o.z, angTo(o.x, o.z, P.x, P.z), { muster: K.tele, laneLength: K.len, dmg: K.dmg });
        audio().sfx('charge');
        K.idx++;
      }
      if (K.idx >= K.lunges && !K.finished && K.t >= K.lunges * K.gap + K.finisherTele) {
        const tp = this.predictPlayer(0.12);
        this.spawnSlam(tp.x, tp.z, K.jumpRadius, K.jumpDamage, K.finisherTele);
        audio().sfx('coronation'); world().addShake(0.5);
        K.finished = true; K.endAt = K.t + K.finisherTele + 0.4;
      }
      if (K.finished && K.t >= K.endAt) this.k4 = null;
    }

    // K5 leap (P2 only, runs via this.k5 so it works as primary OR dual-cast partner):
    //   after the opening sweep, the king telegraphs, then LEAPS — lerping his own position along a
    //   parabolic arc to a spot just past the player and crashing down. Modeled on the Choir's C5 finisher.
    tickK5(dt) {
      const K = this.k5; const c = this.cfg.attacks.K5, P = require('player');
      K.t += dt;
      if (K.phase === 'tele') {                         // wind-up: hold, telegraphing where the crash will land
        if (K.t >= c.finisherTele) {                    // launch toward a point just beyond the player
          const a = angTo(this.x, this.z, P.x, P.z);
          K.from = { x: this.x, z: this.z };
          K.to = { x: P.x + Math.cos(a), z: P.z + Math.sin(a) };
          world().clampPoint(K.to, this.radius);
          K.phase = 'air'; K.t = 0; this.leaping = true;
          audio().sfx('charge');
        }
      } else {                                          // 'air': lerp the king along the arc; detonate on landing
        const t = clamp(K.t / c.leapTime, 0, 1);
        this.x = lerp(K.from.x, K.to.x, t); this.z = lerp(K.from.z, K.to.z, t);
        this.leapH = Math.sin(t * Math.PI) * c.leapHeight;
        if (t >= 1) {                                   // crash down: shockring + one-shot finisher in the landing disc
          this.leapH = 0; this.leaping = false;
          audio().sfx('slam'); world().addShake(0.5);
          world().hazards.push({ type: 'shockring', x: this.x, z: this.z, r: c.finisherRadius, t: 0, life: 0.3, color: '#c9a23b' });
          if (this.distP() < c.finisherRadius + P.radius) P.takeDamage(c.finisher, 'finisher');
          this.k5 = null;
        }
      }
    }

    execute() {
      this.executeOne(this.attack);
      if (this.attack2) this.executeOne(this.attack2);
    }
    executeOne(id) {
      const A = this.cfg.attacks, P = require('player');
      switch (id) {
        case 'K2': {                                       // Phalanx: a wall of lanes centered on you, one gap to run to
          const c = A.K2;
          const tp = this.predictPlayer(this.cfg.knights.lead * 0.5);
          const base = angTo(this.x, this.z, tp.x, tp.z);
          const perp = base + Math.PI / 2;
          const D = this.cfg.knights.musterDist;
          const gap = c.gap || 1;
          const gapStart = (Math.random() * c.count) | 0;
          for (let i = 0; i < c.count; i++) {
            let inGap = false;
            for (let g = 0; g < gap; g++) if (i === (gapStart + g) % c.count) inGap = true;
            if (inGap) continue;
            const off = (i - (c.count - 1) / 2) * c.spacing;
            const ox = tp.x - Math.cos(base) * D + Math.cos(perp) * off;
            const oz = tp.z - Math.sin(base) * D + Math.sin(perp) * off;
            const o = { x: ox, z: oz }; world().clampPoint(o, 0.5);
            this.spawnCharge(o.x, o.z, base);
          }
          audio().sfx('muster'); world().addShake(0.25);
          break;
        }
        case 'K3': {                                       // Encirclement: knights ring the PLAYER and charge inward, one safe wedge
          const c = A.K3, R = c.ringR;
          const gap = this.phase === 2 ? c.gapP2 : c.gap;
          const cx = P.x, cz = P.z;
          const a0 = rand(0, TAU);
          const gapStart = (Math.random() * c.ring) | 0;
          for (let i = 0; i < c.ring; i++) {
            let inGap = false;
            for (let g = 0; g < gap; g++) if (i === (gapStart + g) % c.ring) inGap = true;
            if (inGap) continue;
            const a = a0 + i / c.ring * TAU;
            const ox = cx + Math.cos(a) * R, oz = cz + Math.sin(a) * R;
            const o = { x: ox, z: oz }; world().clampPoint(o, 0.5);
            this.spawnCharge(o.x, o.z, angTo(o.x, o.z, cx, cz));
          }
          audio().sfx('muster'); world().addShake(0.35);
          break;
        }
        case 'K4': {                                       // Vanguard Press — runs via tickK4 (same in both phases)
          if (this.k4 && !this.k4.finished) break;          // don't stack over a live sequence
          const c = A.K4;
          this.k4 = { started: true, t: 0, idx: 0, finished: false, endAt: 99,
            lunges: c.lunges, gap: c.lungeGap, tele: c.lungeTele, len: c.lungeLen, dist: c.lungeDist, dmg: c.lungeDamage,
            finisherTele: c.finisherTele, jumpRadius: c.jumpRadius, jumpDamage: c.jumpDamage };
          audio().sfx('muster');
          break;
        }
        case 'K5': {                                       // Royal Cleaver: a greatsword sweep (P1); in P2 it chains into a leap
          if (this.k5) break;                               // a leap is already in flight
          const c = A.K5;
          audio().sfx('cleaver'); world().addShake(0.45);
          this.meleeArcHit(c.range, c.arc, c.damage);       // the sweep — fires in both phases
          if (this.phase === 2 && this.risen) this.k5 = { phase: 'tele', t: 0 };  // P2 only: wind up the C5-style leap
          break;
        }
        case 'K6': {                                       // Crossbow Rank: back-rank phantoms loose leading bolt volleys
          const c = A.K6, n = this.phase === 2 ? c.countP2 : c.count;
          const R = this.cfg.arena.musterRing;
          const spd = c.boltSpeed * (this.fightT > this.cfg.enrageTime ? this.cfg.enrageKnightMult : 1);
          const tp = this.predictPlayer(this.cfg.knights.lead);
          for (let k = 0; k < n; k++) {
            const ra = angTo(this.x, this.z, tp.x, tp.z) + (k - (n - 1) / 2) * 0.5;
            const rx = Math.cos(ra) * R, rz = Math.sin(ra) * R;
            const o = { x: rx, z: rz }; world().clampPoint(o, 0.5);
            for (let v = 0; v < c.volley; v++) {
              const base = angTo(o.x, o.z, tp.x, tp.z) + (v - (c.volley - 1) / 2) * c.spread;
              proj().spawnBolt(o.x, o.z, base, spd, c.boltRadius, c.boltDamage, c.aimTele + v * c.gap);
            }
          }
          audio().sfx('crossbow');
          break;
        }
        case 'K7': {                                       // Coronation March: raise the crown; closing rings fire over the next beats
          if (this.coronation) { this.coronation.started = true; this.coronation.t = 0; this.coronation.next = 0; }
          audio().sfx('coronation'); world().addShake(0.6);
          break;
        }
      }
    }
    die() {
      world().hazards = world().hazards.filter(h => h.type !== 'knight');
      this.coronation = null; this.k4 = null; this.k5 = null;
      this.leaping = false; this.leapH = 0;
      audio().sfx('sovereigndie');
      super.die();
    }
  }
  return Sovereign;
});
