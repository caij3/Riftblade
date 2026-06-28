'use strict';
/* world — arena geometry, props, transient lists (projectiles/hazards/fx/dmgNums),
   screen-shake. Owns its state internally (via `this`); other files mutate the
   lists by going through world().<method> or by pushing onto the arrays the
   accessors hand back. Only cross-file call here is game() for the shake toggle. */
RB.define('world', function (require) {
  const { TAU, dist, rand, pick } = require('helpers');
  const game = () => require('game');

  const World = {
    arena: null, pillars: [], braziers: [], props: [],
    projectiles: [], hazards: [], fx: [], dmgNums: [],
    shake: 0, slowmo: 0,
    reset(arenaCfg) {
      this.arena = arenaCfg; this.projectiles = []; this.hazards = []; this.fx = []; this.dmgNums = [];
      this.pillars = []; this.braziers = []; this.props = []; this.shake = 0; this.slowmo = 0;
      if (arenaCfg.pillarRows) {
        for (const z of arenaCfg.pillarRows) for (const x of arenaCfg.pillarXs)
          this.pillars.push({ x, z, r: arenaCfg.pillarRadius, broken: Math.random() < 0.25, h: rand(2.2, 4.5) });
      }
      if (arenaCfg.braziers) {
        for (let i = 0; i < arenaCfg.braziers; i++) {
          const a = i / arenaCfg.braziers * TAU + TAU / 8;
          this.braziers.push({ x: Math.cos(a) * (arenaCfg.radius - 3), z: Math.sin(a) * (arenaCfg.radius - 3), r: arenaCfg.brazierRadius, alive: true });
        }
      }
      if (arenaCfg.graves) {                 // scattered cemetery decor (no collision; pure backdrop)
        const R = arenaCfg.radius;
        for (let i = 0; i < arenaCfg.graves; i++) {
          const a = rand(0, TAU), rr = rand(3.2, R - 1.0);
          this.props.push({ prop: true, gkind: pick(['head', 'head', 'head', 'cross', 'cross', 'tomb', 'urn']),
            x: Math.cos(a) * rr, z: Math.sin(a) * rr, rot: rand(-0.22, 0.22), s: rand(0.75, 1.35), tilt: rand(-0.12, 0.12) });
        }
      }
      if (arenaCfg.banners) {                // throne hall: hanging war-banners around the rim (pure backdrop)
        const R = arenaCfg.radius;
        for (let i = 0; i < arenaCfg.banners; i++) {
          const a = i / arenaCfg.banners * TAU + TAU / 16;
          this.props.push({ prop: true, gkind: 'banner', x: Math.cos(a) * (R - 0.6), z: Math.sin(a) * (R - 0.6),
            rot: 0, s: rand(0.95, 1.2), tilt: 0 });
        }
      }
    },
    clampPoint(p, pad = 0.5) {
      const a = this.arena; let clamped = false;
      if (a.type === 'circle') {
        const d = Math.hypot(p.x, p.z), max = a.radius - pad;
        if (d > max) { const s = max / d; p.x *= s; p.z *= s; clamped = true; }
      } else {
        const hw = a.w / 2 - pad, hh = a.h / 2 - pad;
        if (p.x < -hw) { p.x = -hw; clamped = true; } if (p.x > hw) { p.x = hw; clamped = true; }
        if (p.z < -hh) { p.z = -hh; clamped = true; } if (p.z > hh) { p.z = hh; clamped = true; }
      }
      return clamped;
    },
    collideSolids(e) {
      for (const p of this.pillars) {
        const d = dist(e.x, e.z, p.x, p.z), min = p.r + e.radius;
        if (d < min && d > 0.001) { const push = (min - d) / d; e.x += (e.x - p.x) * push; e.z += (e.z - p.z) * push; }
      }
      for (const b of this.braziers) { if (!b.alive) continue;
        const d = dist(e.x, e.z, b.x, b.z), min = b.r + e.radius;
        if (d < min && d > 0.001) { const push = (min - d) / d; e.x += (e.x - b.x) * push; e.z += (e.z - b.z) * push; }
      }
    },
    blockedByPillar(x, z, r = 0.2) {
      for (const p of this.pillars) if (dist(x, z, p.x, p.z) < p.r + r) return p;
      for (const b of this.braziers) if (b.alive && dist(x, z, b.x, b.z) < b.r + r) return b;
      return null;
    },
    addShake(amt) { if (game().settings.shake) this.shake = Math.min(1.4, this.shake + amt); },
    dmgNum(x, z, h, amount, kind) { this.dmgNums.push({ x, z, h, t: 0, amount: Math.round(amount), kind }); },
    spark(x, z, h, color, n = 8, spd = 5) {
      for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(spd * .3, spd);
        this.fx.push({ type: 'spark', x, z, h: h + rand(-.2, .4), vx: Math.cos(a) * s, vz: Math.sin(a) * s, vh: rand(1, 5), t: 0, life: rand(.25, .6), color }); }
    }
  };
  return World;
});
