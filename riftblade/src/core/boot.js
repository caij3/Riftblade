'use strict';
/* boot — wires the page together and starts the loop. Exposed as a module so the
   entry point (src/index.js) only needs to call boot.start(). Keeping the canvas
   at a fixed 1280x720 internal resolution (CSS stretches it to fill the viewport,
   so there is never any letterboxing). */
RB.define('boot', function (require) {
  function fitCanvas() {
    const cv = document.getElementById('game');
    cv.width = 1280; cv.height = 720;
  }
  function start() {
    const Render = require('render'), Input = require('input'), Audio2 = require('audio'),
          UI = require('ui'), World = require('world'), Player = require('player'),
          Game = require('game'), CONFIG = require('config');
    addEventListener('resize', fitCanvas);
    fitCanvas();
    Render.init();
    Input.init(Render.cv);
    Audio2.init();
    UI.init();
    UI.updateBossRushBtn();
    addEventListener('pointerdown', () => Audio2.resume(), { once: true });
    World.reset(CONFIG.tutorial.arena);
    Player.reset(0, 5);
    Game.toMenu();
    requestAnimationFrame(t => { Game.last = t; Game.loop(t); });
  }
  return { start, fitCanvas };
});
