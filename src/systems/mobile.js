'use strict';
/* mobile — optional on-screen touch controls + the in-game (hamburger) menu
   button. Opt-in via Settings → "Touch controls"; the flag lives in
   game().settings.mobile so other systems can read it without depending on this
   module. Builds a virtual joystick (bottom-left) that feeds input().touch.{ax,az}
   — summed into movement exactly like the gamepad axis — plus Attack and Dash
   buttons (bottom-right) that push the same edge events the mouse/keys do (__LMB
   and the dodge bind). A press anywhere else on the play area drives the riftblade
   identically to RMB: tap = throw / riftstrike-teleport, hold = recall. Pointer
   Events are used so it also works with stylus/mouse; the play-area handler ignores
   the mouse so the desktop keeps its native RMB pipeline untouched.
   syncUI() (called once per frame from game.loop) shows/hides everything based on
   game mode + pause + the setting, and zeroes touch state whenever it hides. */
RB.define('mobile', function (require) {
  const input = () => require('input');
  const render = () => require('render');
  const audio = () => require('audio');
  const game = () => require('game');

  let built = false, ctrlShown = null, menuShown = null;
  let ctrlEl = null, joyEl = null, knobEl = null, atkEl = null, dashEl = null, menuBtn = null;
  let joyId = null, joyCx = 0, joyCy = 0, joyR = 1;
  let riftId = null;

  function cvCoords(e) {
    const cv = render().cv, r = cv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (cv.width / (r.width || cv.width)),
      y: (e.clientY - r.top) * (cv.height / (r.height || cv.height))
    };
  }
  function mk(tag, id, parent, txt) {
    const el = document.createElement(tag);
    if (id) el.id = id;
    if (txt != null) el.textContent = txt;
    parent.appendChild(el);
    return el;
  }

  const Mobile = {
    get enabled() { return !!game().settings.mobile; },

    init() {
      if (built) return;
      const wrap = document.getElementById('wrap') || document.body;
      menuBtn = document.getElementById('btnMenu');     // created in index.html, click wired in ui.init

      ctrlEl = mk('div', 'mobileControls', wrap);
      joyEl  = mk('div', 'mjoy', ctrlEl);
      knobEl = mk('div', 'mjoyKnob', joyEl);
      atkEl  = mk('button', 'mbtnAttack', ctrlEl, 'ATK');
      dashEl = mk('button', 'mbtnDash', ctrlEl, 'DASH');

      this._bindJoystick();
      this._bindButton(atkEl,  () => { const I = input(); I.pressed.add('__LMB'); });
      this._bindButton(dashEl, () => { const I = input(); I.pressed.add(I.binds.dodge); });
      this._bindRift();

      built = true;
      this.syncUI(true);
    },

    _bindJoystick() {
      const opt = { passive: false };
      const recenter = () => {
        const r = joyEl.getBoundingClientRect();
        joyCx = r.left + r.width / 2; joyCy = r.top + r.height / 2; joyR = (r.width / 2) || 1;
      };
      joyEl.addEventListener('pointerdown', e => {
        if (joyId !== null) return;
        e.preventDefault(); audio().resume();
        joyId = e.pointerId; recenter();
        try { joyEl.setPointerCapture(e.pointerId); } catch (_) {}
        this._joyMove(e);
      }, opt);
      joyEl.addEventListener('pointermove', e => {
        if (e.pointerId !== joyId) return;
        e.preventDefault(); this._joyMove(e);
      }, opt);
      const end = e => {
        if (e.pointerId !== joyId) return;
        e.preventDefault(); joyId = null;
        const I = input(); I.touch.ax = 0; I.touch.az = 0;
        knobEl.style.transform = 'translate(-50%,-50%)';
      };
      joyEl.addEventListener('pointerup', end, opt);
      joyEl.addEventListener('pointercancel', end, opt);
    },
    _joyMove(e) {
      let dx = e.clientX - joyCx, dy = e.clientY - joyCy;
      const d = Math.hypot(dx, dy), m = joyR;
      if (d > m) { dx = dx / d * m; dy = dy / d * m; }
      const I = input(); I.touch.ax = dx / m; I.touch.az = dy / m;   // screen-down = +z, matches gp.az
      knobEl.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
    },

    _bindButton(el, fire) {
      const opt = { passive: false };
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); audio().resume();
        el.classList.add('pressed'); fire();
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      }, opt);
      const up = e => { e.preventDefault(); el.classList.remove('pressed'); };
      el.addEventListener('pointerup', up, opt);
      el.addEventListener('pointercancel', up, opt);
      el.addEventListener('contextmenu', e => e.preventDefault());
    },

    _bindRift() {
      const cv = render().cv, opt = { passive: false };
      cv.addEventListener('pointerdown', e => {
        if (!this.enabled || game().paused || e.pointerType === 'mouse') return;
        if (riftId !== null) return;
        e.preventDefault(); audio().resume();
        riftId = e.pointerId;
        const I = input(), p = cvCoords(e);
        I.mouse.x = p.x; I.mouse.y = p.y;                 // aim the throw at the tapped point
        I.mouse.rmb = true; I.rmbDownAt = performance.now();
        I.pressed.add('__RMBDOWN');
        try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      }, opt);
      cv.addEventListener('pointermove', e => {
        if (e.pointerId !== riftId) return;
        const I = input(), p = cvCoords(e);
        I.mouse.x = p.x; I.mouse.y = p.y;
      }, opt);
      const end = e => {
        if (e.pointerId !== riftId) return;
        e.preventDefault();
        const I = input();
        I.mouse.rmb = false; I.rmbDownAt = -1;
        I.pressed.add('__RMBUP');                          // release: teleport (unless a hold-recall consumed it)
        riftId = null;
      };
      cv.addEventListener('pointerup', end, opt);
      cv.addEventListener('pointercancel', end, opt);
    },

    _deactivateInput() {
      const I = input();
      I.touch.ax = 0; I.touch.az = 0;
      if (riftId !== null || I.mouse.rmb) { I.mouse.rmb = false; I.rmbDownAt = -1; }
      riftId = null; joyId = null;
      if (knobEl) knobEl.style.transform = 'translate(-50%,-50%)';
    },

    syncUI(force) {
      if (!built) return;
      const G = game();
      const playing = (G.mode === 'fight' || G.mode === 'tutorial') && !G.paused;
      const wantMenu = playing;                 // hamburger: visible in any live gameplay, hidden when paused
      const wantCtrl = playing && this.enabled;  // touch controls: only when opted in
      if (force || wantMenu !== menuShown) {
        menuShown = wantMenu;
        if (menuBtn) menuBtn.style.display = wantMenu ? 'flex' : 'none';
      }
      if (force || wantCtrl !== ctrlShown) {
        ctrlShown = wantCtrl;
        if (ctrlEl) ctrlEl.style.display = wantCtrl ? 'block' : 'none';
        if (!wantCtrl) this._deactivateInput();
      }
    }
  };
  return Mobile;
});
