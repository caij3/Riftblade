'use strict';
/* input — keyboard / mouse / gamepad. Private: raw key/mouse/pad state, the
   bind tables. Public: edge/held queries + bind editing used by ui. */
RB.define('input', function (require) {
  const ui = () => require('ui');
  const audio = () => require('audio');

  const DEFAULT_BINDS = {
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
    dodge: 'ShiftLeft', lockon: 'Tab', pause: 'Escape',
    attackKey: 'KeyJ', riftKey: 'KeyK'
  };
  const BIND_LABELS = {
    up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right',
    dodge: 'Dodge', lockon: 'Lock-on', pause: 'Pause',
    attackKey: 'Attack (alt of LMB)', riftKey: 'Riftthrow (alt of RMB)'
  };

  const Input = {
    binds: { ...DEFAULT_BINDS },
    DEFAULT_BINDS, BIND_LABELS,
    keys: new Set(), mouse: { x: 640, y: 360, lmb: false, rmb: false },
    touch: { ax: 0, az: 0 },        // virtual-joystick axis (set by the mobile module)
    pressed: new Set(),
    rmbDownAt: -1, rmbHeld: false, riftKeyDownAt: -1,
    gp: { ax: 0, az: 0, attack: false, rift: false, dodge: false, lock: false, pause: false,
          prev: { attack: false, rift: false, dodge: false, lock: false, pause: false }, riftDownAt: -1 },
    listenTarget: null,
    init(canvas) {
      addEventListener('keydown', e => {
        if (this.listenTarget) {
          if (e.code !== 'Escape') this.binds[this.listenTarget] = e.code;
          this.listenTarget = null; ui().refreshBinds(); e.preventDefault(); return;
        }
        const wasDown = this.keys.has(e.code);
        if (!wasDown) this.pressed.add(e.code);
        if (e.code === this.binds.riftKey && !wasDown) this.riftKeyDownAt = performance.now();
        this.keys.add(e.code);
        if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      });
      addEventListener('keyup', e => {
        this.keys.delete(e.code);
        if (e.code === this.binds.riftKey && this.riftKeyDownAt > 0) { this.pressed.add('__RIFTUP'); this.riftKeyDownAt = -1; }
      });
      canvas.addEventListener('mousemove', e => {
        const r = canvas.getBoundingClientRect();
        this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
        this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
      });
      canvas.addEventListener('mousedown', e => {
        audio().resume();
        if (e.button === 0) { this.mouse.lmb = true; this.pressed.add('__LMB'); }
        if (e.button === 2) { this.mouse.rmb = true; this.rmbDownAt = performance.now(); this.pressed.add('__RMBDOWN'); }
      });
      addEventListener('mouseup', e => {
        if (e.button === 0) this.mouse.lmb = false;
        if (e.button === 2) {
          this.mouse.rmb = false;
          if (this.rmbDownAt > 0) { this.pressed.add('__RMBUP'); }
          this.rmbDownAt = -1;
        }
      });
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      addEventListener('blur', () => { this.keys.clear(); this.mouse.lmb = this.mouse.rmb = false; this.touch.ax = this.touch.az = 0; });
    },
    gpBlocked: false,
    pollGamepad() {
      const g = this.gp;
      g.prev = { attack: g.attack, rift: g.rift, dodge: g.dodge, lock: g.lock, pause: g.pause };
      let p = null;
      if (!this.gpBlocked) {
        try { const pads = navigator.getGamepads ? navigator.getGamepads() : []; p = pads && pads[0]; }
        catch (e) { this.gpBlocked = true; p = null; }
      }
      if (!p) { g.ax = g.az = 0; g.attack = g.rift = g.dodge = g.lock = g.pause = false; return; }
      const dz = v => Math.abs(v) > 0.22 ? v : 0;
      g.ax = dz(p.axes[0] || 0); g.az = dz(p.axes[1] || 0);
      g.attack = !!(p.buttons[2] && p.buttons[2].pressed);
      g.dodge = !!(p.buttons[1] && p.buttons[1].pressed) || !!(p.buttons[0] && p.buttons[0].pressed);
      g.rift = !!(p.buttons[5] && p.buttons[5].pressed) || !!(p.buttons[7] && p.buttons[7].pressed && p.buttons[7].value > .5);
      g.lock = !!(p.buttons[3] && p.buttons[3].pressed);
      g.pause = !!(p.buttons[9] && p.buttons[9].pressed);
      if (g.attack && !g.prev.attack) this.pressed.add('__LMB');
      if (g.rift && !g.prev.rift) { this.pressed.add('__RMBDOWN'); g.riftDownAt = performance.now(); }
      if (!g.rift && g.prev.rift) { this.pressed.add('__RMBUP'); g.riftDownAt = -1; }
      if (g.dodge && !g.prev.dodge) this.pressed.add(this.binds.dodge);
      if (g.lock && !g.prev.lock) this.pressed.add(this.binds.lockon);
      if (g.pause && !g.prev.pause) this.pressed.add(this.binds.pause);
    },
    down(action) { return this.keys.has(this.binds[action]); },
    justPressed(code) { return this.pressed.has(code); },
    actionPressed(action) { return this.pressed.has(this.binds[action]); },
    rmbHoldTime() {
      let a = -1;
      if (this.rmbDownAt > 0) a = this.rmbDownAt;
      else if (this.gp.riftDownAt > 0) a = this.gp.riftDownAt;
      else if (this.riftKeyDownAt > 0) a = this.riftKeyDownAt;
      return a > 0 ? (performance.now() - a) / 1000 : 0;
    },
    clearFrame() { this.pressed.clear(); }
  };
  return Input;
});
