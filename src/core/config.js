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
      dodge: { distance: 4.0, dashDistance: 6.5, duration: 0.35, iFrames: 0.3, cooldown: 1.0, staminaCost: 0 },
      stamina: { onHitRegen: 6, riftstrikeRegen: 0, oocDelay: 10.0, oocRate: 0 },
      hitstun: 0.0
    },
    warden: {
      name: 'THE CRUCIBLE WARDEN', hp: 600, phase2At: 0.5,
      moveSpeed: [6.0, 6.0], contactPush: 8, radius: 1.5, height: 3.5,
      stagger: { window: 3.0, threshold: 60, duration: 0.8, immunity: 10.0 },
      idle: [0.9, 1.3],
      transitionTime: 1.0,
      riftstrikeNoStagger: true,
      behavior: { approachDist: 3.2, glueBuildRange: 5.5, glueDecayMult: 2.0, w3GlueThreshold: 1.2, w7GlueThreshold: 1.2, w7Chance: 0.30 },
      attacks: {
        W1: { windup: 0.8, damage: 22, range: 3.0, arc: 1.4, shock: 3.0, recovery: 1.5 },
        W2: { windup: 0.7, damage: 25, range: 4.5, arc: Math.PI, recovery: 1.0 },
        W3: { windup: 1.0, damage: 35, burn: 5, burnInterval: 1.0, rMin: 1.0, rMax: 10.0, expandTime: 1.2, band: 1.0, lingerTime: 5.0},
        W4: { windup: 0.5, damage: 15, hop: 6.0, projSpeed: 20.0, projRadius: 0.5, splash: 1.4,
              countP1: 5, countP2: 7, spread: 0.42, curveRate: 1.4, life: 2.0 },
        W5: { windup: 0.6, damage: 25, range: 4.5, arc: Math.PI, recovery: 1.0, trailLife: 3.0, trailDps: 5 },
        W6: { windup: 0.7, damage: 22, range: 3.0, arc: 1.4, shock: 3.0, slams: 3, gap: 0.55, recovery: 2.0, trackSpeed: 7.5 },
        W7: { windup: 1.2, damage: 65, safeCircles: 3, safeRadius: 2.5, recovery: 1.6, coreExpose: 3.0}
      },
      coreRiftstrikeMult: 1.5,
      arena: { type: 'circle', radius: 15, braziers: 4, brazierRadius: 0.8 }
    },
    choir: {
      name: 'SISTER VESSEL, THE THRESHING CHOIR', hp: 700, phase2At: 0.5,
      moveSpeed: [7.0, 8.0], dashSpeed: 14.0, contactPush: 8, radius: 0.8, height: 2.5,
      stagger: { window: 3.0, threshold: 80, duration: 0.8, immunity: 10.0 },
      idle: [0.7, 1.1],
      transitionTime: 1.0,
      riftstrikeNoStagger: true,
      enrageTime: 420, enrageShardMult: 1.5,
      attacks: {
        C1: { windup: 0.5, hits: 4, damage: 18, gap: 0.4, step: 5.0, range: 2.4, arc: 1.6, recovery: 1.2 },
        C2: { windup: 0.8, shards: 3, shardsP2: 5, damage: 12, speed: 20, turnRate: 1.2, life: 9 },
        C3: { windup: 0.3, distMin: 10, distMax: 14, dashTime: 0.45 },
        C4: { windup: 0.8, damage: 18, radius: 6.0, hits: 2, gap: 0.3, recovery: 1.4},
        C5: { windup: 0.5, hits: 5, damage: 18, gap: 0.4, step: 5.0, range: 2.4, arc: 1.6,
              finisher: 28, finisherTele: 0.0, leap: 5.0, finisherRadius: 3.0, recovery: 1.2 },
        C6: { windup: 1.0, rMin: 3, rMax: 13, growTime: 1.0, dps: 70, recovery: 0.8}
      },
      echo: { hp: 80, damageMult: 0.5, killStamina: 0, count: 2, speed: 5.0 },
      behavior: { c4GlueTime: 1.2, glueBuildRange: 4, glueDecayMult: 2.0, c3Interval: 12.0, c3DamageTrigger: 100, c3DamageWindow: 4.0 },
      arena: { type: 'rect', w: 35, h: 20, pillarRows: [-6, 6], pillarXs: [-12, -4, 4, 12], pillarRadius: 0.9 }
    },
    shepherd: {
      name: 'OSSAREN, THE GRAVE-SHEPHERD', hp: 700, phase2At: 0.5,
      moveSpeed: [6.0, 7.0], contactPush: 8, radius: 1.0, height: 3.0,
      stagger: { window: 3.0, threshold: 80, duration: 0.8, immunity: 10.0 },
      idle: [1.0, 1.5],
      transitionTime: 1.0,
      enrageTime: 420, enrageLanceMult: 1.5,
      coreRiftstrikeMult: 1.5,        // N7-interrupt Riftstrike (coreExposed) deals 2x
      riftstrikeNoStagger: true,      // Boss-3 exception: pinned, not staggered (R-NEC-06)
      behavior: { approachDist: 6.0, graveStepRange: 3.5, n5Range: 4, n7Interval: 18.0 },
      risen: {
        hp: 24, hpBloated: 24, killStamina: 0, speed: 3.0, maxAlive: 5,
        burstTelegraph: 0.5, burstRadius: 3.0, burstDamage: 18,
        spawnRadius: 1.8, spawnDelay: 0.4, spawnDamage: 12,
        melee: { windup: 0.6, hits: 1, damage: 12, gap: 0.4, step: 4.0, range: 2.4, arc: 1.6 }
      },
      attacks: {
        N1: { windup: 0.7, damage: 18, speed: 24.0, radius: 0.35, spread: 0.18, countP1: 3, countP2: 5, recovery: 0.5 },
        N2: { windup: 0.9, spawnDelay: 0.4, recovery: 0.8 },
        N3: { windup: 0.5, recovery: 0.5 },
        N4: { windup: 1.2, radius: 4.0, campTime: 2.0, delay: 0.1, expandTime: 1.0, life: 6.0, dps: 10, dpsP2: 12, recovery: 1.0 },
        N5: { windup: 0.6, range: 4.0, arc: Math.PI, damage: 22, recovery: 1.0 },
        N6: { windup: 0.9, recovery: 0.8 },
        N7: { windup: 2.0, radius: 5.0, safeRadius: 4.5, life: 6.0, recovery: 6.0 },
        N8: { windup: 0.8, arm: 0.4, damage: 20, band: 2.0, length: 20.0, life: 10.0, dps: 8, recovery: 1.0 }
      },
      arena: { type: 'circle', radius: 14, graves: 30,
        // invisible anchor points the Shepherd Grave-Steps between and seeds Risen on
        anchors: [
          { x: 0,   z: 0   },
          { x: 0,   z: -10 },
          { x: 10,  z: 0   },
          { x: 0,   z: 10  },
          { x: -10, z: 0   }
        ]
      }
    },
    sovereign: {
      name: 'THE IRON SOVEREIGN, CROWN OF THE BROKEN MARCH', hp: 800, phase2At: 0.5,
      moveSpeed: [0, 5.0],            // P1 stationary on the dais; P2 he rises and hunts
      contactPush: 9, radius: 1.2, height: 3.4,
      stagger: { window: 3.0, threshold: 85, duration: 0.8, immunity: 10.0 },
      idle: [1.0, 1.5],
      transitionTime: 1.0,
      enrageTime: 420, enrageKnightMult: 1.3,   // late-fight: faster knight charges
      coreRiftstrikeMult: 1.5,
      riftstrikeNoStagger: true,      // throne-bound; pinned, not staggered (mirrors Shepherd R-NEC-06)
      behavior: { approachDist: 99, reclaimRange: 9.0, k7Interval: 14.0,
                  huntRange: 3.5,     // P2: how close the risen king closes before issuing his next command
                  dualChance: 1.00 }, // P2: chance any command is issued together with a second one
      knights: {                      // shared phantom-knight tuning (NOT an entity — pure strike data)
        muster: 0.6,                 // telegraph hold from spawn to charge
        chargeTime: 0.38,             // travel time of the charge lunge along its lane
        laneLength: 30.0, laneBand: 1.7,
        strikeDamage: 20,
        chargeSpeed: 26.0,            // visual + hit speed of the phantom down its lane
        musterDist: 11.0,             // how far from the player the charging knights blink in
        lead: 0.22,                   // seconds of player-velocity leading on aimed charges (0 = aim at current spot)
        banner: '#c9a23b'             // gold telegraph / phantom color
      },
      attacks: {
        K2: { windup: 0.9, count: 7, gap: 2, spacing: 1.7, recovery: 1.0 }, // Phalanx (contiguous wall, one real gap to run to)
        K3: { windup: 1.0, ring: 6, gap: 2, gapP2: 1, ringR: 6.5, recovery: 1.3 },// Encirclement (charge inward, safe wedge)
        K4: { windup: 0.55, lunges: 3, lungeGap: 0.42, lungeTele: 0.5, lungeLen: 10.0,   // Vanguard Press (both phases): lunges then a jump-slam
              lungeDist: 9.0, lungeDamage: 18, finisherTele: 0.55, jumpRadius: 3.0, jumpDamage: 24,
              campTime: 2.2, recovery: 1.8 },
        K5: { windup: 0.85, damage: 26, range: 4.6, arc: Math.PI, recovery: 1.4,    // Royal Cleaver: P1 a sweep; P2 a sweep then a C5-style leap that moves the king
              finisher: 30, finisherRadius: 3.2, finisherTele: 0.5, leapTime: 0.45, leapHeight: 2.4 },
        K6: { windup: 0.9, count: 2, countP2: 3, volley: 4, boltSpeed: 22, boltRadius: 0.32,
              boltDamage: 12, spread: 0.16, gap: 0.12, aimTele: 0.45, recovery: 1.0 }, // Crossbow Rank: aim-line telegraph, then leading volleys
        K7: { windup: 1.1, pulses: 5, ringCount: 16,                                // Coronation March (P2): rings collapse wall→centre, NO safe spot
              startR: 2.0, endR: 14.5, slamRadius: 3.0, slamDamage: 24,
              pulseGap: 0.5, recovery: 2.5 }
      },
      arena: { type: 'circle', radius: 15, banners: 8,
        throne: { x: 0, z: -11.5, r: 1.7 },
        musterRing: 12.5 }
    },
    encounters: {
      campaign: ['warden', 'shepherd', 'choir', 'sovereign'],
      list: {
        warden: { label: 'Warden', theme: 'forge',  music: 'warden', spawn: [0, 10],
                  intro: 'THE CRUCIBLE WARDEN BARS THE GATE', victory: 'THE FURNACE GUTTERS' },
        choir:  { label: 'Choir',  theme: 'chapel', music: 'choir',  spawn: [0, 7],
                  intro: 'A HYMN RISES IN THE NAVE',          victory: 'THE CHOIR FALLS SILENT' },
        shepherd: { label: 'Shepherd', theme: 'ossuary', music: 'shepherd', spawn: [0, 10],
                  intro: 'OSSAREN HERDS THE DEAD',            victory: 'THE OSSUARY GOES STILL' },
        sovereign: { label: 'Sovereign', theme: 'throne', music: 'sovereign', spawn: [0, 9],
                  intro: 'THE IRON SOVEREIGN DOES NOT RISE FROM HIS THRONE', victory: 'THE CROWN HAS FALLEN' }
      }
    },
    tutorial: { arena: { type: 'circle', radius: 12 }, dummyHp: 80 }
  };
});
