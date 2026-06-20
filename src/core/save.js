'use strict';
/* save — in-memory persistence stand-in (swap for localStorage when shipping). */
RB.define('save', function () {
  return {
    bossRushUnlocked: false, bestTime: null, bossesBeaten: {}, bestBossTimes: {}, campaignProgress: 0,
    // Persisted in-progress campaign run: accumulates per-boss clear times, deaths and hits
    // across the WHOLE campaign so leaving mid-run and resuming keeps the scores of bosses
    // already beaten. Checkpointed each time a campaign boss falls; cleared when a fresh
    // campaign starts or the campaign is completed.
    campaignRun: { clearTimes: {}, deaths: 0, hitsTaken: 0 }
  };
});
