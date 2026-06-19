'use strict';
/* boot — wires the page together and starts the loop. Exposed as a module so the
   entry point (src/index.js) only needs to call boot.start(). The canvas keeps a
   fixed 1280x720 internal resolution (the renderer assumes it). By default the
   on-screen element is stretched to fill the viewport; if "Stretch to fill screen"
   is turned off in Settings, it's sized to the largest 16:9 box that fits and
   centered instead, preserving aspect ratio (letterboxed). Either way the bitmap
   fills the canvas element box, so the pointer→canvas mapping stays exact. */
RB.define('boot', function (require) {
  function fitCanvas() {
    const cv = document.getElementById('game');
    cv.width = 1280; cv.height = 720;                       // internal resolution — fixed
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 720;
    if (require('game').settings.stretch !== false) {        // default: stretch to fill
      cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
    } else {                                                 // preserve aspect (letterbox)
      const s = Math.min(vw / 1280, vh / 720);
      cv.style.width = Math.round(1280 * s) + 'px';
      cv.style.height = Math.round(720 * s) + 'px';
    }
  }
  function start() {
    const Render = require('render'), Input = require('input'), Audio2 = require('audio'),
          UI = require('ui'), World = require('world'), Player = require('player'),
          Game = require('game'), CONFIG = require('config');
    addEventListener('resize', fitCanvas);
    addEventListener('orientationchange', () => { fitCanvas(); setTimeout(fitCanvas, 300); });
    fitCanvas();
    Render.init();
    Input.init(Render.cv);
    Audio2.init();
    UI.init();
    require('mobile').init();
    UI.updateBossRushBtn();
    addEventListener('pointerdown', () => Audio2.resume(), { once: true });
    World.reset(CONFIG.tutorial.arena);
    Player.reset(0, 5);
    Game.toMenu();
    requestAnimationFrame(t => { Game.last = t; Game.loop(t); });
  }
  return { start, fitCanvas };
});
