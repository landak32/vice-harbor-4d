// WebAudio, all synthesised: engine hum pitched by speed, gunshots, sirens, footsteps, city
// ambience, UI clicks and a looping radio track. The context starts on the first user gesture.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.started = false;
    this.engine = null;
    this.siren = null;
    this.ambience = null;
    this.radio = null;
    this.muted = false;
    this.volume = 0.55;
  }

  /** Must be called from a real user gesture (click / keydown). */
  start() {
    if (this.started) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.started = true;
    this.buildEngine();
    this.buildAmbience();
    this.buildRadio();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  noiseBuffer(seconds = 2) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  buildEngine() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 30;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    sub.start();
    this.engine = { osc, sub, filter, gain };
  }

  buildAmbience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    this.ambience = { src, gain, filter };
  }

  /** A slow, warm four-chord loop on a triangle lead with a soft bass. */
  buildRadio() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);
    const chords = [
      [220, 261.6, 329.6],
      [196, 246.9, 293.7],
      [174.6, 220, 261.6],
      [196, 233.1, 293.7],
    ];
    const bass = [110, 98, 87.3, 98];
    const play = (freqs, when, dur) => {
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(0.055 / (i + 1), when + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        o.connect(g);
        g.connect(out);
        o.start(when);
        o.stop(when + dur + 0.05);
      });
    };
    const bassNote = (f, when, dur) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.07, when + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g);
      g.connect(out);
      o.start(when);
      o.stop(when + dur + 0.05);
    };
    this.radio = { out, chords, bass, play, bassNote, next: 0, playing: false, gain: out };
  }

  startRadio() {
    if (!this.started || !this.radio || this.radio.playing) return;
    const r = this.radio;
    r.playing = true;
    r.out.gain.value = 0.9;
    r.next = this.ctx.currentTime + 0.1;
    const schedule = () => {
      if (!r.playing) return;
      const now = this.ctx.currentTime;
      while (r.next < now + 1.2) {
        const bar = Math.floor(r.next / 1.6) % r.chords.length;
        r.play(r.chords[bar], r.next, 1.5);
        r.bassNote(r.bass[bar], r.next, 1.4);
        r.next += 1.6;
      }
      setTimeout(schedule, 400);
    };
    schedule();
  }

  stopRadio() {
    if (this.radio) {
      this.radio.playing = false;
      this.radio.out.gain.value = 0;
    }
  }

  /** speed in m/s, throttle 0..1, driving boolean. */
  updateEngine(driving, speed, throttle) {
    if (!this.engine || !this.started) return;
    const e = this.engine;
    const t = this.ctx.currentTime;
    const kmh = Math.abs(speed) * 3.6;
    const target = driving ? 48 + Math.min(150, kmh * 1.25) + throttle * 22 : 0;
    e.osc.frequency.setTargetAtTime(target, t, 0.08);
    e.sub.frequency.setTargetAtTime(target * 0.5, t, 0.08);
    e.filter.frequency.setTargetAtTime(320 + Math.min(1400, kmh * 8), t, 0.1);
    e.gain.gain.setTargetAtTime(driving ? 0.075 : 0, t, 0.12);
  }

  startSiren() {
    if (!this.started) return;
    if (this.siren) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 720;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    gain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.2);
    this.siren = { osc, gain, t: 0 };
  }

  stopSiren() {
    if (!this.siren) return;
    this.siren.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    const s = this.siren;
    setTimeout(() => s.osc.stop(), 400);
    this.siren = null;
  }

  updateSiren(dt) {
    if (!this.siren) return;
    this.siren.t += dt;
    const f = 640 + (Math.sin(this.siren.t * 5.2) > 0 ? 220 : 0);
    this.siren.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
  }

  /** One-shot effects, synthesised per call. */
  play(name) {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const noise = () => {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuffer(0.4);
      return s;
    };
    const env = (gain, peak, attack, decay) => {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(peak, t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    };
    if (name === 'pistol' || name === 'smg' || name === 'shotgun') {
      const s = noise();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = name === 'shotgun' ? 900 : name === 'smg' ? 2400 : 1800;
      const g = ctx.createGain();
      env(g, name === 'shotgun' ? 0.5 : 0.32, 0.004, name === 'shotgun' ? 0.26 : 0.12);
      s.connect(f);
      f.connect(g);
      g.connect(this.master);
      s.start(t);
      s.stop(t + 0.5);
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(name === 'shotgun' ? 120 : 240, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      const og = ctx.createGain();
      env(og, 0.18, 0.003, 0.12);
      o.connect(og);
      og.connect(this.master);
      o.start(t);
      o.stop(t + 0.2);
    } else if (name === 'punch') {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
      const g = ctx.createGain();
      env(g, 0.3, 0.004, 0.1);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.2);
    } else if (name === 'footstep') {
      const s = noise();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 420;
      f.Q.value = 1.2;
      const g = ctx.createGain();
      env(g, 0.1, 0.004, 0.07);
      s.connect(f);
      f.connect(g);
      g.connect(this.master);
      s.start(t);
      s.stop(t + 0.16);
    } else if (name === 'horn') {
      for (const fr of [392, 494]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        const g = ctx.createGain();
        env(g, 0.13, 0.02, 0.5);
        o.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + 0.6);
      }
    } else if (name === 'click') {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(440, t + 0.05);
      const g = ctx.createGain();
      env(g, 0.12, 0.002, 0.06);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.1);
    } else if (name === 'reload') {
      for (const [delay, freq] of [[0, 700], [0.18, 420], [0.4, 900]]) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + delay);
        g.gain.linearRampToValueAtTime(0.08, t + delay + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.08);
        o.connect(g);
        g.connect(this.master);
        o.start(t + delay);
        o.stop(t + delay + 0.1);
      }
    } else if (name === 'crash') {
      const s = noise();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      const g = ctx.createGain();
      env(g, 0.4, 0.005, 0.35);
      s.connect(f);
      f.connect(g);
      g.connect(this.master);
      s.start(t);
      s.stop(t + 0.6);
    } else if (name === 'hit') {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(320, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.09);
      const g = ctx.createGain();
      env(g, 0.16, 0.003, 0.09);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.15);
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }
}
