'use strict';
/* player — movement, melee chain, riftthrow/teleport/recall, dodge, damage.
   Holds its own state in the returned object; siblings reach it through
   player(). All other files are reached via lazy require() accessors. */
RB.define('player', function (require) {
  const CONFIG = require('config');
  const { clamp, dist, angTo, angDiff, nearestBoss } = require('helpers');
  const world = () => require('world');
  const audio = () => require('audio');
  const render = () => require('render');
  const game = () => require('game');
  const ui = () => require('ui');
  const weapon = () => require('weapon');
  const tutorial = () => require('tutorial');

  const Player = {
    x: 0, z: 0, radius: CONFIG.player.radius, height: CONFIG.player.height, facing: 0,
    hp: 100, stamina: 100,
    vx: 0, vz: 0, moving: false,
    attackT: -1, attackIdx: 0, attackUnarmed: false, attackHitDone: false, comboWindow: 0,
    dodgeT: -1, dodgeCd: 0, dodgeDx: 0, dodgeDz: 0, dodgeDist: 0,
    iFrames: 0, hitstun: 0, contactImmune: 0,
    tpCd: 0, recallArmed: false, rmbConsumedByRecall: false,
    lockOn: false, dead: false,
    combatTimer: 999, staminaFlash: 0, hurtFlash: 0,
    stats: { hitsTaken: 0 },
    reset(x, z) {
      const c = CONFIG.player;
      Object.assign(this, { x, z, hp: c.maxHp, stamina: c.maxStamina, facing: 0,
        attackT: -1, attackIdx: 0, comboWindow: 0, dodgeT: -1, dodgeCd: 0, iFrames: 0,
        hitstun: 0, contactImmune: 0, tpCd: 0, recallArmed: false, dead: false,
        combatTimer: 999, staminaFlash: 0, hurtFlash: 0, vx: 0, vz: 0 });
      weapon().reset();
    },
    spend(amount) {
      if (this.stamina < amount) { this.staminaFlash = 0.45; audio().sfx('dodgefail'); return false; }
      this.stamina -= amount; return true;
    },
    gainStamina(amount) { this.stamina = clamp(this.stamina + amount, 0, CONFIG.player.maxStamina); },
    aimAngle(bosses) {
      if (this.lockOn) {
        const t = nearestBoss(bosses, this.x, this.z);
        if (t) return angTo(this.x, this.z, t.x, t.z);
      }
      const w = render().worldFromScreen(require('input').mouse.x, require('input').mouse.y);
      return angTo(this.x, this.z, w.x, w.z);
    },
    update(dt, bosses) {
      const C = CONFIG.player;
      const Input = require('input');
      const Weapon = weapon();
      this.tpCd = Math.max(0, this.tpCd - dt);
      this.dodgeCd = Math.max(0, this.dodgeCd - dt);
      this.iFrames = Math.max(0, this.iFrames - dt);
      this.hitstun = Math.max(0, this.hitstun - dt);
      this.contactImmune = Math.max(0, this.contactImmune - dt);
      this.staminaFlash = Math.max(0, this.staminaFlash - dt);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt);
      this.combatTimer += dt;
      if (this.comboWindow > 0) { this.comboWindow -= dt; if (this.comboWindow <= 0) this.attackIdx = 0; }

      if (this.combatTimer >= C.stamina.oocDelay) this.gainStamina(C.stamina.oocRate * dt);

      if (Input.actionPressed('lockon')) { this.lockOn = !this.lockOn; audio().sfx('ui'); }

      const inDodge = this.dodgeT >= 0;
      const inAttack = this.attackT >= 0;

      let mx = (Input.down('right') ? 1 : 0) - (Input.down('left') ? 1 : 0) + Input.gp.ax;
      let mz = (Input.down('down') ? 1 : 0) - (Input.down('up') ? 1 : 0) + Input.gp.az;
      const ml = Math.hypot(mx, mz);
      if (ml > 1) { mx /= ml; mz /= ml; }
      this.moving = ml > 0.05;

      if (inDodge) {
        this.dodgeT += dt;
        const p = clamp(this.dodgeT / C.dodge.duration, 0, 1);
        const peak = 2 * this.dodgeDist / C.dodge.duration;
        const v = peak * (1 - p);
        this.x += this.dodgeDx * v * dt; this.z += this.dodgeDz * v * dt;
        if (this.dodgeT >= C.dodge.duration) this.dodgeT = -1;
      } else if (this.hitstun <= 0 && !this.dead) {
        const spd = inAttack ? C.moveSpeed * 0.25 : C.moveSpeed;
        this.x += mx * spd * dt; this.z += mz * spd * dt;
        if (this.moving && !inAttack && !this.lockOn) this.facing = Math.atan2(mz, mx);
        if (this.lockOn) { const t = nearestBoss(bosses, this.x, this.z); if (t) this.facing = angTo(this.x, this.z, t.x, t.z); }
      }
      world().clampPoint(this, this.radius);
      world().collideSolids(this);

      if (this.dead) return;

      if ((Input.justPressed('__LMB') || Input.actionPressed('attackKey')) && !inAttack && !inDodge && this.hitstun <= 0) {
        const unarmed = Weapon.out();
        const def = unarmed ? C.unarmed : C.melee;
        const cost = unarmed ? def.staminaCost : C.melee.staminaCost;
        if (this.spend(cost)) {
          this.attackT = 0; this.attackUnarmed = unarmed; this.attackHitDone = false;
          if (!unarmed) { if (this.comboWindow <= 0) this.attackIdx = 0; } else this.attackIdx = 0;
          this.facing = this.aimAngle(bosses);
          audio().sfx(this.attackIdx === 2 ? 'swing2' : 'swing');
        }
      }
      if (this.attackT >= 0) {
        const def = this.attackUnarmed ? C.unarmed : C.melee;
        this.attackT += dt;
        const a0 = def.activeStart, a1 = def.activeEnd;
        if (!this.attackHitDone && this.attackT >= a0 && this.attackT <= a1) {
          const dmg = this.attackUnarmed ? def.damage : def.damages[this.attackIdx];
          for (const b of bosses) {
            if (b.dead || b.untargetable) continue;
            const d = dist(this.x, this.z, b.x, b.z);
            if (d < def.range + b.radius && Math.abs(angDiff(this.facing, angTo(this.x, this.z, b.x, b.z))) < def.arc / 2) {
              b.takeDamage(dmg, 'melee');
              this.gainStamina(C.melee.onHitStamina);
              this.combatTimer = 0; this.attackHitDone = true;
              audio().sfx(!this.attackUnarmed && this.attackIdx === 2 ? 'heavyhit' : 'hit');
              world().addShake(this.attackIdx === 2 ? 0.25 : 0.12);
              break;
            }
          }
          if (!this.attackHitDone && this.attackT >= a1 - dt) this.attackHitDone = true;
        }
        if (this.attackT >= def.swingTime) {
          this.attackT = -1;
          if (!this.attackUnarmed) { this.attackIdx = (this.attackIdx + 1) % 3; this.comboWindow = C.melee.comboGrace; }
        }
      }

      const riftDown = Input.justPressed('__RMBDOWN') || Input.actionPressed('riftKey');
      const riftHeld = Input.mouse.rmb || Input.gp.rift || Input.down('riftKey');
      const riftUp = Input.justPressed('__RMBUP') || Input.justPressed('__RIFTUP');

      if (riftDown) {
        this.rmbConsumedByRecall = false;
        if (!Weapon.out()) {
          if (this.hitstun <= 0 && this.attackT < 0 && this.spend(C.riftthrow.staminaCost)) {
            this.facing = this.aimAngle(bosses);
            let target = render().worldFromScreen(Input.mouse.x, Input.mouse.y);
            if (this.lockOn) { const t = nearestBoss(bosses, this.x, this.z); if (t) target = { x: t.x, z: t.z }; }
            Weapon.throwFrom(this.x + Math.cos(this.facing) * 0.6, this.z + Math.sin(this.facing) * 0.6, this.facing, target);
            this.rmbConsumedByRecall = true;
          } else this.rmbConsumedByRecall = true;
        }
      }
      if (riftHeld && Weapon.out() && !this.rmbConsumedByRecall &&
          (Weapon.state === 'stuck' || Weapon.state === 'lodged') && Input.rmbHoldTime() >= C.riftthrow.recallHold) {
        Weapon.startRecall(); this.rmbConsumedByRecall = true;
      }
      if (riftUp && !this.rmbConsumedByRecall && Weapon.out()) {
        this.tryTeleport(bosses);
      }

      if (Input.actionPressed('dodge')) {
        const canCancelAttack = this.attackT < 0 || this.attackT >= C.melee.noCancelWindow;
        if (!inDodge && this.dodgeCd <= 0 && this.hitstun <= 0 && canCancelAttack) {
          if (this.spend(C.dodge.staminaCost)) {
            this.attackT = -1;
            this.dodgeT = 0; this.dodgeCd = C.dodge.cooldown;
            this.iFrames = Math.max(this.iFrames, C.dodge.iFrames);
            if (this.moving) { const l = Math.hypot(mx, mz) || 1; this.dodgeDx = mx / l; this.dodgeDz = mz / l; this.dodgeDist = C.dodge.dashDistance; }
            else { this.dodgeDx = -Math.cos(this.facing); this.dodgeDz = -Math.sin(this.facing); this.dodgeDist = C.dodge.distance; }
            audio().sfx('dodge');
          }
        }
      }
    },
    bindCodeFor() { return 'dodge'; },
    tryTeleport(bosses) {
      const C = CONFIG.player.riftthrow;
      const Weapon = weapon();
      if (this.hitstun > 0) return;
      if (Weapon.state !== 'stuck' && Weapon.state !== 'lodged' && Weapon.state !== 'flying') return;
      if (!this.spend(C.teleportCost)) { ui().flashTp(); return; }
      const wasLodgedIn = Weapon.state === 'lodged' ? Weapon.lodgedIn : null;
      const dest = { x: Weapon.x, z: Weapon.z, radius: this.radius };
      world().clampPoint(dest, this.radius + 0.1);
      world().collideSolids(dest);
      world().spark(this.x, this.z, 1, '#46e0c8', 12, 7);
      this.x = dest.x; this.z = dest.z;
      this.iFrames = Math.max(this.iFrames, C.teleportIFrames);
      Weapon.state = 'hand'; Weapon.lodgedIn = null;
      audio().sfx('teleport');
      world().spark(this.x, this.z, 1, '#46e0c8', 16, 8);
      if (wasLodgedIn && !wasLodgedIn.dead) {
        let dmg = C.riftstrikeDamage;
        if (wasLodgedIn.coreExposed) dmg *= CONFIG.warden.coreRiftstrikeMult;
        wasLodgedIn.takeDamage(dmg, 'riftstrike');
        wasLodgedIn.stagger();
        if (C.riftstrikeStamina > 0) this.gainStamina(C.riftstrikeStamina);
        this.combatTimer = 0;
        audio().sfx('riftstrike'); world().addShake(0.5);
        world().dmgNum(wasLodgedIn.x, wasLodgedIn.z, wasLodgedIn.height * 0.7, dmg, 'rift');
        if (game().mode === 'tutorial') tutorial().complete('riftstrike');
      }
      if (game().mode === 'tutorial') tutorial().complete('teleport');
    },
    takeDamage(amount, source = '', ignoreIFrames = false) {
      if (this.dead || (this.iFrames > 0 && !ignoreIFrames)) return false;
      this.hp -= amount; this.stats.hitsTaken++; game().runStats.hitsTaken++;
      this.combatTimer = 0; this.hurtFlash = 0.4;
      this.hitstun = CONFIG.player.hitstun;
      this.attackT = -1;
      audio().sfx('playerhit'); world().addShake(0.45);
      world().dmgNum(this.x, this.z, 1.6, amount, 'player');
      world().spark(this.x, this.z, 1, '#b8333f', 10, 6);
      if (this.hp <= 0) { this.hp = 0; this.dead = true; game().onPlayerDeath(); }
      return true;
    }
  };
  return Player;
});
