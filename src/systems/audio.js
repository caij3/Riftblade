'use strict';
/* audio — runtime Web Audio synthesis. Private: AudioContext graph, noise buffer,
   the tone/hiss/env builders. Public: init/resume/sfx/music/stopMusic/applyVols
   plus the live `vols` object that the settings UI tweaks. */
RB.define('audio', function () {
  const Audio2 = {
    ctx: null, master: null, sfxBus: null, musicBus: null, musicNodes: [],
    vols: { master: 0.8, music: 0.6, sfx: 0.85 },
    init() {
        try {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
          this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
          this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
          this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
          this._noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
          const d = this._noiseBuf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          this.applyVols();
        } catch (e) { this.ctx = null; }
    },
    noise(dur) {
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuf;
        return src;
    },
    applyVols() {
      if (!this.ctx) return;
      this.master.gain.value = this.vols.master;
      this.sfxBus.gain.value = this.vols.sfx;
      this.musicBus.gain.value = this.vols.music * 0.5;
    },
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    env(node, t0, a, peak, dur) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      node.connect(g); g.connect(this.sfxBus); return g;
    },
    sfx(name) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const c = this.ctx, t = c.currentTime;
      const tone = (type, f0, f1, dur, peak, a = 0.005) => {
        const o = c.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
        this.env(o, t, a, peak, dur); o.start(t); o.stop(t + dur + .02);
      };
      const hiss = (dur, peak, fc0, fc1, q = 1) => {
        const n = this.noise(dur), f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
        f.frequency.setValueAtTime(fc0, t); f.frequency.exponentialRampToValueAtTime(fc1, t + dur);
        n.connect(f); this.env(f, t, 0.004, peak, dur); n.start(t); n.stop(t + dur + .02);
      };
      switch (name) {
        case 'swing': hiss(0.16, 0.5, 2400, 700, 2.5); break;
        case 'swing2': hiss(0.18, 0.55, 2900, 600, 2.5); break;
        case 'hit': tone('triangle', 220, 70, 0.14, 0.7); hiss(0.07, 0.45, 3000, 1200, 1); break;
        case 'heavyhit': tone('triangle', 160, 45, 0.22, 0.9); hiss(0.1, 0.5, 2200, 700, 1); break;
        case 'throw': hiss(0.3, 0.5, 900, 3400, 4); break;
        case 'stick': tone('square', 600, 180, 0.08, 0.35); break;
        case 'lodge': tone('sawtooth', 300, 90, 0.16, 0.5); hiss(0.08, 0.4, 2600, 1000, 1); break;
        case 'teleport': tone('sine', 300, 1500, 0.22, 0.55); hiss(0.22, 0.3, 1200, 6000, 3); break;
        case 'riftstrike': tone('sine', 1400, 200, 0.3, 0.8); tone('triangle', 130, 50, 0.3, 0.8); hiss(0.18, 0.5, 4000, 800, 1); break;
        case 'recall': hiss(0.25, 0.4, 3500, 1100, 4); break;
        case 'dodge': hiss(0.14, 0.4, 1500, 400, 2); break;
        case 'dodgefail': tone('square', 200, 160, 0.12, 0.3); break;
        case 'playerhit': tone('sawtooth', 180, 60, 0.25, 0.8); hiss(0.12, 0.5, 1800, 500, 1); break;
        case 'slam': tone('sine', 90, 30, 0.5, 1.1); hiss(0.25, 0.7, 700, 150, 0.8); break;
        case 'sweep': hiss(0.3, 0.7, 1000, 250, 1.5); break;
        case 'fire': hiss(0.6, 0.5, 600, 300, 0.6); break;
        case 'coal': tone('square', 500, 240, 0.18, 0.35); break;
        case 'shard': tone('sine', 1900, 1100, 0.18, 0.3); break;
        case 'stagger': tone('square', 350, 80, 0.4, 0.7); break;
        case 'phase': tone('sawtooth', 60, 200, 1.2, 0.7, 0.2); hiss(1.0, 0.4, 300, 2000, 1); break;
        case 'echodie': tone('sine', 900, 2200, 0.4, 0.5); break;
        case 'death': tone('sawtooth', 220, 40, 1.4, 0.9, 0.05); break;
        case 'victory': [392, 494, 587, 784].forEach((f, i) => {
          const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
          const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + i * 0.12);
          g.gain.linearRampToValueAtTime(0.3, t + i * 0.12 + 0.04);
          g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 1.6);
          o.connect(g); g.connect(this.sfxBus); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 1.7);
        }); break;
        case 'ui': tone('sine', 700, 900, 0.08, 0.2); break;
      }
    },
    stopMusic() { this.musicNodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} }); this.musicNodes = []; },
    music(theme) {
      if (!this.ctx) return; this.stopMusic();
      const c = this.ctx, t = c.currentTime;
      const mk = (type, freq, gain, detune = 0) => {
        const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
        const g = c.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(gain, t + 3);
        o.connect(g); g.connect(this.musicBus); o.start();
        this.musicNodes.push(o, g); return { o, g };
      };
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      lp.connect(this.musicBus); this.musicNodes.push(lp);
      const drone = (f, gain, det) => { const { o, g } = mk('sawtooth', f, 0); g.disconnect(); g.connect(lp); g.gain.linearRampToValueAtTime(gain, t + 3); return o; };
      if (theme === 'menu') { mk('sine', 55, 0.12); drone(110, 0.05, 0); drone(110.7, 0.05, 0); }
      else if (theme === 'warden') { mk('sine', 49, 0.14); drone(98, 0.07); drone(146.8, 0.05); drone(98.6, 0.06);
        const lfo = c.createOscillator(); lfo.frequency.value = 0.13; const lg = c.createGain(); lg.gain.value = 250;
        lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); this.musicNodes.push(lfo, lg); }
      else if (theme === 'choir') { mk('sine', 61.7, 0.1); drone(123.5, 0.05); drone(185, 0.045); drone(196, 0.04); drone(124.2, 0.05);
        const lfo = c.createOscillator(); lfo.frequency.value = 0.21; const lg = c.createGain(); lg.gain.value = 380;
        lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); this.musicNodes.push(lfo, lg); }
      else if (theme === 'tutorial') { mk('sine', 65.4, 0.1); drone(130.8, 0.05); drone(196, 0.035); }
    }
  };
  return Audio2;
});
