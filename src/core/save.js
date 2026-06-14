'use strict';
/* save — in-memory persistence stand-in (swap for localStorage when shipping). */
RB.define('save', function () {
  return { bossRushUnlocked: false, bestTime: null };
});
