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
      r: cfg.projRadius, dmg: cfg.damage, splash: cfg.splash, life: 6 });
    audio().sfx('coal');
  }
  function spawnShard(x, z, ang, dmg, speed, turnRate, life) {
    world().projectiles.push({ type: 'shard', x, z, h: 1.5, ang, speed, turnRate, r: 0.35, dmg, life });
    audio().sfx('shard');
  }
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
      let kill = p.life <= 0;
      const pt = { x: p.x, z: p.z };
      if (W.clampPoint(pt, 0.2)) kill = true;
      if (W.blockedByPillar(p.x, p.z, p.r)) { kill = true; W.spark(p.x, p.z, 1.4, p.type === 'shard' ? '#cfd5ef' : '#ff7a2f', 6, 4); }
      if (!kill && dist(p.x, p.z, Player.x, Player.z) < p.r + Player.radius) {
        if (Player.takeDamage(p.dmg, p.type)) {
          kill = true;
          W.spark(p.x, p.z, 1.2, p.type === 'shard' ? '#cfd5ef' : '#ff7a2f', 8, 5);
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
        case 'ring': {
          const c = CONFIG.warden.attacks.W3;
          hz.r = lerp(c.rMin, c.rMax, clamp(hz.t / c.expandTime, 0, 1));
          const d = dist(hz.x, hz.z, Player.x, Player.z);
          if (!hz.hit && Math.abs(d - hz.r) < c.band / 2 + Player.radius) {
            if (Player.takeDamage(c.damage, 'ring')) { hz.hit = true; hz.burnAt = hz.t + 0.8; }
          }
          if (hz.hit && hz.burnAt != null && hz.t >= hz.burnAt && !Player.dead) {
            Player.hp = Math.max(0, Player.hp - c.burn);
            W.dmgNum(Player.x, Player.z, 1.5, c.burn, 'player');
            if (Player.hp <= 0) { Player.dead = true; game().onPlayerDeath(); }
            hz.burnAt = null;
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
      }
    }
  }
  return { spawnCoal, spawnShard, updateProjectiles, updateHazards };
});
