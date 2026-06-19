'use strict';
/* projectiles — coal/shard spawners and the projectile + hazard updaters.
   Pure functions over world state; reaches player()/world()/audio()/game(). */
RB.define('projectiles', function (require) {
  const CONFIG = require('config');
  const { clamp, lerp, angTo, angDiff, dist } = require('helpers');
  const world = () => require('world');
  const audio = () => require('audio');
  const player = () => require('player');
  const game = () => require('game');

  function spawnCoal(x, z, ang, cfg, curve = 0) {
    world().projectiles.push({ type: 'coal', x, z, h: 1.4, ang, speed: cfg.projSpeed, curve,
      r: cfg.projRadius, dmg: cfg.damage, splash: cfg.splash, life: (cfg.life != null ? cfg.life : 6) });
    audio().sfx('coal');
  }
  function spawnShard(x, z, ang, dmg, speed, turnRate, life) {
    world().projectiles.push({ type: 'shard', x, z, h: 1.5, ang, speed, turnRate, r: 0.35, dmg, life });
    audio().sfx('shard');
  }
  function spawnLance(x, z, ang, speed, radius, dmg) {
    world().projectiles.push({ type: 'lance', x, z, h: 1.4, ang, speed, r: radius, dmg, life: 5 });
    audio().sfx('lance');
  }
  const projColor = t => t === 'shard' ? '#cfd5ef' : t === 'lance' ? '#cfe8d0' : '#ff7a2f';
  function updateProjectiles(dt) {
    const W = world(), Player = player();
    for (let i = W.projectiles.length - 1; i >= 0; i--) {
      const p = W.projectiles[i];
      p.life -= dt;
      if (p.type === 'coal') {
        if (p.curve) p.ang += p.curve * dt;
        p.x += Math.cos(p.ang) * p.speed * dt; p.z += Math.sin(p.ang) * p.speed * dt;
      }
      else if (p.type === 'shard') {
        const want = angTo(p.x, p.z, Player.x, Player.z);
        const d = angDiff(p.ang, want);
        p.ang += clamp(d, -p.turnRate * dt, p.turnRate * dt);
        p.x += Math.cos(p.ang) * p.speed * dt; p.z += Math.sin(p.ang) * p.speed * dt;
      }
      else if (p.type === 'lance') {            // fast, straight bone bolt
        p.x += Math.cos(p.ang) * p.speed * dt; p.z += Math.sin(p.ang) * p.speed * dt;
      }
      let kill = p.life <= 0;
      const pt = { x: p.x, z: p.z };
      if (W.clampPoint(pt, 0.2)) kill = true;
      if (W.blockedByPillar(p.x, p.z, p.r)) { kill = true; W.spark(p.x, p.z, 1.4, projColor(p.type), 6, 4); }
      if (!kill && dist(p.x, p.z, Player.x, Player.z) < p.r + Player.radius) {
        if (Player.takeDamage(p.dmg, p.type)) {
          kill = true;
          W.spark(p.x, p.z, 1.2, projColor(p.type), 8, 5);
        }
      }
      if (kill) W.projectiles.splice(i, 1);
    }
  }
  function updateHazards(dt, boss) {
    const W = world(), Player = player();
    for (let i = W.hazards.length - 1; i >= 0; i--) {
      const hz = W.hazards[i]; hz.t += dt;
      switch (hz.type) {
        case 'ring': {                               // Warden W3: expanding shockwave, then a settled ring of fire
          const c = CONFIG.warden.attacks.W3;
          const spreading = hz.t < c.expandTime;
          hz.r = lerp(c.rMin, c.rMax, clamp(hz.t / c.expandTime, 0, 1));
          const d = dist(hz.x, hz.z, Player.x, Player.z);
          const onBand = Math.abs(d - hz.r) < c.band / 2 + Player.radius;
          if (spreading) {                            // moving edge: one solid hit as it sweeps past you
            if (onBand && !hz.hit && Player.takeDamage(c.damage, 'ring')) hz.hit = true;
          } else if (onBand) {                        // settled floor hazard: burns while you stand on the ring
            hz.tick = (hz.tick || 0) - dt;
            if (hz.tick <= 0) { Player.takeDamage(c.burn, 'fire'); hz.tick = c.burnInterval; }
          } else {
            hz.tick = 0;                              // off the ring -> stepping back on burns immediately
          }
          if (hz.t >= c.expandTime + c.lingerTime) W.hazards.splice(i, 1);
          break;
        }
        case 'trail': {
          if (hz.t > hz.life) { W.hazards.splice(i, 1); break; }
          if (dist(hz.x, hz.z, Player.x, Player.z) < hz.r + Player.radius) {
            hz.tick = (hz.tick || 0) - dt;
            if (hz.tick <= 0) { Player.takeDamage(hz.dps, 'fire'); hz.tick = 1.0; }
          }
          break;
        }
        case 'eruption': {
          if (!hz.done) {
            let safe = false;
            for (const s of hz.safe) if (dist(s.x, s.z, Player.x, Player.z) < s.r) { safe = true; break; }
            if (!safe) Player.takeDamage(hz.dmg, 'eruption', true);
            hz.done = true; audio().sfx('fire'); W.addShake(0.8);
          }
          if (hz.t > 0.6) W.hazards.splice(i, 1);
          break;
        }
        case 'vortex': {
          const c = CONFIG.choir.attacks.C6;
          hz.r = lerp(c.rMin, c.rMax, clamp(hz.t / c.growTime, 0, 1));
          hz.x = hz.owner.x; hz.z = hz.owner.z;
          if (dist(hz.x, hz.z, Player.x, Player.z) < hz.r + Player.radius) {
            hz.tick = (hz.tick || 0) - dt;
            if (hz.tick <= 0) { Player.takeDamage(c.dps * 0.25, 'vortex', true); hz.tick = 0.25; }
          }
          if (hz.t >= c.growTime || hz.owner.dead || hz.owner.staggered) { hz.owner.vortexActive = false; W.hazards.splice(i, 1); }
          break;
        }
        case 'shockring': if (hz.t > hz.life) W.hazards.splice(i, 1); break;
        case 'rot': {                               // Shepherd N4/N7: locked delay, then expanding DoT
          const d = hz.delay || 0;
          const armed = hz.t >= d;
          const grow = clamp((hz.t - d) / hz.expandTime, 0, 1);
          hz.cur = Math.max(0, (hz.r - hz.rim) * grow);   // current dangerous radius (0 during the delay; cached for render)
          hz.armed = armed;
          if (armed && dist(hz.x, hz.z, Player.x, Player.z) < hz.cur + Player.radius) {
            hz.tick = (hz.tick || 0) - dt;
            if (hz.tick <= 0) { Player.takeDamage(hz.dps * 0.5, 'rot'); hz.tick = 0.5; } // hz.dps per second
          }
          if (hz.t >= d + hz.life) W.hazards.splice(i, 1);
          break;
        }
        case 'bloom': {                              // Bloated Risen death: swell then necrotic burst
          if (!hz.done && hz.t >= hz.telegraph) {
            if (dist(hz.x, hz.z, Player.x, Player.z) < hz.r + Player.radius) Player.takeDamage(hz.dmg, 'bloom', true);
            hz.done = true; audio().sfx('fire'); W.addShake(0.4);
          }
          if (hz.t >= hz.telegraph + 0.4) W.hazards.splice(i, 1);
          break;
        }
        case 'rotline': {                            // necrotic line from the boss; arms after a beat, then bites + DoT
          const dx = Math.cos(hz.ang), dz = Math.sin(hz.ang);
          let proj = (Player.x - hz.x) * dx + (Player.z - hz.z) * dz;
          proj = clamp(proj, 0, hz.length);                  // segment runs FROM the boss outward (one-sided)
          const perp = dist(Player.x, Player.z, hz.x + dx * proj, hz.z + dz * proj);
          const armed = hz.t >= (hz.arm || 0);
          if (armed && perp < hz.band / 2 + Player.radius) {
            if (!hz.hit) { Player.takeDamage(hz.dmg, 'rot'); hz.hit = true; }   // initial bite, once armed
            hz.tick = (hz.tick || 0) - dt;
            if (hz.tick <= 0) { Player.takeDamage(hz.dps * 0.5, 'rot'); hz.tick = 0.5; }
          } else if (!armed || perp >= hz.band / 2 + Player.radius) { hz.hit = false; }
          if (hz.t >= hz.life + (hz.arm || 0)) W.hazards.splice(i, 1);
          break;
        }
        case 'raise': {                              // Shepherd N2/N6: grave-light holds, then bursts (damage) and raises
          if (!hz.done && hz.t >= hz.telegraph) {
            if (dist(hz.x, hz.z, Player.x, Player.z) < hz.r + Player.radius) Player.takeDamage(hz.dmg, 'rot');
            if (hz.owner && !hz.owner.dead) hz.owner.spawnRisenAt(hz.x, hz.z, hz.bloated);
            hz.done = true; audio().sfx('raise'); W.spark(hz.x, hz.z, 1.2, '#8fd9a0', 14, 6);
          }
          if (hz.t >= hz.telegraph + 0.3) W.hazards.splice(i, 1);
          break;
        }
      }
    }
  }
  return { spawnCoal, spawnShard, spawnLance, updateProjectiles, updateHazards };
});
