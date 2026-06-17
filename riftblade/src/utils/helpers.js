'use strict';
/* helpers — pure utilities. No dependencies. nearestBoss lives here because it
   is a stateless query over a boss list, used by both player and render. */
RB.define('helpers', function () {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const angTo = (ax, az, bx, bz) => Math.atan2(bz - az, bx - ax);
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const fmtTime = s => { const m = Math.floor(s / 60), r = (s % 60); return `${m}:${r.toFixed(1).padStart(4, '0')}`; };
  function nearestBoss(bosses, x, z) {
    let best = null, bd = 1e9;
    for (const b of bosses) { if (b.dead || b.untargetable) continue; const d = dist(x, z, b.x, b.z); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  return { TAU, clamp, lerp, dist, angTo, angDiff, rand, pick, fmtTime, nearestBoss };
});
