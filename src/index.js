'use strict';
/* index — entry point. Loaded LAST, after every RB.define has registered. It
   resolves the boot module and starts the game; nothing else lives here. */
RB.require('boot').start();
