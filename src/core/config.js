'use strict';
/* CONFIG (T-05) — pure data module. No dependencies; returns the tuning table. */
RB.define('config', function () {
  return {
    sim: { hz: 60 },
    player: {
      maxHp: 100, maxStamina: 100,
      moveSpeed: 10,
      radius: 0.45, height: 1.8,
      melee: {
        damages: [12, 12, 20],
        staminaCost: 0,
        range: 2.3, arc: 1.9,
        swingTime: 0.42, comboGrace: 0.85,
        noCancelWindow: 0.2,
        activeStart: 0.14, activeEnd: 0.3,
        onHitStamina: 8
      },
      unarmed: { damage: 4, staminaCost: 0, range: 1.6, arc: 1.6, swingTime: 0.42, activeStart: 0.1, activeEnd: 0.22 },
      riftthrow: {
        maxRange: 20, speed: 32, damage: 8, staminaCost: 30,
        lodgeTime: 3.0,
        teleportCooldown: 0,
        teleportCost: 0,
        teleportIFrames: 0.0,
        riftstrikeDamage: 15, riftstrikeStamina: 0, riftstrikeStaggerRange: 2.6,
        recallHold: 0.6, recallSpeed: 38
      },
      dodge: { distance: 4.0, dashDistance: 5.5, duration: 0.35, iFrames: 0.3, cooldown: 1.0, staminaCost: 30 },
      stamina: { onHitRegen: 6, riftstrikeRegen: 0, oocDelay: 10.0, oocRate: 0 },
      hitstun: 0.0
    },
    warden: {
      name: 'THE CRUCIBLE WARDEN', hp: 600, phase2At: 0.5,
      moveSpeed: [6.0, 6.0], contactPush: 8, radius: 1.5, height: 3.5,
      stagger: { window: 3.0, threshold: 60, duration: 0.8, immunity: 10.0 },
      idle: [0.9, 1.3],
      transitionTime: 1.0,
      behavior: { approachDist: 3.2, glueBuildRange: 5.5, glueDecayMult: 2.0, w3GlueThreshold: 1.2, w7GlueThreshold: 1.2, w7Chance: 0.30 },
      attacks: {
        W1: { windup: 0.8, damage: 40, range: 3.0, arc: 1.4, shock: 3.0, recovery: 1.5 },
        W2: { windup: 0.7, damage: 30, range: 4.5, arc: Math.PI, recovery: 1.0 },
        W3: { windup: 1.0, damage: 35, burn: 5, rMin: 1.0, rMax: 8.0, expandTime: 1.2, band: 2.0, lingerTime: 5.0 },
        W4: { windup: 0.5, damage: 15, hop: 6.0, projSpeed: 20.0, projRadius: 0.5, splash: 1.4,
              countP1: 5, countP2: 7, spread: 0.42, curveRate: 1.4 },
        W5: { windup: 0.6, damage: 30, range: 4.5, arc: Math.PI, recovery: 1.0, trailLife: 3.0, trailDps: 5 },
        W6: { windup: 0.7, damage: 35, range: 3.0, arc: 1.4, shock: 3.0, slams: 3, gap: 0.55, recovery: 2.0, trackSpeed: 7.5 },
        W7: { windup: 1.2, damage: 65, safeCircles: 3, safeRadius: 2.5, recovery: 1.6, coreExpose: 3.0 }
      },
      coreRiftstrikeMult: 2.0,
      arena: { type: 'circle', radius: 15, braziers: 4, brazierRadius: 0.8 }
    },
    choir: {
      name: 'SISTER VESSEL, THE THRESHING CHOIR', hp: 750, phase2At: 0.5,
      moveSpeed: [7.0, 8.0], dashSpeed: 14.0, contactPush: 8, radius: 0.8, height: 2.5,
      stagger: { window: 3.0, threshold: 80, duration: 0.8, immunity: 10.0 },
      idle: [0.7, 1.1],
      transitionTime: 1.0,
      enrageTime: 420, enrageShardMult: 1.5,
      attacks: {
        C1: { windup: 0.5, hits: 4, damage: 18, gap: 0.4, step: 4.0, range: 2.4, arc: 1.6, recovery: 1.2 },
        C2: { windup: 0.8, shards: 3, shardsP2: 5, damage: 12, speed: 20, turnRate: 1.25, life: 9 },
        C3: { windup: 0.3, distMin: 10, distMax: 14, dashTime: 0.45 },
        C4: { windup: 0.8, damage: 18, radius: 6.0, hits: 2, gap: 0.3, recovery: 1.4 },
        C5: { windup: 0.5, hits: 5, damage: 18, gap: 0.4, step: 4.0, range: 2.4, arc: 1.6,
              finisher: 28, finisherTele: 0.0, leap: 5.0, finisherRadius: 2.5, recovery: 1.2 },
        C6: { windup: 0.8, rMin: 3, rMax: 12, growTime: 0.5, dps: 70, recovery: 0.8 }
      },
      echo: { hp: 80, damageMult: 0.5, killStamina: 0, count: 2, speed: 5.0 },
      behavior: { c4GlueTime: 1.2, glueBuildRange: 4, glueDecayMult: 2.0, c3Interval: 12.0, c3DamageTrigger: 100, c3DamageWindow: 4.0 },
      arena: { type: 'rect', w: 35, h: 20, pillarRows: [-6, 6], pillarXs: [-12, -4, 4, 12], pillarRadius: 0.9 }
    },
    encounters: {
      campaign: ['warden', 'choir'],
      list: {
        warden: { label: 'Warden', theme: 'forge',  music: 'warden', spawn: [0, 10],
                  intro: 'THE CRUCIBLE WARDEN BARS THE GATE', victory: 'THE FURNACE GUTTERS' },
        choir:  { label: 'Choir',  theme: 'chapel', music: 'choir',  spawn: [0, 7],
                  intro: 'A HYMN RISES IN THE NAVE',          victory: 'THE CHOIR FALLS SILENT' }
      }
    },
    tutorial: { arena: { type: 'circle', radius: 12 }, dummyHp: 80 }
  };
});
