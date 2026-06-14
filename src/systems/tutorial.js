'use strict';
/* tutorial — the training-rites objective tracker. Private: the objective list +
   combo counter. Reaches player()/weapon()/input() to detect completion and
   game()/ui()/audio() to advance. */
RB.define('tutorial', function (require) {
  const player = () => require('player');
  const weapon = () => require('weapon');
  const game = () => require('game');
  const ui = () => require('ui');
  const audio = () => require('audio');

  const Tutorial = {
    objectives: [
      { id: 'combo', label: 'Land the full 3-hit combo', done: false },
      { id: 'throw', label: 'Riftthrow: strike the effigy (RMB)', done: false },
      { id: 'teleport', label: 'Teleport to your blade (RMB again)', done: false },
      { id: 'riftstrike', label: 'Riftstrike a lodged blade', done: false },
      { id: 'recall', label: 'Recall the blade (hold RMB 0.6 s)', done: false },
      { id: 'dodge', label: 'Dodge with i-frames (Shift)', done: false }
    ],
    comboCount: 0, allDone: false,
    reset() { this.objectives.forEach(o => o.done = false); this.comboCount = 0; this.allDone = false; this.renderList(); },
    onMeleeHit() { this.comboCount++; if (this.comboCount >= 3) this.complete('combo'); },
    complete(id) {
      const o = this.objectives.find(o => o.id === id);
      if (!o || o.done) return;
      o.done = true; audio().sfx('ui'); this.renderList();
      if (this.objectives.every(o => o.done) && !this.allDone) {
        this.allDone = true;
        ui().toast('RITES COMPLETE — press Enter to face the Warden', 5);
      }
    },
    renderList() {
      const ul = document.getElementById('objList'); ul.innerHTML = '';
      for (const o of this.objectives) {
        const li = document.createElement('li'); li.textContent = o.label;
        if (o.done) li.classList.add('done'); ul.appendChild(li);
      }
    },
    update() {
      if (player().dodgeT >= 0) this.complete('dodge');
      if (weapon().state === 'returning') this.complete('recall');
      if (require('input').justPressed('Enter')) game().startCampaign();
    }
  };
  return Tutorial;
});
