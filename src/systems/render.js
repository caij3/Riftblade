'use strict';
/* render — all canvas drawing + camera. Reads (never mutates) sibling state via
   world()/game()/player()/weapon(); CONFIG and helpers are required up front. */
RB.define('render', function (require) {
  const CONFIG = require('config');
  const { TAU, clamp, lerp, rand, angTo, fmtTime, nearestBoss } = require('helpers');
  const world = () => require('world');
  const game = () => require('game');
  const player = () => require('player');
  const weapon = () => require('weapon');

  const Render = {
    cv: null, ctx: null, W: 1280, H: 720, S: 26, cam: { x: 0, z: 0 }, tpFlash: 0, _hp: null,
    fps: 0,
    init() { this.cv = document.getElementById('game'); this.ctx = this.cv.getContext('2d');
    this._hp = this.hatch(this.ctx); },
    sx(x) { return this.W / 2 + (x - this.cam.x) * this.S; },
    sy(z, h = 0) { return this.H * 0.56 + (z - this.cam.z) * this.S * 0.62 - h * this.S * 0.92; },
    worldFromScreen(px, py) {
      return { x: (px - this.W / 2) / this.S + this.cam.x, z: (py - this.H * 0.56) / (this.S * 0.62) + this.cam.z };
    },
    hudInset() {
      // Canvas-space gap reserved at the top-right so the FPS/timer readouts clear the
      // DOM hamburger (a ~44px button at right:16px). The button lives in viewport px,
      // the HUD in canvas px, so convert using the live display width (handles stretch
      // and letterbox alike).
      const dispW = (this.cv && this.cv.clientWidth) || this.W;
      return Math.max(14, this.W * 68 / dispW);
    },
    updateCamera(dt) {
      const Player = player();
      let tx = Player.x, tz = Player.z;
      const b = nearestBoss(game().bosses, Player.x, Player.z);
      if (b) { tx = lerp(Player.x, b.x, 0.38); tz = lerp(Player.z, b.z, 0.38); }
      const a = world().arena;
      if (a) {
        if (a.type === 'circle') { const m = Math.max(0, a.radius - 8); const d = Math.hypot(tx, tz); if (d > m) { tx *= m / d; tz *= m / d; } }
        else { tx = clamp(tx, -a.w / 2 + 9, a.w / 2 - 9); tz = clamp(tz, -a.h / 2 + 4, a.h / 2 - 4); }
      }
      const sm = 1 - Math.pow(0.0001, dt * (game().settings.camSmooth / 55));
      this.cam.x = lerp(this.cam.x, tx, sm); this.cam.z = lerp(this.cam.z, tz, sm);
    },
    hatch(ctx) {
      const p = document.createElement('canvas'); p.width = p.height = 8;
      const c = p.getContext('2d'); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-2, 10); c.lineTo(10, -2); c.stroke();
      return ctx.createPattern(p, 'repeat');
    },
    groundDisc(x, z, r, fill, stroke, lw = 2, hatched = false) {
      const c = this.ctx;
      c.save(); c.translate(this.sx(x), this.sy(z)); c.scale(1, 0.62);
      c.beginPath(); c.arc(0, 0, r * this.S, 0, TAU);
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (hatched && game().settings.cbSafe) { c.fillStyle = this._hp || (this._hp = this.hatch(c)); c.globalAlpha = .35; c.fill(); c.globalAlpha = 1; }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
      c.restore();
    },
    groundArc(x, z, r, facing, arc, fill, stroke, hatched = false) {
      const c = this.ctx;
      c.save(); c.translate(this.sx(x), this.sy(z)); c.scale(1, 0.62);
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r * this.S, facing - arc / 2, facing + arc / 2); c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (hatched && game().settings.cbSafe) { c.fillStyle = this._hp || (this._hp = this.hatch(c)); c.globalAlpha = .4; c.fill(); c.globalAlpha = 1; }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); }
      c.restore();
    },
    groundRing(x, z, r, band, stroke, hatched = false) {
      const c = this.ctx;
      c.save(); c.translate(this.sx(x), this.sy(z)); c.scale(1, 0.62);
      c.beginPath(); c.arc(0, 0, Math.max(0.01, r * this.S), 0, TAU);
      c.strokeStyle = stroke; c.lineWidth = Math.max(1, band * this.S);
      if (hatched && game().settings.cbSafe) c.setLineDash([7, 5]);
      c.stroke(); c.setLineDash([]);
      c.restore();
    },
    frame(dtRender) {
      const c = this.ctx, W = this.W, H = this.H;
      const World = world(), Game = game(), Player = player(), Weapon = weapon();
      if (dtRender > 0) { const inst = 1 / dtRender; this.fps = this.fps ? lerp(this.fps, inst, 0.1) : inst; }
      c.clearRect(0, 0, W, H);
      c.save();
      if (World.shake > 0.01) { c.translate(rand(-1, 1) * World.shake * 11, rand(-1, 1) * World.shake * 8); World.shake *= Math.pow(0.02, dtRender); }
      this.drawArena();
      this.drawHazardsGround();
      this.drawTelegraphs();
      this.drawStrikeTelegraphs();
      this._ents = this._ents || [];
      const ents = this._ents; ents.length = 0;
      for (const p of World.pillars) ents.push(p);
      for (const b of World.braziers) if (b.alive) ents.push(b);
      for (const p of World.props) ents.push(p);
      for (const b of Game.bosses) if (!(b.dead && (b.kind === 'echo' || b.kind === 'risen'))) ents.push(b);
      ents.push(Player);
      if (Weapon.out()) ents.push(Weapon);
      ents.sort((a, b) => a.z - b.z);
      for (const e of ents) {
        if (e === Player) this.drawPlayer();
        else if (e === Weapon) this.drawWeapon();
        else if (e.prop) this.drawGrave(e);
        else if (e.kind) this.drawBoss(e);
        else if (e.r !== undefined && e.broken !== undefined) this.drawPillar(e);
        else this.drawBrazier(e);
      }
      this.drawProjectiles();
      this.drawFx(dtRender);
      c.restore();
      if (Game.inFight() || Game.mode === 'tutorial') this.drawHUD();
      if (Player.hurtFlash > 0) {
        const g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
        g.addColorStop(0, 'rgba(184,51,63,0)'); g.addColorStop(1, `rgba(184,51,63,${Player.hurtFlash * 0.8})`);
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      c.save();
      c.font = '12px system-ui'; c.textAlign = 'right';
      c.fillStyle = this.fps < 50 ? '#ff5a5a' : this.fps < 58 ? '#ffc46b' : '#7d7390';
      c.fillText(`${Math.round(this.fps)} FPS`, W - this.hudInset(), 16);
      c.restore();
    },
    drawArena() {
      const c = this.ctx, a = world().arena; if (!a) return;
      const isForge = game().arenaTheme === 'forge';
      const isOssuary = game().arenaTheme === 'ossuary';
      const bg = c.createLinearGradient(0, 0, 0, this.H);
      if (isForge) { bg.addColorStop(0, '#120c0e'); bg.addColorStop(1, '#1d1410'); }
      else if (game().arenaTheme === 'chapel') { bg.addColorStop(0, '#0d0d14'); bg.addColorStop(1, '#15141d'); }
      else if (isOssuary) { bg.addColorStop(0, '#0a0f0c'); bg.addColorStop(1, '#0e1512'); }
      else { bg.addColorStop(0, '#0c0e12'); bg.addColorStop(1, '#13161c'); }
      c.fillStyle = bg; c.fillRect(0, 0, this.W, this.H);
      c.save();
      if (a.type === 'circle') {
        c.translate(this.sx(0), this.sy(0)); c.scale(1, 0.62);
        const g = c.createRadialGradient(0, 0, a.radius * this.S * 0.2, 0, 0, a.radius * this.S);
        if (isForge) { g.addColorStop(0, '#2a211c'); g.addColorStop(1, '#1a120e'); }
        else if (isOssuary) { g.addColorStop(0, '#1c2620'); g.addColorStop(1, '#0c120e'); }
        else { g.addColorStop(0, '#23242c'); g.addColorStop(1, '#15161c'); }
        c.beginPath(); c.arc(0, 0, a.radius * this.S, 0, TAU); c.fillStyle = g; c.fill();
        c.strokeStyle = isForge ? 'rgba(255,122,47,.35)' : isOssuary ? 'rgba(143,217,160,.22)' : 'rgba(70,224,200,.25)'; c.lineWidth = 3; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.04)';
        for (let r = 4; r < a.radius; r += 4) { c.beginPath(); c.arc(0, 0, r * this.S, 0, TAU); c.lineWidth = 1; c.stroke(); }
      } else {
        c.restore(); c.save();
        const pts = [[-a.w / 2, -a.h / 2], [a.w / 2, -a.h / 2], [a.w / 2, a.h / 2], [-a.w / 2, a.h / 2]];
        c.beginPath(); c.moveTo(this.sx(pts[0][0]), this.sy(pts[0][1]));
        for (let i = 1; i < 4; i++) c.lineTo(this.sx(pts[i][0]), this.sy(pts[i][1]));
        c.closePath();
        const g2 = c.createLinearGradient(0, this.sy(-a.h / 2), 0, this.sy(a.h / 2));
        g2.addColorStop(0, '#1c1b24'); g2.addColorStop(.5, '#262430'); g2.addColorStop(1, '#1a1922');
        c.fillStyle = g2; c.fill();
        c.strokeStyle = 'rgba(207,213,239,.3)'; c.lineWidth = 3; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.045)'; c.lineWidth = 1;
        for (let x = -a.w / 2 + 3; x < a.w / 2; x += 3) { c.beginPath(); c.moveTo(this.sx(x), this.sy(-a.h / 2)); c.lineTo(this.sx(x), this.sy(a.h / 2)); c.stroke(); }
      }
      c.restore();
    },
    drawPillar(p) {
      const c = this.ctx, x = this.sx(p.x), y = this.sy(p.z);
      const h = (p.broken ? p.h * 0.5 : p.h) * this.S * 0.92, w = p.r * this.S;
      c.save(); c.translate(x, y); c.scale(1, 0.62);
      c.beginPath(); c.arc(0, 0, w * 1.15, 0, TAU); c.fillStyle = 'rgba(0,0,0,.4)'; c.fill();
      c.restore();
      const g = c.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, '#1f1d28'); g.addColorStop(.5, '#3a3748'); g.addColorStop(1, '#191722');
      c.fillStyle = g; c.fillRect(x - w, y - h, w * 2, h);
      c.save(); c.translate(x, y - h); c.scale(1, 0.5); c.beginPath(); c.arc(0, 0, w, 0, TAU); c.fillStyle = p.broken ? '#2c2937' : '#46435a'; c.fill(); c.restore();
    },
    drawBrazier(b) {
      const c = this.ctx, x = this.sx(b.x), y = this.sy(b.z), w = b.r * this.S, h = 2.0 * this.S * 0.92;
      c.save(); c.translate(x, y); c.scale(1, .62); c.beginPath(); c.arc(0, 0, w * 1.2, 0, TAU); c.fillStyle = 'rgba(0,0,0,.4)'; c.fill(); c.restore();
      c.fillStyle = '#262028'; c.fillRect(x - w * .55, y - h, w * 1.1, h);
      c.fillStyle = '#39313c'; c.fillRect(x - w, y - h - 6, w * 2, 8);
      const fl = Math.sin(game().simTime * 13 + b.x) * 3;
      const g = c.createRadialGradient(x, y - h - 10, 2, x, y - h - 10, 16 + fl);
      g.addColorStop(0, '#ffc46b'); g.addColorStop(.5, 'rgba(255,122,47,.8)'); g.addColorStop(1, 'rgba(255,122,47,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y - h - 10, 16 + fl, 0, TAU); c.fill();
    },
    shadow(x, z, r) {
      const c = this.ctx;
      c.save(); c.translate(this.sx(x), this.sy(z)); c.scale(1, 0.62);
      c.beginPath(); c.arc(0, 0, r * this.S, 0, TAU); c.fillStyle = 'rgba(0,0,0,.42)'; c.fill(); c.restore();
    },
    drawPlayer() {
      const c = this.ctx, P = player();
      this.shadow(P.x, P.z, 0.55);
      const x = this.sx(P.x), y = this.sy(P.z), s = this.S;
      const flick = P.iFrames > 0 && (Math.floor(game().simTime * 24) % 2 === 0);
      c.save(); c.translate(x, y);
      if (flick) c.globalAlpha = 0.45;
      const dir = Math.cos(P.facing) >= 0 ? 1 : -1;
      const bob = P.moving ? Math.sin(game().simTime * 11) * 1.6 : Math.sin(game().simTime * 2.4) * 0.8;
      c.strokeStyle = '#2b2733'; c.lineWidth = 4.2; c.lineCap = 'round';
      const lg = P.moving ? Math.sin(game().simTime * 13) * 5 : 0;
      c.beginPath(); c.moveTo(-3, -16); c.lineTo(-4 - lg * .4, 0); c.moveTo(3, -16); c.lineTo(4 + lg * .4, 0); c.stroke();
      c.fillStyle = '#332e40';
      c.beginPath(); c.moveTo(0, -38 + bob); c.quadraticCurveTo(11 * dir, -28 + bob, 8, -8); c.lineTo(-8, -8);
      c.quadraticCurveTo(-11 * dir, -28 + bob, 0, -38 + bob); c.fill();
      c.fillStyle = '#3d3750'; c.beginPath(); c.arc(0, -42 + bob, 7.5, 0, TAU); c.fill();
      c.fillStyle = '#15121c'; c.beginPath(); c.arc(2.4 * dir, -41 + bob, 4.6, 0, TAU); c.fill();
      c.fillStyle = '#46e0c8'; c.beginPath(); c.arc(3.2 * dir, -41.5 + bob, 1.1, 0, TAU); c.fill();
      const Weapon = weapon();
      if (!Weapon.out()) {
        let swing = 0;
        if (P.attackT >= 0 && !P.attackUnarmed) { const t = P.attackT / CONFIG.player.melee.swingTime; swing = Math.sin(t * Math.PI) * (P.attackIdx === 2 ? 1.8 : 1.2); }
        c.save(); c.translate(8 * dir, -24 + bob); c.rotate(dir * (0.5 - swing));
        c.strokeStyle = '#9aa3b8'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -20); c.stroke();
        c.strokeStyle = '#46e0c8'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, -3); c.lineTo(0, -19); c.stroke();
        c.strokeStyle = '#5a5470'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-4, -1); c.lineTo(4, -1); c.stroke();
        c.restore();
      } else if (P.attackT >= 0 && P.attackUnarmed) {
        const t = P.attackT / CONFIG.player.unarmed.swingTime;
        c.strokeStyle = '#cfc8da'; c.lineWidth = 3.4;
        c.beginPath(); c.moveTo(5 * dir, -26 + bob); c.lineTo((10 + Math.sin(t * Math.PI) * 8) * dir, -26 + bob); c.stroke();
      }
      if (P.attackT >= 0) {
        const def = P.attackUnarmed ? CONFIG.player.unarmed : CONFIG.player.melee;
        const t = clamp(P.attackT / def.swingTime, 0, 1);
        c.globalAlpha = (1 - t) * 0.55;
        c.strokeStyle = P.attackUnarmed ? '#cfc8da' : '#46e0c8'; c.lineWidth = 3;
        c.save(); c.scale(1, 0.62);
        c.beginPath(); c.arc(0, -14, def.range * s * .8, P.facing - def.arc / 2 + t * def.arc * 0.4, P.facing + def.arc / 2 - (1 - t) * def.arc * 0.3);
        c.stroke(); c.restore();
        c.globalAlpha = flick ? .45 : 1;
      }
      c.restore();
      if (P.lockOn) {
        const t = nearestBoss(game().bosses, P.x, P.z);
        if (t) { const tx = this.sx(t.x), ty = this.sy(t.z, t.height * 0.55);
          c.save(); c.translate(tx, ty); c.rotate(game().simTime * 1.5);
          c.strokeStyle = '#46e0c8'; c.lineWidth = 2;
          for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(14, -4); c.lineTo(18, 0); c.lineTo(14, 4); c.stroke(); }
          c.restore(); }
      }
    },
    drawWeapon() {
      const c = this.ctx, w = weapon();
      if (w.state !== 'lodged') this.shadow(w.x, w.z, 0.25);
      const x = this.sx(w.x), y = this.sy(w.z, w.h);
      c.save(); c.translate(x, y);
      c.rotate(w.state === 'stuck' ? 0.8 : w.angle);
      c.shadowColor = '#46e0c8'; c.shadowBlur = 9;
      c.strokeStyle = '#aeb8cf'; c.lineWidth = 3.4; c.beginPath(); c.moveTo(-11, 0); c.lineTo(11, 0); c.stroke();
      c.strokeStyle = '#46e0c8'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke();
      c.strokeStyle = '#5a5470'; c.lineWidth = 3; c.beginPath(); c.moveTo(-11, -4); c.lineTo(-11, 4); c.stroke();
      c.restore();
    },
    drawBoss(b) {
      if (b.kind === 'warden') this.drawWarden(b);
      else if (b.kind === 'choir') this.drawChoir(b, 1);
      else if (b.kind === 'echo') this.drawChoir(b, 0.45);
      else if (b.kind === 'dummy') this.drawDummy(b);
      else if (b.kind === 'shepherd') this.drawShepherd(b);
      else if (b.kind === 'risen') this.drawRisen(b);
    },
    drawWarden(b) {
      const c = this.ctx; this.shadow(b.x, b.z, b.radius * 0.95);
      const x = this.sx(b.x), y = this.sy(b.z);
      const dir = Math.cos(b.facing) >= 0 ? 1 : -1;
      const kneel = (b.state === 'transition') ? 18 : (b.staggered ? 10 : 0);
      const sway = Math.sin(b.animT * 1.7) * 2;
      const H = b.height * this.S * 0.92 - kneel;
      c.save(); c.translate(x, y);
      const seam = b.flash > 0 ? '#ffffff' : '#ff7a2f';
      c.fillStyle = '#181419'; c.fillRect(-14, -H * 0.42, 10, H * 0.42); c.fillRect(4, -H * 0.42, 10, H * 0.42);
      c.strokeStyle = seam; c.lineWidth = 1.5; c.strokeRect(-14, -H * 0.42, 10, H * 0.42); c.strokeRect(4, -H * 0.42, 10, H * 0.42);
      c.fillStyle = b.flash > 0 ? '#5a4a4a' : '#221c22';
      c.beginPath(); c.moveTo(-22, -H * 0.4); c.lineTo(22, -H * 0.4); c.lineTo(17 + sway, -H * 0.88); c.lineTo(-17 + sway, -H * 0.88); c.closePath(); c.fill();
      c.strokeStyle = seam; c.lineWidth = 2; c.stroke();
      c.strokeStyle = seam; c.lineWidth = 1.4; c.shadowColor = '#ff7a2f'; c.shadowBlur = 7;
      c.beginPath(); c.moveTo(-12 + sway, -H * 0.84); c.lineTo(-9, -H * 0.48); c.moveTo(12 + sway, -H * 0.84); c.lineTo(9, -H * 0.48);
      c.moveTo(sway * .5, -H * 0.82); c.lineTo(0, -H * 0.44); c.stroke();
      if (b.coreExposed) {
        const pul = 5 + Math.sin(b.animT * 9) * 2;
        const g = c.createRadialGradient(sway * .5, -H * 0.62, 2, sway * .5, -H * 0.62, 14 + pul);
        g.addColorStop(0, '#fff3d8'); g.addColorStop(.4, '#ffc46b'); g.addColorStop(1, 'rgba(255,122,47,0)');
        c.fillStyle = g; c.beginPath(); c.arc(sway * .5, -H * 0.62, 14 + pul, 0, TAU); c.fill();
      }
      c.shadowBlur = 0;
      c.fillStyle = '#191419'; c.beginPath(); c.arc(-20 + sway, -H * 0.86, 10, 0, TAU); c.arc(20 + sway, -H * 0.86, 10, 0, TAU); c.fill();
      c.fillStyle = '#221c22'; c.fillRect(-9 + sway, -H * 1.02, 18, H * 0.14);
      c.strokeStyle = seam; c.strokeRect(-9 + sway, -H * 1.02, 18, H * 0.14);
      c.strokeStyle = '#ffc46b'; c.lineWidth = 1.6; c.shadowColor = '#ff7a2f'; c.shadowBlur = 8;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-6 + sway, -H * 1.0 + 4 + i * 4); c.lineTo(6 + sway, -H * 1.0 + 4 + i * 4); c.stroke(); }
      c.shadowBlur = 0;
      const windRaise = (b.state === 'windup' && (b.attack === 'W1' || b.attack === 'W6')) ? -28 * clamp(b.stateT / 1.0, 0, 1) :
        (b.state === 'windup' && (b.attack === 'W2' || b.attack === 'W5')) ? 10 : 0;
      const strikeDrop = (b.state === 'strike' && (b.attack === 'W1' || b.attack === 'W6')) ? 26 : 0;
      c.save(); c.translate(26 * dir, -H * 0.55 + windRaise + strikeDrop);
      c.rotate(dir * (windRaise ? -0.9 : strikeDrop ? 0.7 : 0.25));
      c.strokeStyle = '#3a3340'; c.lineWidth = 5; c.beginPath(); c.moveTo(0, 16); c.lineTo(0, -26); c.stroke();
      c.fillStyle = '#181419'; c.fillRect(-10, -42, 20, 18);
      c.strokeStyle = seam; c.lineWidth = 1.6; c.strokeRect(-10, -42, 20, 18);
      const g2 = c.createRadialGradient(0, -33, 1, 0, -33, 8);
      g2.addColorStop(0, '#ffc46b'); g2.addColorStop(1, 'rgba(255,122,47,0)');
      c.fillStyle = g2; c.beginPath(); c.arc(0, -33, 8, 0, TAU); c.fill();
      c.restore();
      c.restore();
    },
    drawChoir(b, alpha) {
      const c = this.ctx; this.shadow(b.x, b.z, b.radius);
      const lift = (b.leapH || 0);
      const x = this.sx(b.x), y = this.sy(b.z, lift);
      const H = b.height * this.S * 0.92;
      const sway = Math.sin(b.animT * 3.1) * 3;
      c.save(); c.translate(x, y); c.globalAlpha = alpha;
      const body = b.flash > 0 ? '#ffffff' : '#e9e3d8';
      c.strokeStyle = `rgba(20,16,24,${alpha})`; c.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const ph = b.animT * 2.2 + i * 2.1;
        c.beginPath(); c.moveTo(0, -H * 0.6);
        c.quadraticCurveTo(Math.sin(ph) * 26 - 10, -H * 0.35, Math.sin(ph * 1.3) * 34, -2 - i * 3);
        c.stroke();
      }
      c.fillStyle = b.flash > 0 ? '#ffffff' : '#171320';
      c.beginPath(); c.moveTo(0, -H * 0.55); c.quadraticCurveTo(13 + sway, -H * 0.25, 9, 0); c.lineTo(-9, 0);
      c.quadraticCurveTo(-13 + sway, -H * 0.25, 0, -H * 0.55); c.fill();
      c.fillStyle = body;
      c.beginPath(); c.ellipse(sway * .4, -H * 0.62, 6.5, H * 0.14, 0, 0, TAU); c.fill();
      const spin = (b.state === 'strike' && b.attack === 'C4') ? b.animT * 18 : 0;
      const flare = (b.state === 'windup' && b.attack === 'C6') || b.vortexActive ? 1.5 : 1;
      for (let i = 0; i < 4; i++) {
        const base = -0.9 + i * 0.6 + Math.sin(b.animT * 2.6 + i) * 0.18 + spin;
        const side = i < 2 ? -1 : 1;
        const ay = -H * (0.7 - (i % 2) * 0.1);
        c.save(); c.translate(0, ay); c.rotate(side * base * flare * 0.5);
        c.strokeStyle = body; c.lineWidth = 2.6;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(side * 16, -4); c.stroke();
        c.strokeStyle = b.flash > 0 ? '#fff' : '#d8cfc0'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(side * 16, -4); c.quadraticCurveTo(side * 26, -10, side * 30, -2); c.stroke();
        c.restore();
      }
      c.fillStyle = body; c.beginPath(); c.arc(sway * .4, -H * 0.84, 6.8, 0, TAU); c.fill();
      c.strokeStyle = `rgba(23,19,32,${alpha})`; c.lineWidth = 1.1;
      if (b.phase === 1 || b.kind === 'echo') {
        c.beginPath(); c.arc(sway * .4, -H * 0.84, 4.4, 0, TAU); c.stroke();
        c.beginPath(); c.arc(sway * .4, -H * 0.84, 2.2, 0, TAU); c.stroke();
      } else {
        c.beginPath(); c.arc(sway * .4, -H * 0.84, 4.4, 0.4, TAU - 0.9); c.stroke();
        c.beginPath(); c.moveTo(sway * .4, -H * 0.84 - 6); c.lineTo(sway * .4 + 2, -H * 0.84); c.lineTo(sway * .4 - 1, -H * 0.84 + 6); c.stroke();
        c.shadowColor = '#cfd5ef'; c.shadowBlur = 8;
        c.fillStyle = '#cfd5ef'; c.beginPath(); c.arc(sway * .4 + 1.4, -H * 0.84 - 1, 1.2, 0, TAU); c.fill();
        c.shadowBlur = 0;
      }
      c.restore();
    },
    drawDummy(b) {
      const c = this.ctx; this.shadow(b.x, b.z, 0.7);
      const x = this.sx(b.x), y = this.sy(b.z), H = b.height * this.S * 0.92;
      c.save(); c.translate(x, y);
      c.strokeStyle = b.flash > 0 ? '#fff' : '#6b5a44'; c.lineWidth = 7;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -H * 0.85); c.stroke();
      c.lineWidth = 5; c.beginPath(); c.moveTo(-18, -H * 0.62); c.lineTo(18, -H * 0.62); c.stroke();
      c.fillStyle = b.flash > 0 ? '#fff' : '#8a7458'; c.beginPath(); c.arc(0, -H * 0.92, 8, 0, TAU); c.fill();
      c.strokeStyle = '#46e0c8'; c.lineWidth = 1.4;
      c.beginPath(); c.arc(0, -H * 0.92, 4.5, 0, TAU); c.stroke();
      c.restore();
    },
    drawShepherd(b) {
      const c = this.ctx; this.shadow(b.x, b.z, b.radius);
      const x = this.sx(b.x), y = this.sy(b.z);
      const H = b.height * this.S * 0.92;
      const sway = Math.sin(b.animT * 1.4) * 2;
      const dir = Math.cos(b.facing) >= 0 ? 1 : -1;
      const stepping = (b.state === 'windup' && b.attack === 'N3');
      c.save(); c.translate(x, y);
      // dissolving into ash-moths while Grave-Stepping
      if (stepping) {
        const p = clamp(b.stateT / (b.cfg.attacks[b.attack].windup || 0.5), 0, 1);
        c.globalAlpha = 1 - p * 0.6;
        for (let i = 0; i < 10; i++) { const a = rand(0, TAU), rr = p * 26 * Math.random();
          c.fillStyle = 'rgba(143,217,160,' + (0.5 * (1 - p)) + ')';
          c.fillRect(Math.cos(a) * rr - 1, -H * 0.5 + Math.sin(a) * rr - 1, 2, 2); }
      }
      // grave-cloth robe (tall stooped silhouette)
      const body = b.flash > 0 ? '#ffffff' : '#3a3b3f';
      c.fillStyle = body;
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(-15, -H * 0.5, -8 + sway, -H * 0.92);
      c.quadraticCurveTo(0, -H * 1.02, 8 + sway, -H * 0.92);
      c.quadraticCurveTo(15, -H * 0.5, 0, 0);
      c.fill();
      // ragged hem
      c.strokeStyle = b.flash > 0 ? '#fff' : '#26272b'; c.lineWidth = 2;
      c.beginPath(); for (let i = -12; i <= 12; i += 4) { c.moveTo(i, -2); c.lineTo(i + 2, 6); } c.stroke();
      // cowl + single pale grave-light
      c.fillStyle = b.flash > 0 ? '#fff' : '#202125';
      c.beginPath(); c.arc(sway, -H * 0.9, 9, 0, TAU); c.fill();
      const gl = 4 + Math.sin(b.animT * 4) * 1.2;
      const g = c.createRadialGradient(sway, -H * 0.9, 0, sway, -H * 0.9, 7 + gl);
      g.addColorStop(0, '#d6ffe0'); g.addColorStop(.4, '#8fd9a0'); g.addColorStop(1, 'rgba(143,217,160,0)');
      c.fillStyle = g; c.beginPath(); c.arc(sway + 2 * dir, -H * 0.9, 7 + gl, 0, TAU); c.fill();
      // censer-staff with funerary smoke
      c.save(); c.translate(14 * dir, -H * 0.55); c.rotate(dir * 0.12);
      c.strokeStyle = '#5a5e5a'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, H * 0.5); c.lineTo(0, -H * 0.42); c.stroke();
      c.fillStyle = '#6a6e66'; c.beginPath(); c.arc(0, -H * 0.42, 5, 0, TAU); c.fill();
      for (let i = 0; i < 3; i++) { c.fillStyle = 'rgba(143,217,160,' + (0.18 - i * 0.05) + ')';
        c.beginPath(); c.arc(Math.sin(b.animT * 2 + i) * 5, -H * 0.42 - 8 - i * 9, 4 + i * 2, 0, TAU); c.fill(); }
      c.restore();
      if (b.coreExposed) {     // channel: exposed core for the 2x interrupt
        const pul = 5 + Math.sin(b.animT * 8) * 2;
        const g2 = c.createRadialGradient(sway, -H * 0.55, 2, sway, -H * 0.55, 14 + pul);
        g2.addColorStop(0, '#eafff0'); g2.addColorStop(.4, '#8fd9a0'); g2.addColorStop(1, 'rgba(143,217,160,0)');
        c.fillStyle = g2; c.beginPath(); c.arc(sway, -H * 0.55, 14 + pul, 0, TAU); c.fill();
      }
      c.restore();
    },
    drawRisen(b) {
      const c = this.ctx; this.shadow(b.x, b.z, b.radius * 0.9);
      const x = this.sx(b.x), y = this.sy(b.z), H = b.height * this.S * 0.92;
      const sway = Math.sin(b.animT * 4 + b.x) * 2;
      const lunge = (b.state === 'windup' || b.state === 'strike') ? 4 : 0;
      c.save(); c.translate(x, y);
      const tone = b.flash > 0 ? '#ffffff' : b.bloated ? '#7fae84' : '#9aa890';
      // hunched torso
      c.fillStyle = tone;
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(-8 - (b.bloated ? 3 : 0), -H * 0.45, -3 + sway + lunge, -H * 0.7);
      c.quadraticCurveTo(0, -H * 0.78, 3 + sway + lunge, -H * 0.7);
      c.quadraticCurveTo(8 + (b.bloated ? 3 : 0), -H * 0.45, 0, 0);
      c.fill();
      // grasping arms
      c.strokeStyle = tone; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, -H * 0.5); c.lineTo(10 + lunge, -H * 0.5 - 2); c.moveTo(0, -H * 0.5); c.lineTo(-9 + lunge, -H * 0.46); c.stroke();
      // skull
      c.fillStyle = b.flash > 0 ? '#fff' : '#cdd3c4';
      c.beginPath(); c.arc(sway + lunge * 0.6, -H * 0.74, b.bloated ? 6 : 5, 0, TAU); c.fill();
      c.fillStyle = '#1a1f18';
      c.beginPath(); c.arc(sway + lunge * 0.6 - 1.5, -H * 0.75, 1.1, 0, TAU); c.arc(sway + lunge * 0.6 + 1.5, -H * 0.75, 1.1, 0, TAU); c.fill();
      if (b.bloated) {   // sickly pulsing glow warning of the burst-on-death
        const pul = 3 + Math.sin(b.animT * 6) * 1.5;
        const g = c.createRadialGradient(sway, -H * 0.4, 1, sway, -H * 0.4, 8 + pul);
        g.addColorStop(0, 'rgba(143,217,160,.5)'); g.addColorStop(1, 'rgba(143,217,160,0)');
        c.fillStyle = g; c.beginPath(); c.arc(sway, -H * 0.4, 8 + pul, 0, TAU); c.fill();
      }
      c.restore();
    },
    drawGrave(e) {
      const c = this.ctx; this.shadow(e.x, e.z, 0.42 * e.s);
      const h = this.S * e.s, stone = '#3a3e39', stoneL = '#4c514a', moss = 'rgba(96,140,96,.22)';
      c.save(); c.translate(this.sx(e.x), this.sy(e.z)); c.rotate(e.tilt);
      if (e.gkind === 'head') {
        const w = h * 0.52, ht = h * 1.05;
        c.fillStyle = stone; c.beginPath();
        c.moveTo(-w / 2, 0); c.lineTo(-w / 2, -ht * 0.62); c.arc(0, -ht * 0.62, w / 2, Math.PI, 0); c.lineTo(w / 2, 0); c.closePath(); c.fill();
        c.fillStyle = stoneL; c.fillRect(-w / 2, -ht * 0.62, w * 0.16, ht * 0.62);
        c.fillStyle = moss; c.fillRect(-w / 2, -ht * 0.12, w, ht * 0.12);
        c.strokeStyle = 'rgba(18,22,18,.55)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(0, -ht * 0.58); c.lineTo(0, -ht * 0.32); c.moveTo(-w * 0.16, -ht * 0.45); c.lineTo(w * 0.16, -ht * 0.45); c.stroke();
      } else if (e.gkind === 'cross') {
        const w = h * 0.5, ht = h * 1.2, t = Math.max(2, h * 0.12);
        c.fillStyle = stone; c.fillRect(-t / 2, -ht, t, ht); c.fillRect(-w / 2, -ht * 0.72, w, t);
        c.fillStyle = moss; c.fillRect(-t / 2, -ht * 0.16, t, ht * 0.16);
      } else if (e.gkind === 'tomb') {
        const w = h * 0.95, ht = h * 0.52;
        c.fillStyle = '#33372f'; c.beginPath();
        c.moveTo(-w / 2, 0); c.lineTo(-w / 2, -ht * 0.58); c.lineTo(0, -ht); c.lineTo(w / 2, -ht * 0.58); c.lineTo(w / 2, 0); c.closePath(); c.fill();
        c.fillStyle = stoneL; c.beginPath(); c.moveTo(-w / 2, -ht * 0.58); c.lineTo(0, -ht); c.lineTo(w * 0.02, -ht * 0.95); c.lineTo(-w * 0.44, -ht * 0.56); c.closePath(); c.fill();
        c.fillStyle = moss; c.fillRect(-w / 2, -ht * 0.16, w, ht * 0.16);
      } else {  // urn / broken column
        const w = h * 0.4, ht = h * 0.66;
        c.fillStyle = '#2c302a'; c.fillRect(-w * 0.62, -h * 0.12, w * 1.24, h * 0.12);
        c.fillStyle = stone; c.fillRect(-w / 2, -ht, w, ht);
        c.fillStyle = stoneL; c.beginPath(); c.arc(0, -ht, w * 0.58, Math.PI, 0); c.fill();
      }
      c.restore();
    },
    drawHazardsGround() {
      const cb = game().settings.cbSafe;
      for (const h of world().hazards) {
        if (h.type === 'ring') this.groundRing(h.x, h.z, h.r, CONFIG.warden.attacks.W3.band, 'rgba(255,122,47,.85)', cb);
        else if (h.type === 'trail') this.groundDisc(h.x, h.z, h.r, `rgba(255,122,47,${0.3 + Math.sin(game().simTime * 9) * 0.08})`, 'rgba(255,196,107,.5)', 1.5, true);
        else if (h.type === 'eruption' && h.done) {
          const a = clamp(1 - h.t / 0.6, 0, 1) * 0.4;
          this.groundDisc(0, 0, (world().arena && world().arena.radius) || 20, `rgba(255,90,40,${a})`, null, 0);
          for (const s of h.safe) this.groundDisc(s.x, s.z, s.r, 'rgba(70,224,200,.18)', '#46e0c8', 2);
        }
        else if (h.type === 'vortex') {
          this.groundDisc(h.x, h.z, h.r, 'rgba(207,213,239,.16)', 'rgba(207,213,239,.7)', 2.5, true);
          const c = this.ctx; c.save(); c.translate(this.sx(h.x), this.sy(h.z)); c.scale(1, .62);
          c.strokeStyle = 'rgba(23,19,32,.8)'; c.lineWidth = 3;
          for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, 0, h.r * this.S * (0.4 + i * 0.27), game().simTime * 4 + i * 2, game().simTime * 4 + i * 2 + 2.2); c.stroke(); }
          c.restore();
        } else if (h.type === 'shockring') {
          const t = h.t / h.life;
          this.groundRing(h.x, h.z, h.r * (0.5 + t * 0.6), 0.25, `rgba(255,255,255,${(1 - t) * .7})`);
        } else if (h.type === 'rot') {
          const d = h.delay || 0;
          if (!h.armed) {                              // locked, not yet live: pulsing "rot forming here" ring
            const p = clamp(h.t / (d || 0.0001), 0, 1);
            this.groundDisc(h.x, h.z, h.r, `rgba(143,217,160,${0.10 + 0.16 * p})`, 'rgba(143,217,160,.85)', 2, cb);
            break;
          }
          // footprint outline + the dangerous necrotic field
          this.groundDisc(h.x, h.z, h.r, null, 'rgba(143,217,160,.35)', 1.5);
          const cur = h.cur || 0;
          const end = d + h.life;
          const fade = h.t > end - 1 ? Math.max(0, end - h.t) : 1;
          this.groundDisc(h.x, h.z, cur, `rgba(74,120,70,${0.42 * fade})`, 'rgba(120,180,120,.7)', 2, cb);
          const c = this.ctx; c.save(); c.translate(this.sx(h.x), this.sy(h.z)); c.scale(1, .62);
          c.strokeStyle = `rgba(40,60,40,${0.5 * fade})`; c.lineWidth = 2;
          for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + game().simTime * 0.6;
            c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * cur * this.S, Math.sin(a) * cur * this.S); c.stroke(); }
          c.restore();
        } else if (h.type === 'bloom') {
          if (!h.done) {
            const p = clamp(h.t / h.telegraph, 0, 1);
            this.groundDisc(h.x, h.z, h.r, `rgba(143,217,160,${0.12 + 0.18 * p})`, 'rgba(143,217,160,.9)', 2, cb);
          } else {
            const a = clamp(1 - (h.t - h.telegraph) / 0.4, 0, 1);
            this.groundDisc(h.x, h.z, h.r, `rgba(120,200,130,${a * 0.5})`, null, 0);
          }
        } else if (h.type === 'raise') {
          if (!h.done) {
            const p = clamp(h.t / h.telegraph, 0, 1);
            this.groundDisc(h.x, h.z, h.r, `rgba(143,217,160,${0.14 + 0.22 * p})`, 'rgba(143,217,160,.9)', 2, cb);
          } else {
            const a = clamp(1 - (h.t - h.telegraph) / 0.3, 0, 1);
            this.groundDisc(h.x, h.z, h.r, `rgba(143,217,160,${a * 0.5})`, null, 0);
          }
        } else if (h.type === 'rotline') {
          const dx = Math.cos(h.ang), dz = Math.sin(h.ang), L = h.length;
          const armed = h.t >= (h.arm || 0);
          const fade = h.t > h.life + (h.arm || 0) - 1 ? Math.max(0, h.life + (h.arm || 0) - h.t) : 1;
          const c = this.ctx; c.save(); c.translate(this.sx(0), this.sy(0)); c.scale(1, 0.62); c.lineCap = 'round';
          const x1 = h.x * this.S, z1 = h.z * this.S, x2 = (h.x + dx * L) * this.S, z2 = (h.z + dz * L) * this.S;
          if (!armed) {                                  // locked but not yet live: bright "move!" warning
            const p = clamp(h.t / (h.arm || 0.0001), 0, 1);
            c.strokeStyle = `rgba(143,217,160,${0.25 + 0.5 * p})`; c.lineWidth = h.band * this.S;
            c.beginPath(); c.moveTo(x1, z1); c.lineTo(x2, z2); c.stroke();
          } else {                                       // active: bold necrotic band (swapped from the old aim render)
            c.strokeStyle = `rgba(143,217,160,${0.7 * fade})`; c.lineWidth = h.band * this.S;
            c.beginPath(); c.moveTo(x1, z1); c.lineTo(x2, z2); c.stroke();
          }
          c.restore();
        }
      }
    },
    drawStrikeTelegraphs() {
      const cb = game().settings.cbSafe;
      const flash = 0.32 + 0.26 * Math.sin(game().simTime * 18);
      for (const b of game().bosses) {
        if (b.dead || b.state !== 'strike' || !b.attack) continue;
        const A = b.cfg.attacks, a = b.attack;
        if (a === 'W6') {
          const c = A.W6;
          if (b.slamCount >= 1 && b.slamCount < c.slams) {
            const p = clamp(b.stateT / c.gap, 0, 1);
            this.groundArc(b.x, b.z, c.range + 1.2, b.facing, c.arc, `rgba(255,122,47,${flash * p})`, 'rgba(255,196,107,.9)', cb);
            this.groundDisc(b.x + Math.cos(b.facing) * 2, b.z + Math.sin(b.facing) * 2, c.shock, null, `rgba(255,196,107,${0.4 + 0.5 * p})`, 2, false);
          }
        } else if (a === 'C1' || a === 'C5') {
          const c = A[a];
          if (b.hitIdx >= 1 && b.hitIdx < c.hits) {
            const p = clamp((b.stateT - c.gap * (b.hitIdx - 1)) / c.gap, 0, 1);
            this.groundArc(b.x, b.z, c.range, b.facing, c.arc, `rgba(207,213,239,${flash * p})`, 'rgba(207,213,239,.9)', cb);
          }
        } else if (a === 'C4') {
          const c = A.C4;
          if (b.hitIdx >= 1 && b.hitIdx < c.hits) {
            const p = clamp((b.stateT - c.gap * (b.hitIdx - 1)) / c.gap, 0, 1);
            this.groundDisc(b.x, b.z, c.radius, `rgba(207,213,239,${flash * p})`, 'rgba(207,213,239,.9)', 2, cb);
          }
        }
      }
    },
    drawTelegraphs() {
      const cb = game().settings.cbSafe;
      const Player = player();
      for (const b of game().bosses) {
        if (b.dead || b.state !== 'windup' || !b.attack) continue;
        const t = b.stateT, A = b.cfg.attacks, a = b.attack;
        const pulse = 0.25 + 0.2 * Math.sin(game().simTime * 14);
        const prog = c => clamp(t / c.windup, 0, 1);
        if (b.kind === 'warden') {
          if (a === 'W1' || a === 'W6') {
            const c = A[a];
            this.groundArc(b.x, b.z, c.range + 1.2, b.facing, c.arc, `rgba(255,122,47,${pulse * prog(c)})`, 'rgba(255,122,47,.9)', cb);
            this.groundDisc(b.x + Math.cos(b.facing) * 2, b.z + Math.sin(b.facing) * 2, c.shock, null, `rgba(255,196,107,${0.5 + 0.4 * prog(c)})`, 2, false);
          } else if (a === 'W2' || a === 'W5') {
            const c = A[a];
            this.groundArc(b.x, b.z, c.range, b.facing, c.arc, `rgba(255,122,47,${pulse * prog(c)})`, 'rgba(255,122,47,.9)', cb);
          } else if (a === 'W3') {
            const c = A.W3;
            this.groundRing(b.x, b.z, lerp(c.rMin, c.rMax, 0.5), (c.rMax - c.rMin), `rgba(255,122,47,${0.10 + 0.12 * prog(c)})`);
            this.groundRing(b.x, b.z, c.rMin, 0.2, 'rgba(255,196,107,.9)'); this.groundRing(b.x, b.z, c.rMax, 0.2, 'rgba(255,196,107,.9)');
          } else if (a === 'W7') {
            const c = A.W7, a2 = world().arena;
            this.groundDisc(0, 0, a2.radius, `rgba(255,60,30,${0.10 + 0.18 * prog(c)})`, null, 0, cb);
            for (const s of b.eruptSafe) this.groundDisc(s.x, s.z, s.r, 'rgba(70,224,200,.22)', '#46e0c8', 2.5);
          } else if (a === 'W4') {
            this.groundArc(b.x, b.z, 3, angTo(b.x, b.z, Player.x, Player.z), 0.5, null, 'rgba(255,196,107,.7)');
          }
        } else if (b.kind === 'shepherd') {
          if (a === 'N1') {
            this.groundArc(b.x, b.z, 3, angTo(b.x, b.z, Player.x, Player.z), 0.3, null, 'rgba(143,217,160,.75)');
          } else if (a === 'N4') {
            this.groundDisc(Player.x, Player.z, A.N4.radius, `rgba(74,120,70,${0.12 + 0.24 * prog(A.N4)})`, 'rgba(143,217,160,.85)', 2, cb);
          } else if (a === 'N5') {
            const c = A.N5;
            this.groundArc(b.x, b.z, c.range, b.facing, c.arc, `rgba(143,217,160,${pulse * prog(c)})`, 'rgba(143,217,160,.9)', cb);
          } else if (a === 'N7') {
            const a2 = world().arena;
            this.groundDisc(0, 0, a2.radius, `rgba(150,50,50,${0.08 + 0.14 * prog(A.N7)})`, null, 0, cb);   // arena-wide danger
            if (b.sanctified) this.groundDisc(b.sanctified.x, b.sanctified.z, b.sanctified.r, 'rgba(143,217,160,.20)', '#8fd9a0', 3, true); // safe spot
          } else if (a === 'N2' || a === 'N6') {
            const sr = CONFIG.shepherd.risen.spawnRadius;
            this.groundDisc(Player.x, Player.z, sr, `rgba(143,217,160,${0.15 + 0.2 * Math.sin(game().simTime * 8)})`, 'rgba(143,217,160,.7)', 1.5, cb);
          } else if (a === 'N8') {
            const c = A.N8, ang = angTo(b.x, b.z, Player.x, Player.z);   // originates at the boss, sweeps to follow the player
            const cc = this.ctx; cc.save(); cc.translate(this.sx(0), this.sy(0)); cc.scale(1, 0.62); cc.lineCap = 'round';
            const p = prog(c);
            const x1 = b.x * this.S, z1 = b.z * this.S;
            const x2 = (b.x + Math.cos(ang) * c.length) * this.S, z2 = (b.z + Math.sin(ang) * c.length) * this.S;
            cc.strokeStyle = `rgba(74,120,70,${0.4 * p})`; cc.lineWidth = c.band * this.S;   // banded footprint (swapped from the old active render)
            cc.beginPath(); cc.moveTo(x1, z1); cc.lineTo(x2, z2); cc.stroke();
            cc.strokeStyle = `rgba(143,217,160,${0.4 + 0.5 * p})`; cc.lineWidth = 2 + Math.sin(game().simTime * 7) * 0.6;  // bright centre sightline
            cc.beginPath(); cc.moveTo(x1, z1); cc.lineTo(x2, z2); cc.stroke();
            cc.restore();
          }
        } else if (b.kind === 'risen') {
          if (a === 'melee') {                          // the hit indicator the minions were missing
            const c = CONFIG.shepherd.risen.melee;
            this.groundArc(b.x, b.z, c.range, b.facing, c.arc, `rgba(143,217,160,${pulse * prog(c)})`, 'rgba(143,217,160,.85)', cb);
          }
        } else if (b.kind === 'choir' || b.kind === 'echo') {
          if (a === 'C1' || a === 'C5') {
            const c = A[a];
            this.groundArc(b.x, b.z, c.range, b.facing, c.arc, `rgba(207,213,239,${pulse * prog(c)})`, 'rgba(207,213,239,.85)', cb);
          } else if (a === 'C2') {
            const c = this.ctx;
            c.save(); c.translate(this.sx(b.x), this.sy(b.z, b.height * .6));
            c.strokeStyle = `rgba(207,213,239,${0.4 + 0.5 * (t / A.C2.windup)})`; c.lineWidth = 2;
            for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, 0, 10 + i * 8 + Math.sin(game().simTime * 10) * 2, -0.6, 0.6); c.stroke(); }
            c.restore();
          } else if (a === 'C4') {
            const c = A.C4;
            this.groundDisc(b.x, b.z, c.radius, `rgba(207,213,239,${pulse * prog(c)})`, 'rgba(207,213,239,.9)', 2, cb);
          } else if (a === 'C6') {
            const c = A.C6;
            this.groundDisc(b.x, b.z, c.rMax, null, 'rgba(207,213,239,.45)', 1.5, cb);
            this.groundDisc(b.x, b.z, c.rMin, `rgba(207,213,239,${pulse})`, 'rgba(207,213,239,.9)', 2, cb);
          } else if (a === 'C3') {
            this.groundDisc(b.x, b.z, 1.2, 'rgba(207,213,239,.2)', null, 0);
          }
        }
      }
      for (const b of game().bosses) {
        if (b.kind === 'choir' && b.state === 'strike' && b.attack === 'C5' && b.hitIdx >= b.cfg.attacks.C5.hits)
          this.groundDisc(Player.x, Player.z, b.cfg.attacks.C5.finisherRadius, 'rgba(207,213,239,.18)', 'rgba(255,255,255,.8)', 2.5, cb);
      }
    },
    drawProjectiles() {
      const c = this.ctx;
      for (const p of world().projectiles) {
        const x = this.sx(p.x), y = this.sy(p.z, p.h);
        this.shadow(p.x, p.z, 0.25);
        if (p.type === 'coal') {
          const g = c.createRadialGradient(x, y, 1, x, y, 9);
          g.addColorStop(0, '#ffc46b'); g.addColorStop(.6, '#ff7a2f'); g.addColorStop(1, 'rgba(255,122,47,0)');
          c.fillStyle = g; c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill();
        } else if (p.type === 'lance') {
          c.save(); c.translate(x, y); c.rotate(p.ang);
          c.shadowColor = '#8fd9a0'; c.shadowBlur = 9;
          c.strokeStyle = '#cfe8d0'; c.lineWidth = 3; c.beginPath(); c.moveTo(-12, 0); c.lineTo(10, 0); c.stroke();
          c.fillStyle = '#eafff0'; c.beginPath(); c.moveTo(16, 0); c.lineTo(8, -3); c.lineTo(8, 3); c.closePath(); c.fill();
          c.shadowBlur = 0; c.restore();
        } else {
          c.save(); c.translate(x, y); c.rotate(p.ang);
          c.fillStyle = '#cfd5ef'; c.shadowColor = '#cfd5ef'; c.shadowBlur = 8;
          c.beginPath(); c.moveTo(8, 0); c.lineTo(-6, -3.4); c.lineTo(-3, 0); c.lineTo(-6, 3.4); c.closePath(); c.fill();
          c.shadowBlur = 0; c.restore();
        }
      }
    },
    drawFx(dt) {
      const c = this.ctx, World = world();
      for (let i = World.fx.length - 1; i >= 0; i--) {
        const f = World.fx[i]; f.t += dt;
        if (f.t > f.life) { World.fx.splice(i, 1); continue; }
        f.x += f.vx * dt; f.z += f.vz * dt; f.h += f.vh * dt; f.vh -= 14 * dt;
        if (f.h < 0) { f.h = 0; f.vh *= -0.4; }
        c.fillStyle = f.color; c.globalAlpha = 1 - f.t / f.life;
        c.fillRect(this.sx(f.x) - 1.5, this.sy(f.z, f.h) - 1.5, 3, 3);
        c.globalAlpha = 1;
      }
      for (let i = World.dmgNums.length - 1; i >= 0; i--) {
        const d = World.dmgNums[i]; d.t += dt;
        if (d.t > 0.9) { World.dmgNums.splice(i, 1); continue; }
        const a = 1 - d.t / 0.9;
        c.font = d.kind === 'rift' ? 'bold 22px Georgia' : d.kind === 'player' ? 'bold 18px Georgia' : '15px Georgia';
        c.fillStyle = d.kind === 'rift' ? `rgba(70,224,200,${a})` : d.kind === 'player' ? `rgba(232,90,100,${a})`
          : d.kind === 'stam' ? `rgba(120,230,140,${a})` : d.kind === 'throwdmg' ? `rgba(160,220,255,${a})` : `rgba(240,236,220,${a})`;
        c.textAlign = 'center';
        const txt = d.kind === 'stam' ? `+${d.amount} stamina` : d.kind === 'rift' ? `RIFTSTRIKE ${d.amount}` : d.amount;
        c.fillText(txt, this.sx(d.x), this.sy(d.z, d.h) - d.t * 34);
        c.textAlign = 'left';
      }
    },
    drawHUD() {
      const c = this.ctx, P = player(), Weapon = weapon(), Game = game();
      c.save(); c.textAlign = 'left';
      const bx = 28, by = 26, bw = 320, bh = 16;
      c.fillStyle = 'rgba(8,7,11,.75)'; c.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
      c.fillStyle = '#3a1019'; c.fillRect(bx, by, bw, bh);
      c.fillStyle = '#b8333f'; c.fillRect(bx, by, bw * (P.hp / CONFIG.player.maxHp), bh);
      c.strokeStyle = '#56505f'; c.lineWidth = 1.5; c.strokeRect(bx - 3, by - 3, bw + 6, bh + 6);
      const syy = by + bh + 9, sh = 11;
      const exhausted = P.stamina < CONFIG.player.dodge.staminaCost;
      c.fillStyle = 'rgba(8,7,11,.75)'; c.fillRect(bx - 3, syy - 3, bw * 0.86 + 6, sh + 6);
      c.fillStyle = '#1c2e22'; c.fillRect(bx, syy, bw * 0.86, sh);
      c.fillStyle = P.staminaFlash > 0 ? '#ff4545' : exhausted ? '#a8842e' : '#62c46a';
      c.fillRect(bx, syy, bw * 0.86 * (P.stamina / CONFIG.player.maxStamina), sh);
      c.strokeStyle = P.staminaFlash > 0 ? '#ff4545' : exhausted ? '#d8a73e' : '#56505f';
      c.lineWidth = exhausted ? 2 : 1.5;
      c.strokeRect(bx - 3, syy - 3, bw * 0.86 + 6, sh + 6);
      const ix = bx + 18, iy = syy + 52, ir = 17;
      c.fillStyle = 'rgba(8,7,11,.78)'; c.beginPath(); c.arc(ix, iy, ir + 4, 0, TAU); c.fill();
      const tpCost = CONFIG.player.riftthrow.teleportCost;
      const tpReady = P.stamina >= tpCost;
      c.save(); c.translate(ix, iy); c.rotate(-0.7);
      c.strokeStyle = tpReady ? '#46e0c8' : '#5a6663'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke();
      c.strokeStyle = tpReady ? '#aeb8cf' : '#555'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-9, -4); c.lineTo(-9, 4); c.stroke();
      c.restore();
      if (!tpReady) {
        const frac = clamp(P.stamina / tpCost, 0, 1);
        c.strokeStyle = '#46e0c8'; c.lineWidth = 3.4;
        c.beginPath(); c.arc(ix, iy, ir + 2, -Math.PI / 2, -Math.PI / 2 + frac * TAU); c.stroke();
      } else { c.strokeStyle = '#46e0c8'; c.lineWidth = 2; c.beginPath(); c.arc(ix, iy, ir + 2, 0, TAU); c.stroke(); }
      if (this.tpFlash > 0) { this.tpFlash -= 1 / 60; c.strokeStyle = '#ff4545'; c.lineWidth = 3; c.beginPath(); c.arc(ix, iy, ir + 6, 0, TAU); c.stroke(); }
      const dx = ix + 46;
      c.fillStyle = 'rgba(8,7,11,.78)'; c.beginPath(); c.arc(dx, iy, 11, 0, TAU); c.fill();
      const dReady = P.dodgeCd <= 0;
      c.fillStyle = dReady ? '#62c46a' : '#3a4438';
      c.beginPath(); c.arc(dx, iy, 7, 0, TAU); c.fill();
      if (!dReady) { const f = 1 - P.dodgeCd / CONFIG.player.dodge.cooldown;
        c.strokeStyle = '#62c46a'; c.lineWidth = 2.5; c.beginPath(); c.arc(dx, iy, 10, -Math.PI / 2, -Math.PI / 2 + f * TAU); c.stroke(); }
      c.fillStyle = '#9a90a8'; c.font = '11px system-ui';
      const ws = Weapon.state === 'hand' ? 'BLADE: IN HAND' : Weapon.state === 'lodged' ? 'BLADE: LODGED IN FOE' :
        Weapon.state === 'returning' ? 'BLADE: RETURNING' : Weapon.state === 'flying' ? 'BLADE: FLYING' : 'BLADE: EMBEDDED';
      c.fillText(ws, dx + 26, iy + 4);
      let bbY = this.H - 64;
      for (const b of Game.bosses) {
        if (b.kind === 'echo' || b.kind === 'risen' || b.dead) continue;
        const w2 = Math.min(620, this.W * 0.55), x2 = this.W / 2 - w2 / 2;
        c.font = '15px Georgia'; c.textAlign = 'center'; c.fillStyle = '#e8e2d6';
        c.shadowColor = '#000'; c.shadowBlur = 5;
        c.fillText(b.cfg.name, this.W / 2, bbY - 8); c.shadowBlur = 0;
        c.fillStyle = 'rgba(8,7,11,.78)'; c.fillRect(x2 - 3, bbY - 1, w2 + 6, 13);
        c.fillStyle = '#33202c'; c.fillRect(x2, bbY + 2, w2, 7);
        c.fillStyle = b.kind === 'warden' ? '#ff7a2f' : '#cfd5ef';
        c.fillRect(x2, bbY + 2, w2 * (b.hp / b.maxHp), 7);
        c.strokeStyle = '#56505f'; c.lineWidth = 1; c.strokeRect(x2 - 3, bbY - 1, w2 + 6, 13);
        if (b.cfg.phase2At > 0) { c.fillStyle = '#e8e2d6'; c.fillRect(x2 + w2 * b.cfg.phase2At - 1, bbY, 2, 11); }
        bbY -= 40; c.textAlign = 'left';
      }
      for (const b of Game.bosses) if ((b.kind === 'echo' || b.kind === 'risen') && !b.dead) {
        const x = this.sx(b.x), y = this.sy(b.z, b.height + 0.3);
        c.fillStyle = 'rgba(8,7,11,.7)'; c.fillRect(x - 22, y, 44, 5);
        c.fillStyle = b.kind === 'risen' ? '#8fd9a0' : '#cfd5ef'; c.fillRect(x - 22, y, 44 * (b.hp / b.maxHp), 5);
      }
      const choir = Game.bosses.find(b => b.kind === 'choir');
      if (choir && !choir.dead && choir.fightT > CONFIG.choir.enrageTime) {
        c.fillStyle = '#ff5a5a'; c.font = 'bold 13px Georgia'; c.textAlign = 'center';
        c.fillText('THE HYMN QUICKENS', this.W / 2, this.H - 104); c.textAlign = 'left';
      }
      const shep = Game.bosses.find(b => b.kind === 'shepherd');
      if (shep && !shep.dead && shep.fightT > CONFIG.shepherd.enrageTime) {
        c.fillStyle = '#8fd9a0'; c.font = 'bold 13px Georgia'; c.textAlign = 'center';
        c.fillText('THE DEAD MARCH FASTER', this.W / 2, this.H - 104); c.textAlign = 'left';
      }
      if (Game.inFight()) {
        c.fillStyle = '#7d7390'; c.font = '13px Georgia'; c.textAlign = 'right';
        c.fillText(fmtTime(Game.fightTime), this.W - this.hudInset(), 34); c.textAlign = 'left';
      }
      c.restore();
    }
  };
  return Render;
});
