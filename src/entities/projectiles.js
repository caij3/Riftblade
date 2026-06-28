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
  function spawnBolt(x, z, ang, speed, radius, dmg, delay = 0) {
    // crossbow bolt: straight, fast, with an optional fuse so it telegraphs (and a volley staggers) out of one rank
    world().projectiles.push({ type: 'bolt', x, z, h: 1.3, ang, speed, r: radius, dmg, life: 5, delay, delay0: delay });
  }
  const projColor = t => t === 'shard' ? '#cfd5ef' : t === 'lance' ? '#cfe8d0' : t === 'bolt' ? '#e7cf86' : '#ff7a2f';
  // perpendicular distance from a point to a knight's charge lane (segment from origin along ang)
  function lanePerp(hz, px, pz) {
    const dx = Math.cos(hz.ang), dz = Math.sin(hz.ang);
    let t = (px - hz.x) * dx + (pz - hz.z) * dz;
    t = clamp(t, 0, hz.laneLength);
    return dist(px, pz, hz.x + dx * t, hz.z + dz * t);
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
      else if (p.type === 'lance') {            // fast, straight bone bolt
        p.x += Math.cos(p.ang) * p.speed * dt; p.z += Math.sin(p.ang) * p.speed * dt;
      }
      else if (p.type === 'bolt') {             // crossbow bolt: waits out its fuse at the rank, then flies straight
        if (p.delay > 0) { p.delay -= dt; p.life += dt; continue; }   // hold position + don't age while fused
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
          const inDisc = armed && dist(hz.x, hz.z, Player.x, Player.z) < hz.cur + Player.radius;
          if (inDisc) {                                   // contact always bites, then ticks while you stay — can't be out-run, and catches you if the disc expands onto you
            if (!hz.wasIn) hz.tick = 0;                   // fresh entry forces an immediate tick so a fast pass-through still takes a hit
            hz.tick -= dt;
            if (hz.tick <= 0) { Player.takeDamage(hz.dps * 0.5, 'rot'); hz.tick = 0.5; } // hz.dps per second
            hz.wasIn = true;
          } else {
            hz.wasIn = false;                             // out of the disc — the next entry counts as fresh contact
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
        case 'rotline': {                            // necrotic line from the boss; arms after a beat, detonates once, then lingers as DoT
          const dx = Math.cos(hz.ang), dz = Math.sin(hz.ang);
          let proj = (Player.x - hz.x) * dx + (Player.z - hz.z) * dz;
          proj = clamp(proj, 0, hz.length);                  // segment runs FROM the boss outward (one-sided)
          const perp = dist(Player.x, Player.z, hz.x + dx * proj, hz.z + dz * proj);
          const armed = hz.t >= (hz.arm || 0);
          const inBand = perp < hz.band / 2 + Player.radius;
          if (armed && !hz.detonated) {                      // big hit fires once, the instant it arms — only catches whoever's in it on spawn
            if (inBand) Player.takeDamage(hz.dmg, 'rot');
            hz.detonated = true; hz.tick = 0.5; hz.wasIn = inBand;
          } else if (armed && inBand) {                      // lingering rot: contact always bites, then ticks while you stay — can't be out-run
            if (!hz.wasIn) hz.tick = 0;                       // fresh entry forces an immediate tick so a fast pass-through still takes a hit
            hz.tick -= dt;
            if (hz.tick <= 0) { Player.takeDamage(hz.dps * 0.5, 'rot'); hz.tick = 0.5; }
            hz.wasIn = true;
          } else if (armed) {
            hz.wasIn = false;                                 // out of the band — the next entry counts as fresh contact
          }
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
        case 'knight': {                             // Sovereign: a phantom knight — pure attack animation, never an entity
          if (hz.mode === 'charge') {
            const armed = hz.t >= hz.muster;
            if (armed) {
              const ct = clamp((hz.t - hz.muster) / hz.chargeTime, 0, 1);  // 0..1 along the lane
              const front = hz.speed * (hz.t - hz.muster);                 // distance the phantom has advanced
              const fx = hz.x + Math.cos(hz.ang) * Math.min(front, hz.laneLength);
              const fz = hz.z + Math.sin(hz.ang) * Math.min(front, hz.laneLength);
              hz.fx = fx; hz.fz = fz; hz.ct = ct;                          // cache for render
              if (!hz.struck && dist(fx, fz, Player.x, Player.z) < hz.laneBand / 2 + Player.radius) {
                if (Player.takeDamage(hz.dmg, 'knight')) { hz.struck = true; W.spark(fx, fz, 1.3, hz.banner, 10, 6); }
              }
              // P2 linger: once the charge has fully passed, leave a brief scorch in the lane
              if (ct >= 1 && hz.linger > 0) {
                const onLane = lanePerp(hz, Player.x, Player.z) < hz.laneBand / 2 + Player.radius;
                if (onLane) {
                  if (!hz.wasIn) hz.tick = 0;
                  hz.tick -= dt;
                  if (hz.tick <= 0) { Player.takeDamage(hz.linger * 0.5, 'rot'); hz.tick = 0.5; }
                  hz.wasIn = true;
                } else hz.wasIn = false;
              }
            }
            const total = hz.muster + hz.chargeTime + (hz.linger > 0 ? hz.lingerLife : 0.15);
            if (hz.t >= total) W.hazards.splice(i, 1);
          } else {                                    // slam: a stationary disc that detonates once
            if (!hz.struck && hz.t >= hz.muster) {
              if (dist(hz.x, hz.z, Player.x, Player.z) < hz.radius + Player.radius) Player.takeDamage(hz.dmg, 'knight');
              hz.struck = true; audio().sfx('slam'); W.addShake(0.3); W.spark(hz.x, hz.z, 1.2, hz.banner, 10, 6);
            }
            if (hz.t >= hz.muster + 0.35) W.hazards.splice(i, 1);
          }
          break;
        }
      }
    }
  }
  return { spawnCoal, spawnShard, spawnLance, spawnBolt, updateProjectiles, updateHazards };
});
